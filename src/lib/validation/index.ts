import { z } from "zod";

export * from "./events";

/** Join codes are 6 chars from an unambiguous alphabet (see generate_join_code() in SQL). */
export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJKMNP-Z2-9]{6}$/, "Join codes are 6 letters or numbers.");

export const uuidSchema = z.uuid();

export const aiCallContextSchema = z.object({
  displayName: z.string().min(1).max(60),
  locationSummary: z.string().max(200),
  routeDeviationLevel: z.enum(["on_route", "slightly_off", "deviation", "significant_deviation"]).optional(),
  heartRateSummary: z.string().max(200).optional(),
  activity: z.enum(["walking", "running", "stationary", "fall_simulated"]).optional(),
  nearestSupportPoint: z.string().max(200).optional(),
  groupResponded: z.boolean(),
  destinationName: z.string().max(120).optional(),
  guidance: z.string().max(300).optional(),
});
