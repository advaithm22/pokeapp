import { randomBytesHex } from "./rng.js";

/**
 * Anonymous sessions: a session token is a random 32-byte hex string the
 * client stores in localStorage. The server tracks which session owns which
 * seat (see Table). No accounts, no passwords, no DB.
 */
export class SessionRegistry {
  private known = new Set<string>();

  issue(): string {
    const tok = randomBytesHex(32);
    this.known.add(tok);
    return tok;
  }

  /** Adopt a token presented by the client across reconnects. */
  recognize(token: string): boolean {
    if (typeof token !== "string" || token.length !== 64 || !/^[0-9a-f]+$/.test(token)) {
      return false;
    }
    this.known.add(token); // trust-on-first-use; play money only
    return true;
  }
}
