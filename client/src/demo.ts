import type { Card, PublicSeat, PublicTableState } from "@shared/types";

function seat(over: Partial<PublicSeat> & { seatId: number }): PublicSeat {
  return {
    seatId: over.seatId,
    nickname: over.nickname ?? null,
    stack: over.stack ?? 0,
    bet: over.bet ?? 0,
    inHand: over.inHand ?? false,
    hasFolded: over.hasFolded ?? false,
    isAllIn: over.isAllIn ?? false,
    isConnected: over.isConnected ?? true,
    isAway: over.isAway ?? false,
    isDealer: over.isDealer ?? false,
    isToAct: over.isToAct ?? false,
    holeCards: over.holeCards ?? null,
    shownCardIndices: over.shownCardIndices ?? [],
    owedDeadMoney: over.owedDeadMoney ?? 0,
  };
}

/**
 * 7 players seated, post-flop. Distribution puts the empty seats (3, 6, 9)
 * at upper-left, top-right, and bottom-right so the occupied players are
 * spread evenly around the felt.
 *
 * Hand state:
 *   Dealer = John (seat 5)
 *   SB = David (seat 7), BB = Bigd (seat 8)
 *   Pre-flop: Joe calls, Frank folds, Bob calls, Steve folds,
 *             John calls, David completes, Bigd checks.
 *   Flop A♥ 8♠ 3♥ — David checks, Bigd bets $0.40, action on Joe.
 */
export function makeDemoState(): {
  state: PublicTableState;
  yourCards: Card[];
  yourSeatId: number;
} {
  const board: Card[] = [
    { rank: 14, suit: "h" },
    { rank: 8, suit: "s" },
    { rank: 3, suit: "h" },
  ];
  const yourCards: Card[] = [
    { rank: 7, suit: "c" },
    { rank: 2, suit: "s" },
  ];

  const state: PublicTableState = {
    handId: 42,
    street: "flop",
    phase: "betting",
    board,
    pots: [],
    totalPot: 140,
    toCall: 40,
    minRaise: 20,
    bigBlind: 20,
    smallBlind: 10,
    sevenDeuceBonus: 100,
    dealerSeatId: 5,
    toActSeatId: 0,
    actionDeadline: Date.now() + 27_500,
    showCardsDeadline: null,
    seats: [
      seat({
        seatId: 0,
        nickname: "Joe",
        stack: 980,
        inHand: true,
        isToAct: true,
        holeCards: yourCards,
      }),
      seat({ seatId: 1, nickname: "Frank", stack: 1000, inHand: true, hasFolded: true }),
      seat({ seatId: 2, nickname: "Bob", stack: 980, inHand: true }),
      seat({ seatId: 3 }),
      seat({ seatId: 4, nickname: "Steve", stack: 1000, inHand: true, hasFolded: true }),
      seat({ seatId: 5, nickname: "John", stack: 980, inHand: true, isDealer: true }),
      seat({ seatId: 6 }),
      seat({ seatId: 7, nickname: "David", stack: 980, inHand: true }),
      seat({
        seatId: 8,
        nickname: "Bigd",
        stack: 940,
        inHand: true,
        bet: 40,
      }),
      seat({ seatId: 9 }),
    ],
    history: [],
    fairness: {
      handId: 42,
      serverSeedCommit: "a8c91f2e3d04b56789abcdef0123456789abcdef0123456789abcdef01234567",
      clientSeeds: [
        { seatId: 0, seed: "11" + "0".repeat(62) },
        { seatId: 2, seed: "22" + "0".repeat(62) },
        { seatId: 5, seed: "55" + "0".repeat(62) },
        { seatId: 7, seed: "77" + "0".repeat(62) },
        { seatId: 8, seed: "88" + "0".repeat(62) },
      ],
      serverSeed: null,
      combinedSeed: null,
      deckOrder: null,
    },
    log: [
      "Hand #42 begins · commit a8c91f2e3d04b567…",
      "David posts small blind $0.10",
      "Bigd posts big blind $0.20",
      "Joe calls $0.20",
      "Frank folds",
      "Bob calls $0.20",
      "Steve folds",
      "John calls $0.20",
      "David calls $0.10",
      "Bigd checks",
      "Flop: Ah 8s 3h",
      "David checks",
      "Bigd bets $0.40",
    ],
  };

  return { state, yourCards, yourSeatId: 0 };
}
