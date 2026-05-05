import type { Card } from "@shared/types";

const SUIT_GLYPH: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

function rankLabel(rank: number): string {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  if (rank === 10) return "T";
  return String(rank);
}

export type CardSize = "small" | "default" | "large";

const SIZES: Record<CardSize, { w: number; h: number; rank: number; suit: number; pad: number }> = {
  small: { w: 38, h: 54, rank: 13, suit: 14, pad: 2 },
  default: { w: 44, h: 64, rank: 16, suit: 18, pad: 3 },
  large: { w: 56, h: 80, rank: 22, suit: 24, pad: 4 },
};

export function CardView({
  card,
  hidden,
  size = "default",
  rotate = 0,
  offsetX = 0,
  style,
}: {
  card?: Card | null;
  hidden?: boolean;
  size?: CardSize;
  rotate?: number;
  offsetX?: number;
  style?: React.CSSProperties;
}) {
  const d = SIZES[size];
  const transform =
    rotate || offsetX
      ? `translateX(${offsetX}px) rotate(${rotate}deg)`
      : undefined;

  if (hidden || !card) {
    return (
      <div
        style={{
          width: d.w,
          height: d.h,
          borderRadius: 6,
          background:
            "repeating-linear-gradient(45deg, #6b3838, #6b3838 4px, #4a2424 4px, #4a2424 8px)",
          border: "2px solid white",
          display: "inline-block",
          margin: "0 1px",
          transform,
          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
          ...style,
        }}
      />
    );
  }
  const red = card.suit === "h" || card.suit === "d";
  return (
    <div
      style={{
        width: d.w,
        height: d.h,
        borderRadius: 6,
        background: "white",
        border: "1px solid #999",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 1px",
        color: red ? "#c0392b" : "#1c1c1c",
        fontFamily: "monospace",
        transform,
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        padding: d.pad,
        ...style,
      }}
    >
      <div style={{ fontSize: d.rank, fontWeight: 700, lineHeight: 1 }}>{rankLabel(card.rank)}</div>
      <div style={{ fontSize: d.suit, lineHeight: 1, marginTop: 2 }}>{SUIT_GLYPH[card.suit]}</div>
    </div>
  );
}
