import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  combinedSeed,
  hexToBuf,
  randomBytesHex,
  sha256Hex,
  shuffleDeck,
} from "../server/src/rng.js";

describe("rng / commit-reveal", () => {
  it("commit matches SHA-256 of server seed", () => {
    const seed = randomBytes(32);
    const commit = sha256Hex(seed);
    expect(commit).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(seed)).toBe(commit); // determinism
  });

  it("reproducible deck given same inputs", () => {
    const serverSeed = randomBytes(32);
    const clientSeeds = [
      { seatId: 0, seed: randomBytes(32) },
      { seatId: 3, seed: randomBytes(32) },
    ];
    const cs1 = combinedSeed({ serverSeed, clientSeeds });
    const cs2 = combinedSeed({ serverSeed, clientSeeds });
    expect(cs1.equals(cs2)).toBe(true);
    const d1 = shuffleDeck(cs1);
    const d2 = shuffleDeck(cs2);
    expect(d1).toEqual(d2);
  });

  it("changing one client seed changes the deck", () => {
    const serverSeed = randomBytes(32);
    const seedsA = [{ seatId: 0, seed: randomBytes(32) }];
    const seedsB = [{ seatId: 0, seed: randomBytes(32) }];
    const dA = shuffleDeck(combinedSeed({ serverSeed, clientSeeds: seedsA }));
    const dB = shuffleDeck(combinedSeed({ serverSeed, clientSeeds: seedsB }));
    // Astronomically unlikely to be equal
    expect(JSON.stringify(dA)).not.toBe(JSON.stringify(dB));
  });

  it("client seed order doesn't matter (sorted by seatId internally)", () => {
    const serverSeed = randomBytes(32);
    const a = { seatId: 0, seed: randomBytes(32) };
    const b = { seatId: 1, seed: randomBytes(32) };
    const cs1 = combinedSeed({ serverSeed, clientSeeds: [a, b] });
    const cs2 = combinedSeed({ serverSeed, clientSeeds: [b, a] });
    expect(cs1.equals(cs2)).toBe(true);
  });

  it("deck has all 52 unique cards", () => {
    const deck = shuffleDeck(randomBytes(32));
    expect(deck.length).toBe(52);
    const set = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(set.size).toBe(52);
  });

  it("hexToBuf rejects bad input", () => {
    expect(() => hexToBuf("not-hex")).toThrow();
    expect(() => hexToBuf("abc")).toThrow(); // odd length
  });

  it("randomBytesHex returns 2n hex chars", () => {
    expect(randomBytesHex(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uniform distribution sanity-check (no obvious bias)", () => {
    // Track first-card distribution across many shuffles. With 52 cards and
    // 5200 trials, expected ≈ 100 per card; allow 3σ slack (~30).
    const counts = new Map<string, number>();
    const trials = 5200;
    for (let i = 0; i < trials; i++) {
      const d = shuffleDeck(randomBytes(32));
      const k = `${d[0]!.rank}${d[0]!.suit}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(52);
    for (const v of counts.values()) {
      expect(v).toBeGreaterThan(50);
      expect(v).toBeLessThan(160);
    }
  });
});
