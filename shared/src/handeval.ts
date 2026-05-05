import type { Card, Rank } from "./types.js";

export const HAND_CATEGORY = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;

export type HandCategory = (typeof HAND_CATEGORY)[keyof typeof HAND_CATEGORY];

export interface HandRank {
  /** [category, ...tiebreakers] — compare lexicographically, higher wins. */
  score: number[];
  category: HandCategory;
  description: string;
  cards: Card[];
}

const RANK_NAME_SINGULAR: Record<Rank, string> = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight",
  9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
const RANK_NAME_PLURAL: Record<Rank, string> = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens", 8: "Eights",
  9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};

function compareRanksDesc(a: number, b: number): number {
  return b - a;
}

export function compareHandRanks(a: HandRank, b: HandRank): number {
  const len = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < len; i++) {
    const av = a.score[i] ?? 0;
    const bv = b.score[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Returns the straight's high card if `ranksDesc` (unique, sorted desc) contains a 5-in-a-row. 0 if none. */
function straightHigh(ranksDesc: number[]): number {
  if (ranksDesc.length < 5) return 0;
  for (let i = 0; i <= ranksDesc.length - 5; i++) {
    const top = ranksDesc[i]!;
    let ok = true;
    for (let k = 1; k < 5; k++) {
      if (ranksDesc[i + k] !== top - k) {
        ok = false;
        break;
      }
    }
    if (ok) return top;
  }
  // wheel: A-2-3-4-5
  if (
    ranksDesc[0] === 14 &&
    ranksDesc.includes(5) &&
    ranksDesc.includes(4) &&
    ranksDesc.includes(3) &&
    ranksDesc.includes(2)
  ) {
    return 5;
  }
  return 0;
}

/** Best 5-card hand from 5–7 cards. */
export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length < 5) throw new Error("need at least 5 cards");

  const ranks = cards.map((c) => c.rank as number);
  const suits = cards.map((c) => c.suit);

  // Rank frequency
  const rankCount = new Map<number, number>();
  for (const r of ranks) rankCount.set(r, (rankCount.get(r) ?? 0) + 1);
  const byCount: { rank: number; count: number }[] = [];
  for (const [r, c] of rankCount) byCount.push({ rank: r, count: c });
  byCount.sort((a, b) => (b.count - a.count) || (b.rank - a.rank));

  // Suit frequency for flush detection
  const suitCount = new Map<string, number>();
  for (const s of suits) suitCount.set(s, (suitCount.get(s) ?? 0) + 1);
  let flushSuit: string | null = null;
  for (const [s, c] of suitCount) if (c >= 5) flushSuit = s;

  // Straight (any suit)
  const uniqRanksDesc = [...new Set(ranks)].sort(compareRanksDesc);
  const straightTop = straightHigh(uniqRanksDesc);

  // Straight flush
  if (flushSuit) {
    const flushRanks = cards
      .filter((c) => c.suit === flushSuit)
      .map((c) => c.rank as number)
      .sort(compareRanksDesc);
    const sfTop = straightHigh([...new Set(flushRanks)].sort(compareRanksDesc));
    if (sfTop > 0) {
      const desc =
        sfTop === 14 ? "Royal Flush" : `Straight Flush, ${RANK_NAME_SINGULAR[sfTop as Rank]}-high`;
      return {
        score: [HAND_CATEGORY.StraightFlush, sfTop],
        category: HAND_CATEGORY.StraightFlush,
        description: desc,
        cards,
      };
    }
  }

  // Quads
  if (byCount[0]!.count === 4) {
    const quadRank = byCount[0]!.rank;
    const kicker = ranks.filter((r) => r !== quadRank).sort(compareRanksDesc)[0]!;
    return {
      score: [HAND_CATEGORY.Quads, quadRank, kicker],
      category: HAND_CATEGORY.Quads,
      description: `Four of a Kind, ${RANK_NAME_PLURAL[quadRank as Rank]}`,
      cards,
    };
  }

  // Full house
  if (byCount[0]!.count === 3 && byCount.length > 1 && byCount[1]!.count >= 2) {
    const tripsRank = byCount[0]!.rank;
    const pairRank = byCount[1]!.rank;
    return {
      score: [HAND_CATEGORY.FullHouse, tripsRank, pairRank],
      category: HAND_CATEGORY.FullHouse,
      description: `Full House, ${RANK_NAME_PLURAL[tripsRank as Rank]} full of ${RANK_NAME_PLURAL[pairRank as Rank]}`,
      cards,
    };
  }

  // Flush
  if (flushSuit) {
    const top5 = cards
      .filter((c) => c.suit === flushSuit)
      .map((c) => c.rank as number)
      .sort(compareRanksDesc)
      .slice(0, 5);
    return {
      score: [HAND_CATEGORY.Flush, ...top5],
      category: HAND_CATEGORY.Flush,
      description: `Flush, ${RANK_NAME_SINGULAR[top5[0] as Rank]}-high`,
      cards,
    };
  }

  // Straight
  if (straightTop > 0) {
    return {
      score: [HAND_CATEGORY.Straight, straightTop],
      category: HAND_CATEGORY.Straight,
      description: `Straight, ${RANK_NAME_SINGULAR[straightTop as Rank]}-high`,
      cards,
    };
  }

  // Trips
  if (byCount[0]!.count === 3) {
    const tripsRank = byCount[0]!.rank;
    const kickers = ranks.filter((r) => r !== tripsRank).sort(compareRanksDesc).slice(0, 2);
    return {
      score: [HAND_CATEGORY.Trips, tripsRank, ...kickers],
      category: HAND_CATEGORY.Trips,
      description: `Three of a Kind, ${RANK_NAME_PLURAL[tripsRank as Rank]}`,
      cards,
    };
  }

  // Two pair
  if (byCount[0]!.count === 2 && byCount.length > 1 && byCount[1]!.count === 2) {
    const high = byCount[0]!.rank;
    const low = byCount[1]!.rank;
    const kicker = ranks.filter((r) => r !== high && r !== low).sort(compareRanksDesc)[0]!;
    return {
      score: [HAND_CATEGORY.TwoPair, high, low, kicker],
      category: HAND_CATEGORY.TwoPair,
      description: `Two Pair, ${RANK_NAME_PLURAL[high as Rank]} and ${RANK_NAME_PLURAL[low as Rank]}`,
      cards,
    };
  }

  // One pair
  if (byCount[0]!.count === 2) {
    const pairRank = byCount[0]!.rank;
    const kickers = ranks.filter((r) => r !== pairRank).sort(compareRanksDesc).slice(0, 3);
    return {
      score: [HAND_CATEGORY.Pair, pairRank, ...kickers],
      category: HAND_CATEGORY.Pair,
      description: `Pair of ${RANK_NAME_PLURAL[pairRank as Rank]}`,
      cards,
    };
  }

  // High card
  const top5 = ranks.slice().sort(compareRanksDesc).slice(0, 5);
  return {
    score: [HAND_CATEGORY.HighCard, ...top5],
    category: HAND_CATEGORY.HighCard,
    description: `${RANK_NAME_SINGULAR[top5[0] as Rank]} High`,
    cards,
  };
}
