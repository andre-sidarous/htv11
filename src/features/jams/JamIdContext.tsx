import { createContext, useContext, type ReactNode } from "react";

const JamIdContext = createContext<string | null>(null);

export function JamIdProvider({ jamId, children }: { jamId: string; children: ReactNode }) {
  return <JamIdContext.Provider value={jamId}>{children}</JamIdContext.Provider>;
}

/**
 * The active Jam's id, for any screen inside the active-Jam tabs. Reads from context (set once
 * by the tabs layout, which gets it correctly from the URL that opened the tabs) instead of each
 * tab screen's own `useLocalSearchParams()` — a dynamic param from an ancestor folder isn't
 * reliably re-supplied to sibling tabs you reach by tapping the tab bar rather than a fresh URL.
 */
export function useJamId(): string {
  const jamId = useContext(JamIdContext);
  if (!jamId) throw new Error("useJamId must be used within the active-Jam tabs.");
  return jamId;
}
