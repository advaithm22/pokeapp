import { useState } from "react";
import type { PublicTableState } from "@shared/types";

export function FairnessPanel({ state }: { state: PublicTableState }) {
  const [open, setOpen] = useState(false);
  const f = state.fairness;
  return (
    <div style={{ background: "#111", color: "#ddd", padding: 8, borderRadius: 8, marginTop: 12, fontSize: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", color: "#9cf", border: "none", cursor: "pointer", padding: 0 }}
      >
        Provably-fair shuffle {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <div>
            <strong>Hand #{f.handId}</strong>
          </div>
          <div>commit (SHA-256 of server seed): <code>{f.serverSeedCommit || "—"}</code></div>
          <div>
            client seeds:
            <ul style={{ margin: "4px 0 4px 16px" }}>
              {f.clientSeeds.length === 0 && <li>(none yet)</li>}
              {f.clientSeeds.map((cs) => (
                <li key={cs.seatId}>
                  seat {cs.seatId + 1}: <code>{cs.seed.slice(0, 32)}…</code>
                </li>
              ))}
            </ul>
          </div>
          <div>server seed (revealed at end of hand): <code>{f.serverSeed ?? "(not yet)"}</code></div>
          <div>combined seed: <code>{f.combinedSeed ? f.combinedSeed.slice(0, 32) + "…" : "(not yet)"}</code></div>
          {f.deckOrder && (
            <details style={{ marginTop: 4 }}>
              <summary>Deck order (52 indices, post-shuffle)</summary>
              <code style={{ wordBreak: "break-all" }}>{f.deckOrder.join(",")}</code>
            </details>
          )}
          <div style={{ marginTop: 6, opacity: 0.7 }}>
            How to verify: run <code>npm run verify -- &lt;handId&gt;</code> in the project root after the hand
            ends. The script recomputes the combined seed and reproduces the deck, then asserts it matches what was dealt.
          </div>
        </div>
      )}
    </div>
  );
}
