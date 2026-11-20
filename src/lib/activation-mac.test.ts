import { describe, expect, it } from "vitest";
import { isNormalizedActivationMac, normalizeActivationMac } from "./activation-mac";

describe("activation MAC in site and Telegram", () => {
  it.each([
    ["24:FC:E5:0B:03:36", "24:FC:E5:0B:03:36"],
    ["24:fc:e5:0b:03:36", "24:FC:E5:0B:03:36"],
    ["24-FC-E5-0B-03-36", "24:FC:E5:0B:03:36"],
    ["24FCE50B0336", "24:FC:E5:0B:03:36"],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeActivationMac(value)).toBe(expected);
  });
  it.each([
    "", "24:FC:E5:0B:03", "24:FC:E5:0B:03:GG",
    "00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF",
    "24:FC:E5:0B:03:36<script>", "24  FC E5 0B 03 36",
  ])("rejects invalid input %s", value => {
    expect(normalizeActivationMac(value)).toBeNull();
  });
  it("keeps a canonical MAC for the final checkout confirmation", () => {
    expect(isNormalizedActivationMac("24:FC:E5:0B:03:36")).toBe(true);
    expect(isNormalizedActivationMac("24:fc:e5:0b:03:36")).toBe(false);
  });
});
