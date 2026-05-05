import { describe, expect, it } from "vitest";
import {
  compareHandRanks,
  describeHandStrength,
  evaluateHand,
  HAND_CATEGORY,
} from "../shared/src/handeval.js";
import type { Card, Suit, Rank } from "../shared/src/types.js";

function c(s: string): Card {
  // "Ah" "Td" "2s"
  const r = s[0]!;
  const suit = s[1]! as Suit;
  const rank = (r === "A" ? 14 : r === "K" ? 13 : r === "Q" ? 12 : r === "J" ? 11 : r === "T" ? 10 : Number(r)) as Rank;
  return { rank, suit };
}
function hand(...ss: string[]): Card[] {
  return ss.map(c);
}

describe("hand evaluator", () => {
  it("identifies royal flush", () => {
    const r = evaluateHand(hand("Ah", "Kh", "Qh", "Jh", "Th", "2c", "3d"));
    expect(r.category).toBe(HAND_CATEGORY.StraightFlush);
    expect(r.score[1]).toBe(14);
  });

  it("identifies wheel straight (A-2-3-4-5)", () => {
    const r = evaluateHand(hand("Ah", "2c", "3d", "4s", "5h", "Kc", "Qd"));
    expect(r.category).toBe(HAND_CATEGORY.Straight);
    expect(r.score[1]).toBe(5);
  });

  it("ranks four of a kind above full house", () => {
    const quads = evaluateHand(hand("Ah", "Ad", "As", "Ac", "Kh", "Kc", "2d"));
    const boat = evaluateHand(hand("Ah", "Ad", "As", "Kh", "Kc", "2d", "3c"));
    expect(compareHandRanks(quads, boat)).toBeGreaterThan(0);
  });

  it("ranks full house by trips rank then pair rank", () => {
    const a = evaluateHand(hand("Kh", "Kd", "Ks", "2h", "2c", "3d", "4s"));
    const b = evaluateHand(hand("Qh", "Qd", "Qs", "Ah", "Ac", "3d", "4s"));
    expect(compareHandRanks(a, b)).toBeGreaterThan(0); // KKK22 > QQQAA
  });

  it("breaks two-pair tie by kicker", () => {
    const a = evaluateHand(hand("Ah", "Ad", "Kh", "Kc", "Qh", "2d", "3c")); // AAKKQ
    const b = evaluateHand(hand("Ah", "Ad", "Kh", "Kc", "Jh", "2d", "3c")); // AAKKJ
    expect(compareHandRanks(a, b)).toBeGreaterThan(0);
  });

  it("flush beats straight", () => {
    const flush = evaluateHand(hand("2h", "5h", "9h", "Jh", "Kh", "3c", "4d"));
    const straight = evaluateHand(hand("9c", "Td", "Jh", "Qs", "Kc", "2d", "3c"));
    expect(compareHandRanks(flush, straight)).toBeGreaterThan(0);
  });

  it("picks best 5 from 7", () => {
    // Trip aces with king kicker, ignoring lower cards
    const r = evaluateHand(hand("Ah", "Ad", "As", "Kh", "2c", "3d", "4s"));
    expect(r.category).toBe(HAND_CATEGORY.Trips);
    expect(r.score[1]).toBe(14);
    expect(r.score[2]).toBe(13);
    expect(r.score[3]).toBe(4);
  });

  it("identifies straight flush over plain flush", () => {
    const r = evaluateHand(hand("5h", "6h", "7h", "8h", "9h", "Ad", "Kc"));
    expect(r.category).toBe(HAND_CATEGORY.StraightFlush);
    expect(r.score[1]).toBe(9);
  });
});

describe("describeHandStrength", () => {
  it("returns null with fewer than 2 hole cards", () => {
    expect(describeHandStrength([], [])).toBeNull();
    expect(describeHandStrength(hand("Ah"), [])).toBeNull();
  });

  it("preflop pocket pair", () => {
    expect(describeHandStrength(hand("Ah", "Ad"), [])).toBe("Pocket Aces");
    expect(describeHandStrength(hand("7c", "7s"), [])).toBe("Pocket Sevens");
  });

  it("preflop suited / offsuit non-pair", () => {
    expect(describeHandStrength(hand("Kh", "Th"), [])).toBe("King-Ten suited");
    expect(describeHandStrength(hand("Ah", "Kc"), [])).toBe("Ace-King offsuit");
    expect(describeHandStrength(hand("7s", "2c"), [])).toBe("Seven-Two offsuit");
  });

  it("falls back to evaluator on flop and later", () => {
    expect(describeHandStrength(hand("Ah", "Kc"), hand("Ad", "8s", "3h"))).toBe(
      "Pair of Aces",
    );
    expect(
      describeHandStrength(hand("7c", "2s"), hand("Ah", "8s", "3h", "Kd", "2d")),
    ).toBe("Pair of Twos");
    expect(
      describeHandStrength(hand("Ah", "Kh"), hand("Qh", "Jh", "Th", "2c", "3d")),
    ).toBe("Royal Flush");
  });
});
