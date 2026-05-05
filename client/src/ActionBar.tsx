import { useEffect, useMemo, useState } from "react";
import type { PublicTableState } from "@shared/types";
import { formatMoney } from "@shared/money";
import { getSocket } from "./socket";
import type { DisplayUnit } from "./session";

export function ActionBar({
  state,
  yourSeatId,
  unit,
}: {
  state: PublicTableState;
  yourSeatId: number;
  unit: DisplayUnit;
}) {
  const seat = state.seats.find((s) => s.seatId === yourSeatId);
  const isToAct = state.toActSeatId === yourSeatId;
  const toCall = state.toCall;
  const bb = state.bigBlind;

  const minRaiseTo = useMemo(() => {
    if (!seat) return 0;
    const currentBet = Math.max(...state.seats.map((s) => s.bet), 0);
    if (currentBet === 0) return state.bigBlind;
    return currentBet + state.minRaise;
  }, [state, seat]);

  const maxRaiseTo = seat ? seat.bet + seat.stack : 0;

  const [raiseTo, setRaiseTo] = useState<number>(minRaiseTo);
  useEffect(() => {
    setRaiseTo(Math.min(Math.max(minRaiseTo, 0), maxRaiseTo));
  }, [minRaiseTo, maxRaiseTo, state.handId, state.street]);

  if (!seat) return null;

  const sock = getSocket();
  const send = (kind: "fold" | "check" | "call" | "bet" | "raise" | "allin", amount?: number) => {
    sock.emit("act", { kind, amount });
  };

  const currentBet = Math.max(...state.seats.map((s) => s.bet), 0);
  const isOpening = currentBet === 0;
  const fmt = (c: number) => formatMoney(c, unit, bb);

  // Input mode: when in BB-mode, the user types BBs and we convert to cents.
  const displayValue = unit === "bb" ? raiseTo / bb : raiseTo / 100;
  const onInputChange = (v: number) => {
    if (!Number.isFinite(v)) return;
    const cents = unit === "bb" ? Math.round(v * bb) : Math.round(v * 100);
    setRaiseTo(Math.max(0, cents));
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: 12,
        background: "#1a1a1a",
        borderRadius: 8,
        opacity: isToAct ? 1 : 0.5,
        flexWrap: "wrap",
      }}
    >
      <button onClick={() => send("fold")} disabled={!isToAct}>
        Fold
      </button>
      {toCall === 0 ? (
        <button onClick={() => send("check")} disabled={!isToAct}>
          Check
        </button>
      ) : (
        <button onClick={() => send("call")} disabled={!isToAct}>
          Call {fmt(toCall)}
        </button>
      )}
      <span style={{ color: "#888", fontSize: 12 }}>{unit === "bb" ? "BB" : "$"}</span>
      <input
        type="number"
        step={unit === "bb" ? 0.5 : 0.01}
        value={Number.isFinite(displayValue) ? displayValue : 0}
        onChange={(e) => onInputChange(Number(e.target.value))}
        style={{ width: 100 }}
        disabled={!isToAct}
      />
      <button
        onClick={() => send(isOpening ? "bet" : "raise", raiseTo)}
        disabled={!isToAct || raiseTo < Math.min(minRaiseTo, maxRaiseTo) || raiseTo > maxRaiseTo}
      >
        {isOpening ? `Bet ${fmt(raiseTo)}` : `Raise to ${fmt(raiseTo)}`}
      </button>
      <button onClick={() => send("allin")} disabled={!isToAct}>
        All-in {fmt(maxRaiseTo)}
      </button>
      <span style={{ color: "#888", fontSize: 12, marginLeft: "auto" }}>
        Pot {fmt(state.totalPot)}
      </span>
      {isToAct && state.actionDeadline && <Countdown deadline={state.actionDeadline} />}
    </div>
  );
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span style={{ marginLeft: 8, color: remaining <= 5 ? "#e74c3c" : "#aaa" }}>{remaining}s</span>;
}
