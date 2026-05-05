import type { Card, Rank, Suit } from "./types.js";

export const SUITS: Suit[] = ["s", "h", "d", "c"];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function buildSortedDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push({ rank: r, suit: s });
  }
  return deck;
}

export function cardIndex(card: Card): number {
  const r = (card.rank as number) - 2;
  const s = SUITS.indexOf(card.suit);
  return s * 13 + r;
}

export function cardFromIndex(i: number): Card {
  const s = SUITS[Math.floor(i / 13)]!;
  const r = ((i % 13) + 2) as Rank;
  return { rank: r, suit: s };
}

export function cardToString(c: Card): string {
  const rankStr =
    c.rank === 14 ? "A" : c.rank === 13 ? "K" : c.rank === 12 ? "Q" : c.rank === 11 ? "J" : c.rank === 10 ? "T" : String(c.rank);
  return rankStr + c.suit;
}
