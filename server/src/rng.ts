import { createHash, createHmac, randomBytes } from "node:crypto";
import { buildSortedDeck } from "../../shared/src/deck.js";
import type { Card } from "../../shared/src/types.js";

/**
 * Provably-fair shuffle.
 *
 * Pre-hand:
 *   1. Server picks `serverSeed` (32 random bytes) and publishes
 *      `commit = SHA-256(serverSeed)` to all seated players.
 *   2. Each seated player submits a `clientSeed` (any bytes, hex-encoded).
 *
 * Combined seed:
 *   combinedSeed = SHA-256( serverSeed || sortBySeat(clientSeeds).join("") )
 *
 * Shuffle:
 *   Fisher-Yates over a 52-card deck. The random index for swap step `i`
 *   uses a counter-based PRF:
 *     stream(i) = HMAC-SHA-256(combinedSeed, "shuffle:" + i)
 *   Read 8 bytes, treat as a uint64, reject samples that fall outside the
 *   largest multiple of (i+1) <= 2^64 to avoid modulo bias, then take mod.
 *
 * Post-hand:
 *   Server reveals `serverSeed`. Anyone can recompute `combinedSeed` and
 *   the deck order, then verify it matches what was dealt.
 */

export function sha256Hex(data: Buffer | string): string {
  const h = createHash("sha256");
  h.update(data);
  return h.digest("hex");
}

export function hexToBuf(hex: string): Buffer {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("invalid hex");
  }
  return Buffer.from(hex, "hex");
}

export interface CommitInputs {
  serverSeed: Buffer;
  clientSeeds: { seatId: number; seed: Buffer }[];
}

export function combinedSeed(inputs: CommitInputs): Buffer {
  const sorted = [...inputs.clientSeeds].sort((a, b) => a.seatId - b.seatId);
  const h = createHash("sha256");
  h.update(inputs.serverSeed);
  for (const cs of sorted) {
    // length-prefix each contribution so concatenation is unambiguous
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(cs.seed.length, 0);
    h.update(lenBuf);
    h.update(cs.seed);
  }
  return h.digest();
}

const TWO_POW_64 = 1n << 64n;

function uniformIndex(seed: Buffer, counter: number, n: number): number {
  const limit = BigInt(n);
  const max = TWO_POW_64 - (TWO_POW_64 % limit);
  let attempt = 0;
  while (true) {
    const tag = `shuffle:${counter}:${attempt}`;
    const stream = createHmac("sha256", seed).update(tag).digest();
    const v = stream.readBigUInt64BE(0);
    if (v < max) return Number(v % limit);
    attempt++;
  }
}

/** Fisher-Yates shuffle of a fresh 52-card deck driven by `seed`. */
export function shuffleDeck(seed: Buffer): Card[] {
  const deck = buildSortedDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = uniformIndex(seed, i, i + 1);
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}

export function randomBytesHex(n: number): string {
  return randomBytes(n).toString("hex");
}
