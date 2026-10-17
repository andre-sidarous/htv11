import { describe, expect, it } from "vitest";
import { SUPPORT_CALL_SCRIPT } from "@/lib/constants";
import { scriptedSupportLine } from "./supportCallLine";

const context = {
  guidance: "Head east for about 400 metres to Robarts Library.",
  supportNote: "You're in an area with few public support points. The nearest is Robarts Library, about 400 metres to the east.",
};

describe("scriptedSupportLine", () => {
  it("opens with the script, the support note, and directions", () => {
    expect(scriptedSupportLine(context, 0)).toBe(
      `${SUPPORT_CALL_SCRIPT[0]} ${context.supportNote} If you can, head east for about 400 metres to Robarts Library.`,
    );
  });

  it("repeats only the directions on later check-ins", () => {
    expect(scriptedSupportLine(context, 1)).toBe(`${SUPPORT_CALL_SCRIPT[1]} If you can, head east for about 400 metres to Robarts Library.`);
  });

  it("ends with the plain last line", () => {
    expect(scriptedSupportLine(context, 99)).toBe(SUPPORT_CALL_SCRIPT[SUPPORT_CALL_SCRIPT.length - 1]);
  });

  it("is just the script without context", () => {
    expect(scriptedSupportLine(null, 0)).toBe(SUPPORT_CALL_SCRIPT[0]);
  });
});
