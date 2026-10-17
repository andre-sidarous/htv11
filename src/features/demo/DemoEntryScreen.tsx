import { useState } from "react";
import { useRouter } from "expo-router";
import { Text } from "react-native";
import { Button, Card, Screen } from "@/components/ui";
import { DEMO_ACCOUNT_PASSWORD, DEV_ACCOUNTS } from "@/features/auth/devAccounts";
import { useSession } from "@/features/auth/SessionProvider";
import { useMyJams } from "@/features/jams/useMyJams";
import { campusWalk } from "@/lib/demo/campusWalk";
import { publicEnv } from "@/lib/env";
import { signInWithDevAccount } from "@/lib/supabase/auth";
import { colors, type } from "@/theme";
import { SEEDED_DEMO_CONTEXT, setDemoContext } from "./demoContext";

/**
 * Two paths, per docs/demo.md:
 *  1. Primary — "Demo this Jam": set the demo context to a Jam you're actually running live,
 *     then open P5's Demo Control panel to pick who's "affected".
 *  2. Backup — "Load seeded Campus Walk": if real sign-in fails on stage, pick a role and sign
 *     into the matching seeded account, landing in the pre-built Campus Walk Jam.
 */
export function DemoEntryScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { active, loading: jamsLoading } = useMyJams(session?.user.id);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function demoThisJam(jamId: string, affectedUserId: string) {
    setDemoContext({ jamId, affectedUserId });
    router.push("/demo-control");
  }

  async function loadSeededRole(email: string) {
    setLoading(email);
    setError(null);
    const { error } = await signInWithDevAccount(email, DEMO_ACCOUNT_PASSWORD);
    setLoading(null);
    if (error) {
      setError(error);
      return;
    }
    setDemoContext(SEEDED_DEMO_CONTEXT);
    router.replace(`/jam/${campusWalk.jam.id}/lobby`);
  }

  return (
    <Screen scroll>
      <Text style={type.title}>Demo Mode</Text>

      <Card>
        <Text style={type.heading}>Demo this Huddle</Text>
        <Text style={type.caption}>
          Pick the Huddle you’re running live, then choose who’s “affected” in the Demo Control panel.
        </Text>
        {jamsLoading ? (
          <Text style={type.body}>Loading your Huddles…</Text>
        ) : active.length === 0 ? (
          <Text style={type.body}>No active Huddle yet — create or join one first.</Text>
        ) : (
          active.map((pair) => (
            <Button
              key={pair.jam.id}
              label={pair.jam.name}
              variant="secondary"
              onPress={() => demoThisJam(pair.jam.id, session?.user.id ?? pair.jam.host_id)}
            />
          ))
        )}
      </Card>

      {publicEnv.enableDevLogin ? (
        <Card>
          <Text style={type.heading}>Load seeded Campus Walk</Text>
          <Text style={type.caption}>Backup if real sign-in fails on stage. Pick the role you’re playing.</Text>
          {DEV_ACCOUNTS.map((account) => (
            <Button
              key={account.email}
              label={account.label}
              variant="secondary"
              onPress={() => loadSeededRole(account.email)}
              loading={loading === account.email}
              disabled={loading !== null && loading !== account.email}
            />
          ))}
        </Card>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
