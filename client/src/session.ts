const KEY = "poker.sessionToken";

export async function ensureSessionToken(): Promise<string> {
  const existing = localStorage.getItem(KEY);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const res = await fetch("/api/session");
  const json = (await res.json()) as { token: string };
  localStorage.setItem(KEY, json.token);
  return json.token;
}

export function getNickname(): string | null {
  return localStorage.getItem("poker.nickname");
}

export function setNickname(n: string): void {
  localStorage.setItem("poker.nickname", n);
}

export function clearNickname(): void {
  localStorage.removeItem("poker.nickname");
}

/** Generate a 32-byte client seed in the browser using Web Crypto. */
export function makeClientSeedHex(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const UNIT_KEY = "poker.displayUnit";
export type DisplayUnit = "money" | "bb";

export function getDisplayUnit(): DisplayUnit {
  const v = localStorage.getItem(UNIT_KEY);
  return v === "bb" ? "bb" : "money";
}

export function setDisplayUnit(u: DisplayUnit): void {
  localStorage.setItem(UNIT_KEY, u);
}
