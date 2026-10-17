"use client";

import { useSyncExternalStore } from "react";
import { demoActions } from "@/features/demo/demoActions";
import type { DemoAction } from "@/lib/types";

const empty: DemoAction[] = [];

/** Live list of registered demo actions (for P5's Demo Control panel). */
export function useDemoActions(): DemoAction[] {
  return useSyncExternalStore(demoActions.subscribe, demoActions.list, () => empty);
}
