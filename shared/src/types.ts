export type Suit = "s" | "h" | "d" | "c";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export type ActionKind = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface PlayerAction {
  kind: ActionKind;
  /** For bet/raise: the "raise to" total in cents. */
  amount?: number;
}

export interface PublicSeat {
  seatId: number;
  nickname: string | null;
  /** Stack in cents. */
  stack: number;
  /** Bet in front of seat this round, in cents. */
  bet: number;
  inHand: boolean;
  hasFolded: boolean;
  isAllIn: boolean;
  isConnected: boolean;
  isAway: boolean;
  isDealer: boolean;
  isToAct: boolean;
  /** Two-element array; null entry = card hidden from the viewer. null = no cards. */
  holeCards: (Card | null)[] | null;
  /** Card indices (0/1) the seat owner has opted to reveal to other players. */
  shownCardIndices: number[];
  /** Dead money the seat owes on next hand for missed blinds (cents). */
  owedDeadMoney: number;
}

export interface PotPart {
  amount: number; // cents
  eligibleSeatIds: number[];
}

export interface FairnessPublic {
  handId: number;
  serverSeedCommit: string;
  clientSeeds: { seatId: number; seed: string }[];
  serverSeed: string | null;
  combinedSeed: string | null;
  deckOrder: number[] | null;
}

export interface PublicTableState {
  handId: number;
  street: Street;
  /** "betting" | "showdown" | "handEnd" | "collectingSeeds" | "waiting" */
  phase: "waiting" | "collectingSeeds" | "betting" | "showdown" | "handEnd";
  board: Card[];
  pots: PotPart[];
  totalPot: number; // cents
  toCall: number; // cents
  minRaise: number; // cents
  bigBlind: number; // cents
  smallBlind: number; // cents
  sevenDeuceBonus: number; // cents
  dealerSeatId: number | null;
  toActSeatId: number | null;
  actionDeadline: number | null;
  /** Window during which players can choose to show cards (epoch ms). */
  showCardsDeadline: number | null;
  seats: PublicSeat[];
  history: HandSummary[];
  fairness: FairnessPublic;
  log: string[];
}

export interface HandSummary {
  handId: number;
  serverSeedCommit: string;
  serverSeed: string;
  clientSeeds: { seatId: number; seed: string }[];
  combinedSeed: string;
  deckOrder: number[];
  board: Card[];
  winners: { seatId: number; nickname: string; amount: number; handDescription: string }[];
  sevenDeuceTransfers: { fromSeatId: number; toSeatId: number; amount: number }[];
  endedAt: number;
}

export interface JoinResult {
  sessionToken: string;
  seatId: number;
  nickname: string;
}

export type CardChoice = 0 | 1;

export interface ServerToClientEvents {
  state: (state: PublicTableState) => void;
  yourCards: (cards: Card[]) => void;
  error: (message: string) => void;
  log: (message: string) => void;
}

export interface ClientToServerEvents {
  hello: (sessionToken: string, ack: (ok: boolean) => void) => void;
  takeSeat: (
    nickname: string,
    buyInCents: number,
    ack: (res: JoinResult | { error: string }) => void,
  ) => void;
  leaveSeat: () => void;
  setAway: (away: boolean) => void;
  addToStack: (amountCents: number, ack: (res: { ok: true } | { error: string }) => void) => void;
  postClientSeed: (seedHex: string) => void;
  act: (action: PlayerAction) => void;
  showCards: (which: CardChoice[]) => void;
  chat: (message: string) => void;
}
