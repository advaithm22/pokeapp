import { describe, expect, it } from "vitest";
import {
  centsToBBString,
  centsToDollarsString,
  dollarsToCents,
  formatMoney,
} from "../shared/src/money.js";

describe("money formatting", () => {
  it("dollarsToCents rounds float input safely", () => {
    expect(dollarsToCents(20)).toBe(2000);
    expect(dollarsToCents(0.1)).toBe(10);
    expect(dollarsToCents(0.2)).toBe(20);
    // 0.1 + 0.2 = 0.30000000000000004 in float; rounding fixes it
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
  });

  it("centsToDollarsString pads cents", () => {
    expect(centsToDollarsString(0)).toBe("$0.00");
    expect(centsToDollarsString(5)).toBe("$0.05");
    expect(centsToDollarsString(120)).toBe("$1.20");
    expect(centsToDollarsString(2000)).toBe("$20.00");
    expect(centsToDollarsString(-50)).toBe("-$0.50");
  });

  it("centsToBBString formats relative to BB", () => {
    expect(centsToBBString(20, 20)).toBe("1 BB");
    expect(centsToBBString(50, 20)).toBe("2.5 BB");
    expect(centsToBBString(100, 20)).toBe("5 BB");
    expect(centsToBBString(0, 20)).toBe("0 BB");
  });

  it("formatMoney chooses based on unit", () => {
    expect(formatMoney(100, "money", 20)).toBe("$1.00");
    expect(formatMoney(100, "bb", 20)).toBe("5 BB");
  });
});
