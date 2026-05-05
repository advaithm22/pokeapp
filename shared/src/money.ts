/** All money is integer cents. */

export function dollarsToCents(dollars: number): number {
  // Avoid float drift: round to nearest cent.
  return Math.round(dollars * 100);
}

export function centsToDollarsString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const c = abs % 100;
  return `${sign}$${dollars}.${c.toString().padStart(2, "0")}`;
}

export function centsToBBString(cents: number, bigBlindCents: number): string {
  if (bigBlindCents <= 0) return "0 BB";
  const bb = cents / bigBlindCents;
  // 1 decimal if non-integer
  return `${bb % 1 === 0 ? bb.toFixed(0) : bb.toFixed(1)} BB`;
}

export function formatMoney(
  cents: number,
  unit: "money" | "bb",
  bigBlindCents: number,
): string {
  return unit === "bb" ? centsToBBString(cents, bigBlindCents) : centsToDollarsString(cents);
}
