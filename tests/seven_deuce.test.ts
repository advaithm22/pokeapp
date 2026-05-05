import { describe, expect, it } from "vitest";
import { is72, compute72Transfers } from "../shared/src/seven_deuce.js";
import type { Card, Suit, Rank } from "../shared/src/types.js";

function c(s: string): Card {
  const r = s[0]!;
  const suit = s[1]! as Suit;
  const rank = (r === "A" ? 14 : r === "K" ? 13 : r === "Q" ? 12 : r === "J" ? 11 : r === "T" ? 10 : Number(r)) as Rank;
  return { rank, suit };
}

describe("is72", () => {
  it("recognizes 72 offsuit", () => {
    expect(is72([c("7h"), c("2c")])).toBe(true);
  });
  it("recognizes 72 suited", () => {
    expect(is72([c("7d"), c("2d")])).toBe(true);
  });
  it("rejects other holdings", () => {
    expect(is72([c("Ah"), c("Kh")])).toBe(false);
    expect(is72([c("7h"), c("3c")])).toBe(false);
    expect(is72([c("8h"), c("2c")])).toBe(false);
  });
});

describe("compute72Transfers", () => {
  const dealtIn = [0, 1, 2, 3];

  it("winner with 72 collects from each non-winner", () => {
    const t = compute72Transfers({
      winnerSeatIds: [0],
      dealtInSeatIds: dealtIn,
      seats: [
        { seatId: 0, holeCards: [c("7h"), c("2c")], stack: 1000 },
        { seatId: 1, holeCards: [c("Ah"), c("Kh")], stack: 1000 },
        { seatId: 2, holeCards: [c("Qd"), c("Jd")], stack: 1000 },
        { seatId: 3, holeCards: [c("3s"), c("3c")], stack: 1000 },
      ],
      bonusCents: 100,
    });
    expect(t).toEqual([
      { fromSeatId: 1, toSeatId: 0, amount: 100 },
      { fromSeatId: 2, toSeatId: 0, amount: 100 },
      { fromSeatId: 3, toSeatId: 0, amount: 100 },
    ]);
  });

  it("no transfers when winner does not have 72", () => {
    const t = compute72Transfers({
      winnerSeatIds: [0],
      dealtInSeatIds: dealtIn,
      seats: [
        { seatId: 0, holeCards: [c("Ah"), c("Kh")], stack: 1000 },
        { seatId: 1, holeCards: [c("7s"), c("2s")], stack: 1000 },
        { seatId: 2, holeCards: [c("Qd"), c("Jd")], stack: 1000 },
        { seatId: 3, holeCards: [c("3s"), c("3c")], stack: 1000 },
      ],
      bonusCents: 100,
    });
    expect(t).toEqual([]);
  });

  it("caps payer's contribution at their stack", () => {
    const t = compute72Transfers({
      winnerSeatIds: [0],
      dealtInSeatIds: [0, 1, 2],
      seats: [
        { seatId: 0, holeCards: [c("7h"), c("2c")], stack: 1000 },
        { seatId: 1, holeCards: [c("Ah"), c("Kh")], stack: 30 }, // less than bonus
        { seatId: 2, holeCards: [c("Qd"), c("Jd")], stack: 0 },  // can't pay
      ],
      bonusCents: 100,
    });
    expect(t).toEqual([{ fromSeatId: 1, toSeatId: 0, amount: 30 }]);
  });

  it("chop with two 72 winners: each collects from non-winners only", () => {
    const t = compute72Transfers({
      winnerSeatIds: [0, 2],
      dealtInSeatIds: [0, 1, 2, 3],
      seats: [
        { seatId: 0, holeCards: [c("7h"), c("2c")], stack: 1000 },
        { seatId: 1, holeCards: [c("Ah"), c("Kh")], stack: 1000 },
        { seatId: 2, holeCards: [c("7d"), c("2d")], stack: 1000 },
        { seatId: 3, holeCards: [c("3s"), c("3c")], stack: 1000 },
      ],
      bonusCents: 100,
    });
    // seat 1 pays 100 to seat 0 then 100 to seat 2; seat 3 likewise. Stacks
    // remain >= 0 throughout.
    expect(t).toEqual([
      { fromSeatId: 1, toSeatId: 0, amount: 100 },
      { fromSeatId: 3, toSeatId: 0, amount: 100 },
      { fromSeatId: 1, toSeatId: 2, amount: 100 },
      { fromSeatId: 3, toSeatId: 2, amount: 100 },
    ]);
  });

  it("does not double-charge a payer who can't cover both winners", () => {
    const t = compute72Transfers({
      winnerSeatIds: [0, 2],
      dealtInSeatIds: [0, 1, 2],
      seats: [
        { seatId: 0, holeCards: [c("7h"), c("2c")], stack: 1000 },
        { seatId: 1, holeCards: [c("Ah"), c("Kh")], stack: 150 }, // covers first bonus, partial for second
        { seatId: 2, holeCards: [c("7d"), c("2d")], stack: 1000 },
      ],
      bonusCents: 100,
    });
    expect(t).toEqual([
      { fromSeatId: 1, toSeatId: 0, amount: 100 },
      { fromSeatId: 1, toSeatId: 2, amount: 50 },
    ]);
  });
});
