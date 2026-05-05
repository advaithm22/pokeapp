import type { Card } from "./types.js";

/** True iff the two-card hand contains a 7 and a 2 (any suits). */
export function is72(cards: Card[]): boolean {
  if (cards.length < 2) return false;
  const ranks = cards.map((c) => c.rank as number);
  return ranks.includes(7) && ranks.includes(2);
}

export interface SeatStateFor72 {
  seatId: number;
  holeCards: Card[];
  stack: number;
}

export interface SevenDeuceTransfer {
  fromSeatId: number;
  toSeatId: number;
  amount: number;
}

/**
 * Pure function: compute who pays the 7-2 bonus to whom, capped at each
 * payer's stack. Returns a list of transfers; callers apply them.
 *
 * Rule: every winner with 7+2 hole cards collects `bonusCents` from every
 * non-winning seat that was dealt into the hand. Caps at the payer's stack.
 */
export function compute72Transfers(args: {
  winnerSeatIds: number[];
  dealtInSeatIds: number[];
  seats: SeatStateFor72[];
  bonusCents: number;
}): SevenDeuceTransfer[] {
  const { winnerSeatIds, dealtInSeatIds, seats, bonusCents } = args;
  const winnerSet = new Set(winnerSeatIds);
  const seatById = new Map(seats.map((s) => [s.seatId, s]));
  const transfers: SevenDeuceTransfer[] = [];

  // Track running stack adjustments so we don't over-charge a payer who owes
  // multiple winners (rare, but possible in chops where multiple winners hold 72).
  const remainingStack = new Map<number, number>();
  for (const s of seats) remainingStack.set(s.seatId, s.stack);

  for (const winnerId of winnerSeatIds) {
    const winner = seatById.get(winnerId);
    if (!winner || !is72(winner.holeCards)) continue;
    for (const dealtId of dealtInSeatIds) {
      if (winnerSet.has(dealtId)) continue;
      const payerStack = remainingStack.get(dealtId) ?? 0;
      const pay = Math.min(bonusCents, payerStack);
      if (pay <= 0) continue;
      remainingStack.set(dealtId, payerStack - pay);
      transfers.push({ fromSeatId: dealtId, toSeatId: winnerId, amount: pay });
    }
  }
  return transfers;
}
