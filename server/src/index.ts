import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Server as SocketServer } from "socket.io";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

import { Table } from "./table.js";
import { SessionRegistry } from "./sessions.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  PublicTableState,
} from "../../shared/src/types.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: false });
const sessions = new SessionRegistry();
const table = new Table();

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(__dirname, "../../client/dist");

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/session", async () => ({ token: sessions.issue() }));

if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist, prefix: "/" });
  app.setNotFoundHandler((_req, reply) => {
    return reply.sendFile("index.html");
  });
}

const server = app.server;
const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: true, credentials: true },
});

interface SocketState {
  sessionToken: string | null;
}

const socketsByToken = new Map<string, Set<string>>();

function broadcastState(): void {
  for (const sock of io.sockets.sockets.values()) {
    const ss = sock.data as SocketState;
    const state: PublicTableState = table.publicStateFor(ss.sessionToken);
    sock.emit("state", state);
  }
}

table.on("state", broadcastState);

table.on("privateCards", (sessionToken, cards) => {
  const set = socketsByToken.get(sessionToken);
  if (!set) return;
  for (const sid of set) {
    const sock = io.sockets.sockets.get(sid);
    if (sock) sock.emit("yourCards", cards);
  }
});

io.on("connection", (sock) => {
  const data: SocketState = { sessionToken: null };
  sock.data = data;

  sock.on("hello", (sessionToken, ack) => {
    if (!sessions.recognize(sessionToken)) {
      ack(false);
      return;
    }
    data.sessionToken = sessionToken;
    let set = socketsByToken.get(sessionToken);
    if (!set) {
      set = new Set();
      socketsByToken.set(sessionToken, set);
    }
    set.add(sock.id);
    table.setConnected(sessionToken, true);
    sock.emit("state", table.publicStateFor(sessionToken));
    // Re-send hole cards if mid-hand
    const seat = table.seatBySession(sessionToken);
    if (seat && seat.holeCards.length > 0) {
      sock.emit("yourCards", seat.holeCards);
    }
    ack(true);
  });

  sock.on("takeSeat", (nickname, buyInCents, ack) => {
    if (!data.sessionToken) {
      ack({ error: "no session" });
      return;
    }
    const result = table.takeSeat(data.sessionToken, nickname, buyInCents);
    if ("error" in result) {
      ack({ error: result.error });
    } else {
      ack({ sessionToken: data.sessionToken, seatId: result.seatId, nickname: result.nickname });
    }
  });

  sock.on("leaveSeat", () => {
    if (!data.sessionToken) return;
    table.leaveSeat(data.sessionToken);
  });

  sock.on("setAway", (away) => {
    if (!data.sessionToken) return;
    table.setAway(data.sessionToken, away);
  });

  sock.on("addToStack", (amountCents, ack) => {
    if (!data.sessionToken) {
      ack({ error: "no session" });
      return;
    }
    const r = table.addToStack(data.sessionToken, amountCents);
    ack(r);
  });

  sock.on("showCards", (which) => {
    if (!data.sessionToken) return;
    table.showCards(data.sessionToken, which);
  });

  sock.on("postClientSeed", (seedHex) => {
    if (!data.sessionToken) return;
    table.postClientSeed(data.sessionToken, seedHex);
  });

  sock.on("act", (action) => {
    if (!data.sessionToken) return;
    const res = table.act(data.sessionToken, action);
    if (!res.ok) sock.emit("error", res.error);
  });

  sock.on("disconnect", () => {
    if (!data.sessionToken) return;
    const set = socketsByToken.get(data.sessionToken);
    if (set) {
      set.delete(sock.id);
      if (set.size === 0) {
        socketsByToken.delete(data.sessionToken);
        table.setConnected(data.sessionToken, false);
      }
    }
  });
});

await app.listen({ host: "0.0.0.0", port: PORT });
console.log(`poker server listening on http://localhost:${PORT}`);
