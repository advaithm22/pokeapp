import { useEffect, useMemo, useState } from "react";
import type { CardChoice, PublicTableState, Card } from "@shared/types";
import { dollarsToCents, formatMoney } from "@shared/money";
import {
  ensureSessionToken,
  makeClientSeedHex,
  getNickname,
  setNickname as saveNickname,
  getDisplayUnit,
  setDisplayUnit,
  type DisplayUnit,
} from "./session";
import { getSocket } from "./socket";
import { CardView } from "./Card";
import { PokerTable } from "./PokerTable";
import { ActionBar } from "./ActionBar";
import { FairnessPanel } from "./FairnessPanel";
import { makeDemoState } from "./demo";

const DEMO_MODE = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<PublicTableState | null>(null);
  const [yourCards, setYourCards] = useState<Card[]>([]);
  const [yourSeatId, setYourSeatId] = useState<number | null>(null);
  const [nickname, setNick] = useState(getNickname() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submittedSeedFor, setSubmittedSeedFor] = useState<number | null>(null);
  const [unit, setUnit] = useState<DisplayUnit>(getDisplayUnit());

  useEffect(() => {
    if (DEMO_MODE) {
      const demo = makeDemoState();
      setState(demo.state);
      setYourCards(demo.yourCards);
      setYourSeatId(demo.yourSeatId);
      setConnected(true);
      setToken("demo");
      return;
    }
    ensureSessionToken().then(setToken);
  }, []);

  useEffect(() => {
    if (!token || DEMO_MODE) return;
    const sock = getSocket();
    sock.emit("hello", token, (ok) => {
      setConnected(ok);
    });
    const onState = (s: PublicTableState) => {
      setState(s);
      const stored = getNickname();
      if (stored) {
        const ours = s.seats.find((seat) => seat.nickname?.toLowerCase() === stored.toLowerCase());
        if (ours) setYourSeatId(ours.seatId);
      }
    };
    const onCards = (cards: Card[]) => setYourCards(cards);
    const onError = (msg: string) => setError(msg);
    sock.on("state", onState);
    sock.on("yourCards", onCards);
    sock.on("error", onError);
    return () => {
      sock.off("state", onState);
      sock.off("yourCards", onCards);
      sock.off("error", onError);
    };
  }, [token]);

  // Auto-submit fresh client seed for each new hand
  useEffect(() => {
    if (!state || yourSeatId === null) return;
    if (state.fairness.serverSeed) return;
    if (state.fairness.serverSeedCommit === "") return;
    if (submittedSeedFor === state.handId) return;
    const seedSent = state.fairness.clientSeeds.some((cs) => cs.seatId === yourSeatId);
    if (seedSent) return;
    getSocket().emit("postClientSeed", makeClientSeedHex());
    setSubmittedSeedFor(state.handId);
  }, [state, yourSeatId, submittedSeedFor]);

  const yourSeat = useMemo(() => {
    if (!state || yourSeatId === null) return null;
    return state.seats.find((s) => s.seatId === yourSeatId) ?? null;
  }, [state, yourSeatId]);

  const flipUnit = () => {
    const next: DisplayUnit = unit === "money" ? "bb" : "money";
    setUnit(next);
    setDisplayUnit(next);
  };

  if (!token) return <CenterMsg>Loading session…</CenterMsg>;
  if (!connected) return <CenterMsg>Connecting…</CenterMsg>;
  if (!state) return <CenterMsg>Waiting for table state…</CenterMsg>;

  if (yourSeatId === null || !yourSeat?.nickname) {
    return (
      <BuyInEntry
        nickname={nickname}
        onChangeNickname={setNick}
        error={error}
        bigBlind={state.bigBlind}
        smallBlind={state.smallBlind}
        onSubmit={(buyInDollars) => {
          if (!nickname.trim()) {
            setError("nickname required");
            return;
          }
          const cents = dollarsToCents(buyInDollars);
          setError(null);
          getSocket().emit("takeSeat", nickname.trim(), cents, (res) => {
            if ("error" in res) {
              setError(res.error);
            } else {
              saveNickname(res.nickname);
              setYourSeatId(res.seatId);
            }
          });
        }}
      />
    );
  }

  return (
    <TableView
      state={state}
      yourSeatId={yourSeatId}
      yourCards={yourCards}
      error={error}
      unit={unit}
      onFlipUnit={flipUnit}
    />
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100vh",
        color: "white",
        background: "#0d2118",
        fontFamily: "system-ui",
      }}
    >
      {children}
    </div>
  );
}

function BuyInEntry({
  nickname,
  onChangeNickname,
  error,
  bigBlind,
  smallBlind,
  onSubmit,
}: {
  nickname: string;
  onChangeNickname: (n: string) => void;
  error: string | null;
  bigBlind: number;
  smallBlind: number;
  onSubmit: (buyInDollars: number) => void;
}) {
  // Stored as string so the user can clear the field — number state was
  // collapsing an empty input to 0 and re-rendering "0".
  const [buyIn, setBuyIn] = useState<string>("20");
  const buyInNum = Number(buyIn);
  const valid = Number.isFinite(buyInNum) && buyInNum >= 4 && buyInNum <= 1000;
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100vh",
        background: "#0d2118",
        color: "white",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ background: "#173427", padding: 24, borderRadius: 12, minWidth: 360 }}>
        <h1 style={{ marginTop: 0 }}>Take a seat</h1>
        <p style={{ opacity: 0.8, fontSize: 13 }}>
          Stakes: {formatMoney(smallBlind, "money", bigBlind)} /{" "}
          {formatMoney(bigBlind, "money", bigBlind)} blinds. No login —
          your session is anonymous and stored only in this browser.
        </p>
        <label style={{ fontSize: 13, opacity: 0.8 }}>Nickname</label>
        <input
          autoFocus
          value={nickname}
          onChange={(e) => onChangeNickname(e.target.value)}
          placeholder="Nickname"
          maxLength={20}
          style={inputStyle}
        />
        <label style={{ fontSize: 13, opacity: 0.8, marginTop: 12, display: "block" }}>
          Buy-in (dollars)
        </label>
        <input
          type="number"
          min={4}
          max={1000}
          step={1}
          value={buyIn}
          onChange={(e) => setBuyIn(e.target.value)}
          style={inputStyle}
        />
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
          min $4, max $1000 (you can add more later)
        </div>
        {error && <div style={{ color: "#e74c3c", marginTop: 8, fontSize: 13 }}>{error}</div>}
        <button
          onClick={() => valid && onSubmit(buyInNum)}
          disabled={!valid}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            borderRadius: 4,
            background: valid ? "#27ae60" : "#555",
            color: "white",
            border: "none",
            cursor: valid ? "pointer" : "not-allowed",
            fontSize: 15,
          }}
        >
          {valid ? `Sit down with $${buyInNum.toFixed(2)}` : "Enter a buy-in"}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  fontSize: 16,
  borderRadius: 4,
  border: "1px solid #555",
  background: "#0d2118",
  color: "white",
  marginTop: 4,
};

function TableView({
  state,
  yourSeatId,
  yourCards,
  error,
  unit,
  onFlipUnit,
}: {
  state: PublicTableState;
  yourSeatId: number;
  yourCards: Card[];
  error: string | null;
  unit: DisplayUnit;
  onFlipUnit: () => void;
}) {
  const yourSeat = state.seats.find((s) => s.seatId === yourSeatId)!;
  const sock = getSocket();
  const [topUp, setTopUp] = useState<string>("10");
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const wasInHand = state.seats.find((s) => s.seatId === yourSeatId)?.inHand ?? false;
  const inShowWindow = state.phase === "handEnd" && wasInHand;

  return (
    <div
      style={{
        background: "#0d2118",
        minHeight: "100vh",
        color: "white",
        fontFamily: "system-ui",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          Hand #{state.handId} · {state.street} · stakes{" "}
          {formatMoney(state.smallBlind, "money", state.bigBlind)}/
          {formatMoney(state.bigBlind, "money", state.bigBlind)}
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onFlipUnit}>
            Display: {unit === "money" ? "$" : "BB"} (toggle)
          </button>
          <input
            type="number"
            min={1}
            step={1}
            value={topUp}
            onChange={(e) => setTopUp(e.target.value)}
            style={{ width: 70 }}
          />
          <button
            onClick={() => {
              const n = Number(topUp);
              if (!Number.isFinite(n) || n <= 0) {
                setTopUpError("invalid amount");
                return;
              }
              setTopUpError(null);
              sock.emit("addToStack", dollarsToCents(n), (r) => {
                if ("error" in r) setTopUpError(r.error);
              });
            }}
          >
            Add ${topUp}
          </button>
          <button onClick={() => sock.emit("setAway", !yourSeat.isAway)}>
            {yourSeat.isAway ? "Come back" : "Go away"}
          </button>
          <button onClick={() => sock.emit("leaveSeat")}>Leave seat</button>
        </div>
      </div>
      {topUpError && (
        <div style={{ color: "#e74c3c", fontSize: 13, marginTop: 4 }}>{topUpError}</div>
      )}

      <div style={{ marginTop: 12 }}>
        <PokerTable
          state={state}
          yourSeatId={yourSeatId}
          yourCards={yourCards}
          unit={unit}
        />
      </div>

      {inShowWindow && yourCards.length === 2 && (
        <ShowCardsBar
          cards={yourCards}
          deadline={state.showCardsDeadline}
          shown={(yourSeat.shownCardIndices ?? []).filter(
            (i): i is CardChoice => i === 0 || i === 1,
          )}
        />
      )}

      <div style={{ marginTop: 12 }}>
        <ActionBar state={state} yourSeatId={yourSeatId} unit={unit} />
        {error && <div style={{ color: "#e74c3c", marginTop: 6, fontSize: 13 }}>{error}</div>}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 12,
        }}
      >
        <div
          style={{
            background: "#111",
            padding: 8,
            borderRadius: 8,
            fontSize: 13,
            maxHeight: 220,
            overflow: "auto",
          }}
        >
          <strong>Log</strong>
          {state.log.map((line, i) => (
            <div key={i} style={{ opacity: 0.85, fontFamily: "monospace" }}>
              {line}
            </div>
          ))}
        </div>
        <FairnessPanel state={state} />
      </div>
    </div>
  );
}

function ShowCardsBar({
  cards,
  deadline,
  shown,
}: {
  cards: Card[];
  deadline: number | null;
  shown: CardChoice[];
}) {
  const sock = getSocket();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  const has = (i: CardChoice) => shown.includes(i);

  const send = (which: CardChoice[]) => sock.emit("showCards", which);

  return (
    <div
      style={{
        marginTop: 12,
        background: "#1a1a1a",
        borderRadius: 8,
        padding: 10,
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <strong style={{ marginRight: 8 }}>Show your cards?</strong>
      <CardView card={cards[0]} />
      <button onClick={() => send(has(0) ? shown.filter((x) => x !== 0) : [...shown, 0])}>
        {has(0) ? "Hide card 1" : "Show card 1"}
      </button>
      <CardView card={cards[1]} />
      <button onClick={() => send(has(1) ? shown.filter((x) => x !== 1) : [...shown, 1])}>
        {has(1) ? "Hide card 2" : "Show card 2"}
      </button>
      <button onClick={() => send([0, 1])}>Show both</button>
      <button onClick={() => send([])}>Muck</button>
      <span style={{ marginLeft: "auto", color: "#888", fontSize: 12 }}>
        {remaining}s to decide
      </span>
    </div>
  );
}
