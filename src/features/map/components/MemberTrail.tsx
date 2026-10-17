import { memo, useSyncExternalStore } from "react";
import { Polyline } from "react-native-maps";
import { toMapCoord } from "@/components/map/JamMapView";
import type { MemberStore } from "../memberStore";
import { profileColor } from "../memberAppearance";

/** A member's actual path (breadcrumb) since the map opened. */
export const MemberTrail = memo(function MemberTrail({ store, userId }: { store: MemberStore; userId: string }) {
  const member = useSyncExternalStore(
    (listener) => store.subscribe(userId, listener),
    () => store.get(userId),
    () => store.get(userId),
  );
  if (!member || member.trail.length < 2) return null;
  return (
    <Polyline
      coordinates={member.trail.map(toMapCoord)}
      strokeColor={profileColor(userId)}
      strokeWidth={3}
      lineDashPattern={[2, 6]}
      zIndex={4}
    />
  );
});
