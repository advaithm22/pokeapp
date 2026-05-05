import { EventEmitter } from "node:events";
import type {
  Card,
  CardChoice,
  PlayerAction,
  PublicTableState,
  PublicSeat,
  Street,
  HandSummary,
  PotPart,
  FairnessPublic,
} from "../../shared/src/types.js";
import { cardIndex } from "../../shared/src/deck.js";
import { centsToDollarsString } from "../../shared/src/money.js";
import { evaluateHand, compareHandRanks } from "../../shared/src/handeval.js";
import { compute72Transfers } from "../../shared/src/seven_deuce.js";
import {
  combinedSeed,
  hexToBuf,
  randomBytesHex,
  sha256Hex,
  shuffleDeck,
} from "./rng.js";

// All money values are integer cents.
const NUM_SEATS = 10;
const SMALL_BLIND_CENTS = 10;
const BIG_BLIND_CENTS = 20;
const MIN_BUYIN_CENTS = 20 * BIG_BLIND_CENTS; // $4
const MAX_BUYIN_CENTS = 100_000; // $1000
const SEVEN_DEUCE_BONUS_CENTS = 100; // $1, taken from each non-winning dealt-in opponent
const ACTION_CLOCK_MS = 30_000;
const SEED_COLLECTION_MS = 3_000;
const HAND_END_DELAY_MS = 8_000; // window to choose whether to show cards
const HISTORY_KEEP = 20;

interface InternalSeat {
  seatId: number;
  sessionToken: string | null;
  nickname: string | null;
  stack: number; // cents
  isAway: boolean;
  isConnected: boolean;
  /** Owed for missed blinds while away — paid into pot when they next sit in. */
  owedDeadMoney: number; // cents
  /** Used to detect "they were away for at least one hand since last active". */
  wasAwayDuringHand: boolean;
  /** Pending top-ups requested mid-hand; applied between hands. */
  pendingAddCents: number;

  // Per-hand state
  inHand: boolean;
  hasFolded: boolean;
  isAllIn: boolean;
  holeCards: Card[];
  /** Card indices (0 and/or 1) the player has chosen to show post-hand. */
  shownCardIndices: CardChoice[];

  // Per-round state
  bet: number; // cents committed this round
  committed: number; // cents committed this hand total
  hasActed: boolean;
}

type Phase = "waiting" | "collectingSeeds" | "betting" | "showdown" | "handEnd";

export interface TableEvents {
  state: () => void;
  privateCards: (sessionToken: string, cards: Card[]) => void;
  log: (message: string) => void;
}

export declare interface Table {
  on<K extends keyof TableEvents>(event: K, listener: TableEvents[K]): this;
  emit<K extends keyof TableEvents>(event: K, ...args: Parameters<TableEvents[K]>): boolean;
}

export class Table extends EventEmitter {
  private seats: InternalSeat[];
  private dealerSeatId: number | null = null;
  private handId = 0;
  private street: Street = "preflop";
  private phase: Phase = "waiting";
  private board: Card[] = [];
  private deck: Card[] = [];
  private deckCursor = 0;

  private currentBet = 0;
  private lastFullRaise = BIG_BLIND_CENTS;
  private toActSeatId: number | null = null;
  private actionDeadline: number | null = null;
  private actionTimer: NodeJS.Timeout | null = null;

  // Snapshot of who was dealt in this hand (for 7-2 bonus and showcards eligibility)
  private dealtInSeatIds: number[] = [];

  // Fairness state
  private serverSeedHex: string | null = null;
  private serverSeedCommit: string | null = null;
  private clientSeedsBySeat = new Map<number, string>();
  private combinedSeedHex: string | null = null;
  private deckOrderIdx: number[] | null = null;
  private seedDeadlineTimer: NodeJS.Timeout | null = null;

  private history: HandSummary[] = [];
  private handEndTimer: NodeJS.Timeout | null = null;
  private showCardsDeadline: number | null = null;
  private logLines: string[] = [];

  constructor() {
    super();
    this.seats = [];
    for (let i = 0; i < NUM_SEATS; i++) {
      this.seats.push({
        seatId: i,
        sessionToken: null,
        nickname: null,
        stack: 0,
        isAway: false,
        isConnected: false,
        owedDeadMoney: 0,
        wasAwayDuringHand: false,
        pendingAddCents: 0,
        inHand: false,
        hasFolded: false,
        isAllIn: false,
        holeCards: [],
        shownCardIndices: [],
        bet: 0,
        committed: 0,
        hasActed: false,
      });
    }
  }

  // -------- session/seat management --------

  seatBySession(sessionToken: string): InternalSeat | undefined {
    return this.seats.find((s) => s.sessionToken === sessionToken);
  }

  takeSeat(
    sessionToken: string,
    nickname: string,
    buyInCents: number,
  ): { seatId: number; nickname: string } | { error: string } {
    const trimmed = nickname.trim().slice(0, 20);
    if (trimmed.length < 1) return { error: "nickname too short" };
    if (this.seats.some((s) => s.sessionToken === sessionToken)) {
      return { error: "already seated" };
    }
    if (this.seats.some((s) => s.nickname?.toLowerCase() === trimmed.toLowerCase())) {
      return { error: "nickname taken" };
    }
    if (!Number.isInteger(buyInCents)) return { error: "buy-in must be integer cents" };
    if (buyInCents < MIN_BUYIN_CENTS) {
      return { error: `min buy-in is ${centsToDollarsString(MIN_BUYIN_CENTS)}` };
    }
    if (buyInCents > MAX_BUYIN_CENTS) {
      return { error: `max buy-in is ${centsToDollarsString(MAX_BUYIN_CENTS)}` };
    }
    const seat = this.seats.find((s) => s.sessionToken === null);
    if (!seat) return { error: "table full" };
    seat.sessionToken = sessionToken;
    seat.nickname = trimmed;
    seat.stack = buyInCents;
    seat.isAway = false;
    seat.isConnected = true;
    seat.owedDeadMoney = 0;
    seat.wasAwayDuringHand = false;
    seat.pendingAddCents = 0;
    this.log(`${trimmed} sat down at seat ${seat.seatId + 1} with ${centsToDollarsString(buyInCents)}`);
    this.emit("state");
    this.maybeStartHand();
    return { seatId: seat.seatId, nickname: trimmed };
  }

  leaveSeat(sessionToken: string): void {
    const seat = this.seatBySession(sessionToken);
    if (!seat) return;
    if (seat.inHand && !seat.hasFolded) {
      seat.hasFolded = true;
      seat.hasActed = true;
      this.log(`${seat.nickname} left mid-hand (folded)`);
      this.advanceAfterAction();
    } else {
      this.log(`${seat.nickname} left the table`);
    }
    seat.sessionToken = null;
    seat.nickname = null;
    seat.stack = 0;
    seat.inHand = false;
    seat.isConnected = false;
    seat.holeCards = [];
    seat.shownCardIndices = [];
    seat.owedDeadMoney = 0;
    seat.wasAwayDuringHand = false;
    seat.pendingAddCents = 0;
    this.emit("state");
  }

  setConnected(sessionToken: string, connected: boolean): void {
    const seat = this.seatBySession(sessionToken);
    if (seat) {
      seat.isConnected = connected;
      this.emit("state");
    }
  }

  setAway(sessionToken: string, away: boolean): void {
    const seat = this.seatBySession(sessionToken);
    if (!seat) return;
    if (seat.isAway === away) return;
    if (!away && seat.wasAwayDuringHand) {
      // Coming back after missing at least one hand → owe one BB on return.
      // Simple approximation of "you should have paid a BB/SB while away".
      seat.owedDeadMoney += BIG_BLIND_CENTS;
      seat.wasAwayDuringHand = false;
      this.log(
        `${seat.nickname} returns from away — owes ${centsToDollarsString(BIG_BLIND_CENTS)} dead blind`,
      );
    }
    seat.isAway = away;
    this.log(`${seat.nickname} is now ${away ? "AWAY" : "active"}`);
    this.emit("state");
    if (!away) this.maybeStartHand();
  }

  addToStack(
    sessionToken: string,
    amountCents: number,
  ): { ok: true } | { error: string } {
    const seat = this.seatBySession(sessionToken);
    if (!seat) return { error: "not seated" };
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { error: "amount must be positive integer cents" };
    }
    if (seat.stack + seat.pendingAddCents + amountCents > MAX_BUYIN_CENTS * 2) {
      return { error: "stack would exceed cap" };
    }
    if (seat.inHand) {
      seat.pendingAddCents += amountCents;
      this.log(
        `${seat.nickname} added ${centsToDollarsString(amountCents)} (applies after current hand)`,
      );
    } else {
      seat.stack += amountCents;
      this.log(
        `${seat.nickname} added ${centsToDollarsString(amountCents)} to stack (now ${centsToDollarsString(seat.stack)})`,
      );
      this.maybeStartHand();
    }
    this.emit("state");
    return { ok: true };
  }

  showCards(sessionToken: string, which: CardChoice[]): void {
    if (this.phase !== "showdown" && this.phase !== "handEnd") return;
    const seat = this.seatBySession(sessionToken);
    if (!seat) return;
    if (!this.dealtInSeatIds.includes(seat.seatId)) return;
    if (seat.holeCards.length === 0) return;
    // Dedupe and validate
    const wanted = [...new Set(which)].filter((i): i is CardChoice => i === 0 || i === 1);
    seat.shownCardIndices = wanted;
    if (wanted.length > 0) {
      const cardStr = wanted
        .map((i) => seat.holeCards[i])
        .filter((c): c is Card => !!c)
        .map((c) => `${c.rank === 14 ? "A" : c.rank === 13 ? "K" : c.rank === 12 ? "Q" : c.rank === 11 ? "J" : c.rank === 10 ? "T" : c.rank}${c.suit}`)
        .join(" ");
      this.log(`${seat.nickname} shows ${cardStr}`);
    }
    this.emit("state");
  }

  postClientSeed(sessionToken: string, seedHex: string): void {
    if (this.phase !== "collectingSeeds") return;
    const seat = this.seatBySession(sessionToken);
    if (!seat || !seat.inHand) return;
    try {
      hexToBuf(seedHex);
    } catch {
      return;
    }
    this.clientSeedsBySeat.set(seat.seatId, seedHex);
    this.emit("state");
    if (this.allSeatedHandSeedsIn()) {
      this.finishSeedCollection();
    }
  }

  // -------- hand lifecycle --------

  private eligibleForNewHand(seat: InternalSeat): boolean {
    return seat.sessionToken !== null && !seat.isAway && seat.stack + seat.pendingAddCents - seat.owedDeadMoney > 0;
  }

  private maybeStartHand(): void {
    if (this.phase !== "waiting") return;
    const ready = this.seats.filter((s) => this.eligibleForNewHand(s));
    if (ready.length < 2) return;
    this.startHand();
  }

  private startHand(): void {
    this.handId += 1;
    this.street = "preflop";
    this.board = [];
    this.deckCursor = 0;
    this.currentBet = 0;
    this.lastFullRaise = BIG_BLIND_CENTS;
    this.toActSeatId = null;
    this.actionDeadline = null;
    this.showCardsDeadline = null;
    this.clientSeedsBySeat.clear();
    this.combinedSeedHex = null;
    this.deckOrderIdx = null;

    // Apply any pending top-ups
    for (const s of this.seats) {
      if (s.pendingAddCents > 0) {
        s.stack += s.pendingAddCents;
        s.pendingAddCents = 0;
      }
    }

    // Reset per-hand seat state (preserve owedDeadMoney and isAway)
    for (const s of this.seats) {
      s.inHand = false;
      s.hasFolded = false;
      s.isAllIn = false;
      s.holeCards = [];
      s.shownCardIndices = [];
      s.bet = 0;
      s.committed = 0;
      s.hasActed = false;
    }

    const eligible = this.seats.filter((s) => this.eligibleForNewHand(s));
    if (eligible.length < 2) {
      this.phase = "waiting";
      this.emit("state");
      return;
    }
    for (const s of eligible) s.inHand = true;
    this.dealtInSeatIds = eligible.map((s) => s.seatId).sort((a, b) => a - b);

    // Mark away seats as having missed this hand (for missed-blind tracking)
    for (const s of this.seats) {
      if (s.sessionToken !== null && s.isAway) s.wasAwayDuringHand = true;
    }

    // Charge any owed dead money into the pot before blinds
    for (const s of eligible) {
      if (s.owedDeadMoney > 0) {
        const pay = Math.min(s.owedDeadMoney, s.stack);
        s.stack -= pay;
        s.committed += pay;
        s.owedDeadMoney -= pay;
        this.log(`${s.nickname} posts ${centsToDollarsString(pay)} dead blind`);
      }
    }

    // Rotate dealer
    const eligibleIds = this.dealtInSeatIds;
    if (this.dealerSeatId === null) {
      this.dealerSeatId = eligibleIds[0]!;
    } else {
      this.dealerSeatId = this.nextSeatIdAmong(eligibleIds, this.dealerSeatId);
    }

    this.serverSeedHex = randomBytesHex(32);
    this.serverSeedCommit = sha256Hex(hexToBuf(this.serverSeedHex));
    this.phase = "collectingSeeds";
    this.log(
      `Hand #${this.handId} begins · commit ${this.serverSeedCommit.slice(0, 16)}…`,
    );
    this.emit("state");

    if (this.seedDeadlineTimer) clearTimeout(this.seedDeadlineTimer);
    this.seedDeadlineTimer = setTimeout(() => this.finishSeedCollection(), SEED_COLLECTION_MS);
  }

  private allSeatedHandSeedsIn(): boolean {
    return this.dealtInSeatIds.every((id) => this.clientSeedsBySeat.has(id));
  }

  private finishSeedCollection(): void {
    if (this.phase !== "collectingSeeds") return;
    if (this.seedDeadlineTimer) {
      clearTimeout(this.seedDeadlineTimer);
      this.seedDeadlineTimer = null;
    }
    for (const id of this.dealtInSeatIds) {
      if (!this.clientSeedsBySeat.has(id)) {
        const fallback = sha256Hex(`fallback:hand:${this.handId}:seat:${id}`);
        this.clientSeedsBySeat.set(id, fallback);
      }
    }
    const cs = [...this.clientSeedsBySeat.entries()].map(([seatId, seed]) => ({
      seatId,
      seed: hexToBuf(seed),
    }));
    const combined = combinedSeed({ serverSeed: hexToBuf(this.serverSeedHex!), clientSeeds: cs });
    this.combinedSeedHex = combined.toString("hex");
    this.deck = shuffleDeck(combined);
    this.deckOrderIdx = this.deck.map(cardIndex);

    const order = this.actionOrderFromAfter(this.dealerSeatId!).filter((id) => this.seats[id]!.inHand);
    for (let pass = 0; pass < 2; pass++) {
      for (const sid of order) {
        this.seats[sid]!.holeCards.push(this.draw());
      }
    }
    for (const sid of order) {
      const seat = this.seats[sid]!;
      if (seat.sessionToken) this.emit("privateCards", seat.sessionToken, seat.holeCards);
    }

    this.postBlinds();
    this.phase = "betting";
    this.beginStreetAction("preflop");
    this.emit("state");
  }

  private postBlinds(): void {
    const eligibleIds = this.dealtInSeatIds;
    let sbId: number;
    let bbId: number;
    if (eligibleIds.length === 2) {
      sbId = this.dealerSeatId!;
      bbId = this.nextSeatIdAmong(eligibleIds, sbId);
    } else {
      sbId = this.nextSeatIdAmong(eligibleIds, this.dealerSeatId!);
      bbId = this.nextSeatIdAmong(eligibleIds, sbId);
    }
    this.postBet(sbId, Math.min(SMALL_BLIND_CENTS, this.seats[sbId]!.stack), "small blind");
    this.postBet(bbId, Math.min(BIG_BLIND_CENTS, this.seats[bbId]!.stack), "big blind");
    this.currentBet = BIG_BLIND_CENTS;
    this.lastFullRaise = BIG_BLIND_CENTS;
  }

  private postBet(seatId: number, amount: number, label: string): void {
    const s = this.seats[seatId]!;
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    s.bet += pay;
    s.committed += pay;
    if (s.stack === 0) s.isAllIn = true;
    this.log(`${s.nickname} posts ${label} ${centsToDollarsString(pay)}`);
  }

  private draw(): Card {
    const c = this.deck[this.deckCursor]!;
    this.deckCursor += 1;
    return c;
  }

  // -------- betting rounds --------

  private beginStreetAction(street: Street): void {
    this.street = street;
    const order = this.actionOrderFromAfter(this.dealerSeatId!);
    const inHandOrder = order.filter((id) => this.canAct(id));
    if (inHandOrder.length <= 1 && street !== "preflop") {
      this.advanceStreet();
      return;
    }
    if (street === "preflop") {
      let firstId: number;
      if (this.dealtInSeatIds.length === 2) {
        firstId = this.dealerSeatId!;
      } else {
        const sbId = this.nextSeatIdAmong(this.dealtInSeatIds, this.dealerSeatId!);
        const bbId = this.nextSeatIdAmong(this.dealtInSeatIds, sbId);
        firstId = this.nextSeatIdAmong(this.dealtInSeatIds, bbId);
      }
      this.toActSeatId = this.findCanActFrom(firstId);
    } else {
      this.toActSeatId = this.findCanActFrom(
        this.nextSeatIdAmong(this.dealtInSeatIds, this.dealerSeatId!),
      );
    }
    this.armActionClock();
  }

  private armActionClock(): void {
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionDeadline = Date.now() + ACTION_CLOCK_MS;
    this.actionTimer = setTimeout(() => this.handleTimeout(), ACTION_CLOCK_MS);
  }

  private handleTimeout(): void {
    if (this.toActSeatId === null) return;
    const s = this.seats[this.toActSeatId]!;
    if (this.toCallFor(s) === 0) this.act(s.sessionToken!, { kind: "check" });
    else this.act(s.sessionToken!, { kind: "fold" });
  }

  private canAct(seatId: number): boolean {
    const s = this.seats[seatId]!;
    return s.inHand && !s.hasFolded && !s.isAllIn;
  }

  private findCanActFrom(startId: number): number | null {
    const ids = this.dealtInSeatIds;
    if (ids.length === 0) return null;
    let cur = startId;
    for (let i = 0; i < ids.length + 1; i++) {
      if (this.canAct(cur)) return cur;
      cur = this.nextSeatIdAmong(ids, cur);
    }
    return null;
  }

  private toCallFor(seat: InternalSeat): number {
    return Math.max(0, this.currentBet - seat.bet);
  }

  act(sessionToken: string, action: PlayerAction): { ok: true } | { ok: false; error: string } {
    if (this.phase !== "betting") return { ok: false, error: "not betting phase" };
    const seat = this.seatBySession(sessionToken);
    if (!seat) return { ok: false, error: "no seat" };
    if (seat.seatId !== this.toActSeatId) return { ok: false, error: "not your turn" };
    if (!this.canAct(seat.seatId)) return { ok: false, error: "cannot act" };

    const toCall = this.toCallFor(seat);

    switch (action.kind) {
      case "fold": {
        seat.hasFolded = true;
        seat.hasActed = true;
        this.log(`${seat.nickname} folds`);
        break;
      }
      case "check": {
        if (toCall !== 0) return { ok: false, error: "cannot check" };
        seat.hasActed = true;
        this.log(`${seat.nickname} checks`);
        break;
      }
      case "call": {
        if (toCall === 0) {
          seat.hasActed = true;
          this.log(`${seat.nickname} checks`);
        } else {
          const pay = Math.min(toCall, seat.stack);
          seat.stack -= pay;
          seat.bet += pay;
          seat.committed += pay;
          if (seat.stack === 0) seat.isAllIn = true;
          seat.hasActed = true;
          this.log(`${seat.nickname} calls ${centsToDollarsString(pay)}${seat.isAllIn ? " (all-in)" : ""}`);
        }
        break;
      }
      case "bet":
      case "raise":
      case "allin": {
        let raiseTo: number;
        if (action.kind === "allin") {
          raiseTo = seat.bet + seat.stack;
        } else {
          if (typeof action.amount !== "number") return { ok: false, error: "missing amount" };
          raiseTo = Math.floor(action.amount);
        }
        if (raiseTo <= seat.bet) return { ok: false, error: "amount must be greater than current bet" };
        if (raiseTo - seat.bet > seat.stack) return { ok: false, error: "not enough chips" };

        const isOpening = this.currentBet === 0;
        const goingAllIn = raiseTo - seat.bet === seat.stack;
        if (isOpening) {
          if (!goingAllIn && raiseTo < BIG_BLIND_CENTS) {
            return { ok: false, error: `min bet is ${centsToDollarsString(BIG_BLIND_CENTS)}` };
          }
        } else {
          const minRaiseTo = this.currentBet + this.lastFullRaise;
          if (!goingAllIn && raiseTo < minRaiseTo) {
            return { ok: false, error: `min raise to ${centsToDollarsString(minRaiseTo)}` };
          }
        }

        const pay = raiseTo - seat.bet;
        seat.stack -= pay;
        seat.bet = raiseTo;
        seat.committed += pay;
        if (seat.stack === 0) seat.isAllIn = true;

        const raiseSize = raiseTo - this.currentBet;
        const isFullRaise = raiseSize >= this.lastFullRaise;
        if (raiseTo > this.currentBet) {
          if (isFullRaise) {
            this.lastFullRaise = raiseSize;
            for (const s of this.seats) {
              if (s.inHand && !s.hasFolded && s.seatId !== seat.seatId && !s.isAllIn) {
                s.hasActed = false;
              }
            }
          }
          this.currentBet = raiseTo;
        }
        seat.hasActed = true;
        const verb = isOpening ? "bets" : "raises to";
        this.log(`${seat.nickname} ${verb} ${centsToDollarsString(raiseTo)}${seat.isAllIn ? " (all-in)" : ""}`);
        break;
      }
    }

    this.advanceAfterAction();
    return { ok: true };
  }

  private advanceAfterAction(): void {
    const stillIn = this.seats.filter((s) => s.inHand && !s.hasFolded);
    if (stillIn.length === 1) {
      this.endHandUncontested(stillIn[0]!);
      return;
    }
    const needAction = this.seats.filter((s) => s.inHand && !s.hasFolded && !s.isAllIn);
    const roundDone =
      needAction.length === 0 || needAction.every((s) => s.hasActed);
    if (roundDone) {
      this.advanceStreet();
      return;
    }
    this.toActSeatId = this.findCanActFrom(
      this.nextSeatIdAmong(this.dealtInSeatIds, this.toActSeatId!),
    );
    this.armActionClock();
    this.emit("state");
  }

  private advanceStreet(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    this.actionDeadline = null;
    for (const s of this.seats) {
      s.bet = 0;
      s.hasActed = false;
    }
    this.currentBet = 0;
    this.lastFullRaise = BIG_BLIND_CENTS;

    if (this.street === "preflop") {
      this.board.push(this.draw(), this.draw(), this.draw());
      this.log(`Flop: ${this.boardStr(this.board.slice(0, 3))}`);
      this.beginStreetAction("flop");
    } else if (this.street === "flop") {
      this.board.push(this.draw());
      this.log(`Turn: ${this.boardStr([this.board[3]!])}`);
      this.beginStreetAction("turn");
    } else if (this.street === "turn") {
      this.board.push(this.draw());
      this.log(`River: ${this.boardStr([this.board[4]!])}`);
      this.beginStreetAction("river");
    } else if (this.street === "river") {
      this.goToShowdown();
    }
    this.emit("state");
  }

  private boardStr(cards: Card[]): string {
    return cards.map((c) => `${c.rank === 14 ? "A" : c.rank === 13 ? "K" : c.rank === 12 ? "Q" : c.rank === 11 ? "J" : c.rank === 10 ? "T" : c.rank}${c.suit}`).join(" ");
  }

  private endHandUncontested(winner: InternalSeat): void {
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = null;
    this.actionDeadline = null;
    const totalPot = this.seats.reduce((sum, s) => sum + s.committed, 0);
    winner.stack += totalPot;
    this.log(`${winner.nickname} wins ${centsToDollarsString(totalPot)} (uncontested)`);
    this.completeHand([
      {
        seatId: winner.seatId,
        nickname: winner.nickname!,
        amount: totalPot,
        handDescription: "Uncontested",
      },
    ]);
  }

  private goToShowdown(): void {
    this.street = "showdown";
    this.phase = "showdown";
    if (this.actionTimer) clearTimeout(this.actionTimer);
    this.actionTimer = null;
    this.actionDeadline = null;

    const pots = this.computeSidePots();
    const contenders = this.seats.filter((s) => s.inHand && !s.hasFolded);
    const evals = new Map<number, ReturnType<typeof evaluateHand>>();
    for (const s of contenders) {
      evals.set(s.seatId, evaluateHand([...s.holeCards, ...this.board]));
    }

    const winners: HandSummary["winners"] = [];
    for (const pot of pots) {
      const eligibleEvals = pot.eligibleSeatIds
        .filter((id) => evals.has(id))
        .map((id) => ({ seatId: id, hr: evals.get(id)! }));
      if (eligibleEvals.length === 0) continue;
      eligibleEvals.sort((a, b) => compareHandRanks(b.hr, a.hr));
      const top = eligibleEvals[0]!.hr;
      const tied = eligibleEvals.filter((e) => compareHandRanks(e.hr, top) === 0);
      const share = Math.floor(pot.amount / tied.length);
      let remainder = pot.amount - share * tied.length;
      const tiedSorted = [...tied].sort((a, b) => a.seatId - b.seatId);
      for (const t of tiedSorted) {
        const seat = this.seats[t.seatId]!;
        const extra = remainder > 0 ? 1 : 0;
        if (extra) remainder -= 1;
        const amt = share + extra;
        seat.stack += amt;
        winners.push({
          seatId: t.seatId,
          nickname: seat.nickname!,
          amount: amt,
          handDescription: t.hr.description,
        });
        this.log(`${seat.nickname} wins ${centsToDollarsString(amt)} with ${t.hr.description}`);
      }
    }

    this.completeHand(winners);
  }

  private computeSidePots(): PotPart[] {
    const all = this.seats.filter((s) => s.inHand);
    const layers = [...new Set(all.map((s) => s.committed).filter((v) => v > 0))].sort(
      (a, b) => a - b,
    );
    const pots: PotPart[] = [];
    let prev = 0;
    for (const lvl of layers) {
      const delta = lvl - prev;
      const contributors = all.filter((s) => s.committed >= lvl);
      const amount = delta * contributors.length;
      const eligible = contributors.filter((s) => !s.hasFolded).map((s) => s.seatId);
      if (eligible.length > 0) {
        pots.push({ amount, eligibleSeatIds: eligible });
      } else if (pots.length > 0) {
        pots[pots.length - 1]!.amount += amount;
      }
      prev = lvl;
    }
    return pots;
  }

  private apply72Bonus(
    winners: HandSummary["winners"],
  ): HandSummary["sevenDeuceTransfers"] {
    if (winners.length === 0) return [];
    const transfers = compute72Transfers({
      winnerSeatIds: winners.map((w) => w.seatId),
      dealtInSeatIds: this.dealtInSeatIds,
      seats: this.seats
        .filter((s) => this.dealtInSeatIds.includes(s.seatId))
        .map((s) => ({ seatId: s.seatId, holeCards: s.holeCards, stack: s.stack })),
      bonusCents: SEVEN_DEUCE_BONUS_CENTS,
    });
    for (const t of transfers) {
      const from = this.seats[t.fromSeatId]!;
      const to = this.seats[t.toSeatId]!;
      from.stack -= t.amount;
      to.stack += t.amount;
      this.log(`7-2 bonus: ${from.nickname} → ${to.nickname} ${centsToDollarsString(t.amount)}`);
    }
    return transfers;
  }

  private completeHand(winners: HandSummary["winners"]): void {
    const sevenDeuceTransfers = this.apply72Bonus(winners);
    const summary: HandSummary = {
      handId: this.handId,
      serverSeedCommit: this.serverSeedCommit!,
      serverSeed: this.serverSeedHex!,
      clientSeeds: [...this.clientSeedsBySeat.entries()].map(([seatId, seed]) => ({
        seatId,
        seed,
      })),
      combinedSeed: this.combinedSeedHex!,
      deckOrder: this.deckOrderIdx!,
      board: [...this.board],
      winners,
      sevenDeuceTransfers,
      endedAt: Date.now(),
    };
    this.history.unshift(summary);
    if (this.history.length > HISTORY_KEEP) this.history.pop();
    this.log(`Hand #${this.handId} reveal: serverSeed ${this.serverSeedHex!.slice(0, 16)}…`);

    this.phase = "handEnd";
    this.showCardsDeadline = Date.now() + HAND_END_DELAY_MS;
    this.emit("state");

    // Don't auto-sit-out broke players: with custom buy-ins they need a chance to add money.
    if (this.handEndTimer) clearTimeout(this.handEndTimer);
    this.handEndTimer = setTimeout(() => {
      this.phase = "waiting";
      this.showCardsDeadline = null;
      this.maybeStartHand();
      this.emit("state");
    }, HAND_END_DELAY_MS);
  }

  // -------- helpers --------

  private nextSeatIdAmong(ids: number[], from: number): number {
    if (ids.length === 0) throw new Error("no seats");
    const sorted = [...ids].sort((a, b) => a - b);
    for (const id of sorted) {
      if (id > from) return id;
    }
    return sorted[0]!;
  }

  private actionOrderFromAfter(dealerId: number): number[] {
    const ids = this.dealtInSeatIds;
    if (ids.length === 0) return [];
    const out: number[] = [];
    let cur = this.nextSeatIdAmong(ids, dealerId);
    for (let i = 0; i < ids.length; i++) {
      out.push(cur);
      cur = this.nextSeatIdAmong(ids, cur);
    }
    return out;
  }

  private log(line: string): void {
    this.logLines.push(line);
    if (this.logLines.length > 200) this.logLines.shift();
    this.emit("log", line);
  }

  // -------- public state for clients --------

  publicStateFor(sessionToken: string | null): PublicTableState {
    const ownerSeat = sessionToken ? this.seatBySession(sessionToken) : undefined;
    const seats: PublicSeat[] = this.seats.map((s) => ({
      seatId: s.seatId,
      nickname: s.nickname,
      stack: s.stack,
      bet: s.bet,
      inHand: s.inHand,
      hasFolded: s.hasFolded,
      isAllIn: s.isAllIn,
      isConnected: s.isConnected,
      isAway: s.isAway,
      isDealer: this.dealerSeatId === s.seatId,
      isToAct: this.toActSeatId === s.seatId,
      owedDeadMoney: s.owedDeadMoney,
      shownCardIndices: [...s.shownCardIndices],
      holeCards: this.visibleHoleCardsFor(s, ownerSeat ?? null),
    }));

    const pots =
      this.phase === "showdown" || this.phase === "handEnd" ? this.computeSidePots() : [];
    const totalPot = this.seats.reduce((sum, s) => sum + s.committed, 0);

    const fairness: FairnessPublic = {
      handId: this.handId,
      serverSeedCommit: this.serverSeedCommit ?? "",
      clientSeeds: [...this.clientSeedsBySeat.entries()].map(([seatId, seed]) => ({
        seatId,
        seed,
      })),
      serverSeed: this.phase === "showdown" || this.phase === "handEnd" ? this.serverSeedHex : null,
      combinedSeed:
        this.phase === "showdown" || this.phase === "handEnd" ? this.combinedSeedHex : null,
      deckOrder:
        this.phase === "showdown" || this.phase === "handEnd" ? this.deckOrderIdx : null,
    };

    return {
      handId: this.handId,
      street: this.street,
      phase: this.phase,
      board: this.board,
      pots,
      totalPot,
      toCall: ownerSeat ? this.toCallFor(ownerSeat) : 0,
      minRaise: this.lastFullRaise,
      bigBlind: BIG_BLIND_CENTS,
      smallBlind: SMALL_BLIND_CENTS,
      sevenDeuceBonus: SEVEN_DEUCE_BONUS_CENTS,
      dealerSeatId: this.dealerSeatId,
      toActSeatId: this.toActSeatId,
      actionDeadline: this.actionDeadline,
      showCardsDeadline: this.showCardsDeadline,
      seats,
      history: this.history,
      fairness,
      log: [...this.logLines].slice(-60),
    };
  }

  private visibleHoleCardsFor(
    seat: InternalSeat,
    viewer: InternalSeat | null,
  ): (Card | null)[] | null {
    if (seat.holeCards.length === 0) return null;
    // Owner sees their own cards
    if (viewer && viewer.seatId === seat.seatId) {
      return seat.holeCards.slice();
    }
    // Auto-reveal at showdown for non-folded contenders
    if (this.phase === "showdown" && seat.inHand && !seat.hasFolded) {
      return seat.holeCards.slice();
    }
    // Any cards explicitly shown by player
    if (
      (this.phase === "showdown" || this.phase === "handEnd") &&
      seat.shownCardIndices.length > 0
    ) {
      return seat.holeCards.map((c, i) =>
        seat.shownCardIndices.includes(i as CardChoice) ? c : null,
      );
    }
    return null;
  }
}

