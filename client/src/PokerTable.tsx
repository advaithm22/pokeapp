import { Fragment } from "react";
import type { Card, PublicSeat, PublicTableState } from "@shared/types";
import { formatMoney } from "@shared/money";
import { describeHandStrength } from "@shared/handeval";
import { CardView } from "./Card";
import type { DisplayUnit } from "./session";

const NUM_SEATS = 10;

/** Position around the felt for visual index `i` (0..NUM_SEATS-1, 0 = bottom-center). */
function seatAngle(visualIdx: number): number {
  // Math.PI / 2 = pointing down (bottom of screen, since y+ is down)
  return Math.PI / 2 + (visualIdx / NUM_SEATS) * Math.PI * 2;
}

function pointOnEllipse(angle: number, rxPct: number, ryPct: number): { left: string; top: string } {
  return {
    left: `${50 + rxPct * Math.cos(angle)}%`,
    top: `${50 + ryPct * Math.sin(angle)}%`,
  };
}

export function PokerTable({
  state,
  yourSeatId,
  yourCards,
  unit,
}: {
  state: PublicTableState;
  yourSeatId: number | null;
  yourCards: Card[];
  unit: DisplayUnit;
}) {
  const viewerSeat = yourSeatId ?? 0;
  const visualIdxFor = (seatId: number) =>
    (seatId - viewerSeat + NUM_SEATS) % NUM_SEATS;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 1100,
        aspectRatio: "16 / 9",
        margin: "0 auto",
      }}
    >
      {/* Felt */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: "10%",
          bottom: "10%",
          background: "radial-gradient(ellipse at 50% 50%, #2d6a4f 0%, #1b4332 100%)",
          borderRadius: "50%",
          border: "10px solid #5a3825",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.4)",
        }}
      />

      {/* Center: pot + community board */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          pointerEvents: "none",
        }}
      >
        {state.totalPot > 0 && (
          <div
            style={{
              background: "rgba(0,0,0,0.45)",
              padding: "4px 18px",
              borderRadius: 20,
              color: "white",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {formatMoney(state.totalPot, unit, state.bigBlind)}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {state.board.map((c, i) => (
            <CardView key={i} card={c} size="large" />
          ))}
        </div>
      </div>

      {/* Seats, bet chips, dealer button */}
      {state.seats.map((seat) => {
        const v = visualIdxFor(seat.seatId);
        const ang = seatAngle(v);
        const seatPos = pointOnEllipse(ang, 47, 44);
        const chipPos = pointOnEllipse(ang, 27, 24);
        const isYou = seat.seatId === yourSeatId;
        const cards: (Card | null)[] | null =
          isYou && yourCards.length === 2 && seat.inHand
            ? yourCards
            : seat.holeCards;

        // Hand strength description: only computable for the viewer (we know
        // both their hole cards). Other seats' cards are hidden until showdown.
        const handDescription =
          isYou && yourCards.length === 2 && seat.inHand && !seat.hasFolded
            ? describeHandStrength(yourCards, state.board)
            : null;

        return (
          <Fragment key={seat.seatId}>
            <SeatNode
              seat={seat}
              cards={cards}
              isYou={isYou}
              unit={unit}
              bigBlind={state.bigBlind}
              left={seatPos.left}
              top={seatPos.top}
              handDescription={handDescription}
            />
            {seat.bet > 0 && (
              <BetChip
                amount={seat.bet}
                unit={unit}
                bigBlind={state.bigBlind}
                left={chipPos.left}
                top={chipPos.top}
              />
            )}
          </Fragment>
        );
      })}

      {state.dealerSeatId !== null &&
        (() => {
          const v = visualIdxFor(state.dealerSeatId);
          const dPos = pointOnEllipse(seatAngle(v) - 0.12, 36, 32);
          return (
            <div
              style={{
                position: "absolute",
                left: dPos.left,
                top: dPos.top,
                transform: "translate(-50%, -50%)",
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "white",
                color: "black",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 13,
                boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              D
            </div>
          );
        })()}
    </div>
  );
}

function SeatNode({
  seat,
  cards,
  isYou,
  unit,
  bigBlind,
  left,
  top,
  handDescription,
}: {
  seat: PublicSeat;
  cards: (Card | null)[] | null;
  isYou: boolean;
  unit: DisplayUnit;
  bigBlind: number;
  left: string;
  top: string;
  handDescription?: string | null;
}) {
  const empty = !seat.nickname;
  const showingCards = !!cards && (cards[0] !== undefined || cards[1] !== undefined);
  const renderCards = seat.inHand && !seat.hasFolded
    ? "hand"
    : seat.hasFolded && showingCards && (cards?.[0] || cards?.[1])
    ? "shown"
    : "none";

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -50%)",
        width: 130,
        opacity: empty ? 0.35 : 1,
        textAlign: "center",
      }}
    >
      {/* Card stack above the nameplate */}
      <div
        style={{
          position: "relative",
          height: 56,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          marginBottom: -10,
        }}
      >
        {renderCards !== "none" && (
          <>
            <CardView
              card={cards?.[0] ?? null}
              hidden={!cards?.[0]}
              size="small"
              rotate={-8}
              offsetX={6}
            />
            <CardView
              card={cards?.[1] ?? null}
              hidden={!cards?.[1]}
              size="small"
              rotate={8}
              offsetX={-6}
            />
          </>
        )}
      </div>

      {/* Nameplate */}
      <div
        style={{
          background: seat.isToAct
            ? "linear-gradient(180deg, #fff7c2, #f1c40f)"
            : "white",
          color: "#1c1c1c",
          borderRadius: 8,
          padding: "6px 10px 7px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
          position: "relative",
          outline: isYou ? "2px solid #27ae60" : "none",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {seat.nickname ?? "Empty"}
          {isYou ? " (you)" : ""}
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>
          {empty ? "" : formatMoney(seat.stack, unit, bigBlind)}
        </div>
        {seat.isAway && (
          <Badge color="#666" position={{ top: -8, right: -8 }}>
            AWAY
          </Badge>
        )}
        {seat.isAllIn && (
          <Badge color="#e67e22" position={{ top: -8, left: -8 }}>
            ALL-IN
          </Badge>
        )}
        {!seat.isConnected && seat.nickname && (
          <Badge color="#888" position={{ bottom: -8, right: -8 }}>
            DISC
          </Badge>
        )}
      </div>

      {handDescription && (
        <div
          style={{
            marginTop: 4,
            display: "inline-block",
            background: "rgba(0,0,0,0.7)",
            color: "#f1c40f",
            padding: "2px 8px",
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        >
          {handDescription}
        </div>
      )}
      {seat.hasFolded && renderCards !== "shown" && (
        <div style={{ marginTop: 4, fontSize: 11, fontStyle: "italic", color: "#888" }}>folded</div>
      )}
      {seat.owedDeadMoney > 0 && (
        <div style={{ marginTop: 2, fontSize: 10, color: "#e67e22" }}>
          owes {formatMoney(seat.owedDeadMoney, unit, bigBlind)}
        </div>
      )}
    </div>
  );
}

function Badge({
  children,
  color,
  position,
}: {
  children: React.ReactNode;
  color: string;
  position: { top?: number; bottom?: number; left?: number; right?: number };
}) {
  return (
    <span
      style={{
        position: "absolute",
        background: color,
        color: "white",
        padding: "1px 5px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.4,
        ...position,
      }}
    >
      {children}
    </span>
  );
}

function BetChip({
  amount,
  unit,
  bigBlind,
  left,
  top,
}: {
  amount: number;
  unit: DisplayUnit;
  bigBlind: number;
  left: string;
  top: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -50%)",
        background: "#f1c40f",
        color: "black",
        padding: "3px 10px",
        borderRadius: 14,
        fontSize: 11,
        fontWeight: 700,
        boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
        whiteSpace: "nowrap",
      }}
    >
      {formatMoney(amount, unit, bigBlind)}
    </div>
  );
}
