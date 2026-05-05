/**
 * Standalone fairness verifier.
 *
 * Usage: tsx scripts/verify.ts <serverSeedHex> <commit> <seatId:seedHex> [<seatId:seedHex>...]
 *
 * Recomputes:
 *   1. SHA-256(serverSeed) and asserts it matches the published commit.
 *   2. The combined seed and the resulting deck order.
 *
 * Prints the post-shuffle deck as 52 card strings (e.g. "Ah", "Ts", "2c").
 */
import { sha256Hex, hexToBuf, combinedSeed, shuffleDeck } from "../server/src/rng.js";
import { cardToString } from "../shared/src/deck.js";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const [, , serverSeedHex, expectedCommit, ...rest] = process.argv;
if (!serverSeedHex || !expectedCommit || rest.length === 0) {
  die(
    "usage: tsx scripts/verify.ts <serverSeedHex> <expectedCommit> <seatId:clientSeedHex> [<seatId:clientSeedHex>...]",
  );
}

const computedCommit = sha256Hex(hexToBuf(serverSeedHex));
if (computedCommit !== expectedCommit) {
  die(`commit mismatch:\n  expected ${expectedCommit}\n  computed ${computedCommit}`);
}
console.log(`✓ commit matches: SHA-256(serverSeed) = ${computedCommit}`);

const clientSeeds = rest.map((s) => {
  const [seatStr, seedHex] = s.split(":");
  if (!seatStr || !seedHex) die(`bad seed arg: ${s}`);
  return { seatId: Number(seatStr), seed: hexToBuf(seedHex) };
});

const cs = combinedSeed({ serverSeed: hexToBuf(serverSeedHex), clientSeeds });
console.log(`✓ combined seed: ${cs.toString("hex")}`);

const deck = shuffleDeck(cs);
console.log("Deck order (top → bottom):");
console.log(deck.map(cardToString).join(" "));
