import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { mockServicesEnabled } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SIMULATED_RECORDING_PREFIX } from "@/services/incident/supabase";
import { registerRecording } from "./incidents";

export type RecordingMode = "off" | "real" | "simulated";

/** Upload to the private bucket at {userId}/{alertId}.m4a. Returns the storage path, or null. */
async function uploadRecording(uri: string, userId: string, alertId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase || mockServicesEnabled) return `${SIMULATED_RECORDING_PREFIX}${userId}/${alertId}.m4a`;
  const path = `${userId}/${alertId}.m4a`;
  try {
    const body = await (await fetch(uri)).arrayBuffer();
    const { error } = await supabase.storage.from(RECORDINGS_BUCKET).upload(path, body, { contentType: "audio/mp4", upsert: true });
    if (error) throw new Error(error.message);
    return path;
  } catch (error) {
    console.warn("[recording] upload failed", error);
    return null;
  }
}

/**
 * Emergency recording for the support call. Only ever starts when the user turned on
 * recording consent, and the screen always shows it. If mic permission is denied or recording
 * fails, it falls back to a simulated recording reference (no audio captured).
 */
export function useCallRecording(input: { userId: string | null }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [mode, setMode] = useState<RecordingMode>("off");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const modeRef = useRef<RecordingMode>("off");
  const resolveRef = useRef<((path: string | null) => void) | null>(null);
  const finishing = useRef<Promise<string | null> | null>(null);
  const alertIdRef = useRef<string | null>(null);

  const begin = useCallback((next: RecordingMode, alertId: string) => {
      alertIdRef.current = alertId;
      modeRef.current = next;
      setMode(next);
      setStartedAt(Date.now());
      finishing.current = null;
      // The incident package waits for this before it's created.
      registerRecording(alertId, new Promise((resolve) => (resolveRef.current = resolve)));
  }, []);

  /** `consent` is the member's recording_consent. Without it, nothing starts. */
  const start = useCallback(async (alertId: string, consent: boolean) => {
    if (!consent || modeRef.current !== "off") return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setNote("Microphone permission is off, so Jam is using a simulated recording.");
        begin("simulated", alertId);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
      begin("real", alertId);
    } catch (error) {
      console.warn("[recording] start failed", error);
      setNote("Recording isn't available on this phone, so Jam is using a simulated recording.");
      begin("simulated", alertId);
    }
  }, [recorder, begin]);

  /** Demo "Simulate AI recording". Still requires consent and is still shown on screen. */
  const startSimulated = useCallback(
    (alertId: string, consent: boolean) => {
      if (!consent || modeRef.current !== "off") return;
      begin("simulated", alertId);
    },
    [begin],
  );

  /**
   * Stop, and upload unless `keep` is false (the user responded: nothing is kept).
   * Resolves with the storage path (or simulated reference). Safe to call twice.
   */
  const stop = useCallback((options: { keep?: boolean } = {}): Promise<string | null> => {
    const keep = options.keep ?? true;
    if (finishing.current) return finishing.current;
    const current = modeRef.current;
    const alertId = alertIdRef.current;
    const userId = input.userId;
    const job = (async () => {
      if (current === "off" || !alertId || !userId) return null;
      if (current === "simulated") return keep ? `${SIMULATED_RECORDING_PREFIX}${userId}/${alertId}.m4a` : null;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        return keep && recorder.uri ? await uploadRecording(recorder.uri, userId, alertId) : null;
      } catch (error) {
        console.warn("[recording] stop failed", error);
        return null;
      }
    })().then((path) => {
      resolveRef.current?.(path);
      resolveRef.current = null;
      modeRef.current = "off";
      setMode("off");
      return path;
    });
    finishing.current = job;
    return job;
  }, [input.userId, recorder]);

  // Never leave the mic on after leaving the screen.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => () => void stopRef.current({ keep: false }), []);

  return { mode, startedAt, note, start, startSimulated, stop };
}
