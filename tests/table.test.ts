import { describe, expect, it } from "vitest";
import { Table } from "../server/src/table.js";

function newTableWithPlayers(n: number): { table: Table; tokens: string[] } {
  const table = new Table();
  const tokens: string[] = [];
  for (let i = 0; i < n; i++) {
    const tok = "tok-" + i.toString().padStart(2, "0").repeat(32).slice(0, 64);
    tokens.push(tok);
    const r = table.takeSeat(tok, `p${i}`, 1000);
    expect("error" in r).toBe(false);
  }
  return { table, tokens };
}

describe("table integration", () => {
  it("starts a hand once 2 players sit down", async () => {
    const { table } = newTableWithPlayers(2);
    // Wait for seed-collection deadline (3s)
    await new Promise((r) => setTimeout(r, 3100));
    const s = table.publicStateFor(null);
    expect(s.handId).toBe(1);
    // After dealing, betting phase: someone is to act
    expect(s.toActSeatId).not.toBeNull();
    expect(s.totalPot).toBeGreaterThan(0);
  });

  it("heads-up SB acts first preflop", async () => {
    const { table, tokens } = newTableWithPlayers(2);
    await new Promise((r) => setTimeout(r, 3100));
    const s = table.publicStateFor(null);
    // Dealer is also SB heads-up; SB acts first
    expect(s.toActSeatId).toBe(s.dealerSeatId);
    void tokens;
  });

  it("uncontested win when others fold", async () => {
    const { table, tokens } = newTableWithPlayers(3);
    await new Promise((r) => setTimeout(r, 3100));
    let s = table.publicStateFor(null);
    // Walk through folds until one player is left
    let safety = 20;
    while (safety-- > 0 && s.toActSeatId !== null) {
      const tok = tokens[s.toActSeatId]!;
      table.act(tok, { kind: "fold" });
      s = table.publicStateFor(null);
      if (s.history.length > 0 && s.history[0]!.handId === 1) break;
    }
    expect(s.history.length).toBeGreaterThan(0);
    expect(s.history[0]!.winners.length).toBe(1);
  }, 10_000);
});
