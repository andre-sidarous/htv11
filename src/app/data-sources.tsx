import { Stack } from "expo-router";
import { DataSourcesScreen } from "@/features/map/DataSourcesScreen";

/** OWNER: P3. Linked from the map's route card. */
export default function DataSourcesRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Data sources" }} />
      <DataSourcesScreen />
    </>
  );
}
