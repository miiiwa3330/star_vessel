/**
 * 宇宙の部屋（Durable Object）。恒星系ごとに 1 つ。中にいるプレイヤーの宇宙船の状態を受け取り、近い船を配る。
 * 決まりは docs/tech/server.md の「宇宙船の位置のやりとり」。
 *
 * - WebSocket の休止（Hibernation API）を使う。プレイヤーがいない・何も届かない間は、時間の料金がかからない
 * - 配るのは、誰かの状態が届いたときに、前に配ってから BROADCAST_MS 以上たっていれば。タイマー（alarm）を使わない
 *   （alarm は 1 回ごとにリクエストとして数えられ、1 秒に 4 回だと無料の上限をすぐ超えるため）
 */
import { DurableObject } from 'cloudflare:workers';
import {
  hueFromId,
  isShipState,
  MAX_SHIPS_SENT,
  SHIP_MIN_INTERVAL_MS,
  SHIP_SEND_HZ,
  SHIP_STALE_MS,
  type ServerMessage,
  type ShipSnapshot,
  type ShipState,
} from '../src/world/ship-schema';
import { nearestIndices, shipPositionKm } from '../src/world/ships';

const BROADCAST_MS = 1000 / SHIP_SEND_HZ;
const MAX_MESSAGE_BYTES = 2048;

/** 接続ごとに覚えておくこと。休止しても消えないよう、WebSocket に付けて保存する */
interface Attachment {
  sid: string;
  hue: number;
  state: ShipState | null;
  /** 状態を受け取った時刻（ms） */
  at: number;
}

export class SpaceRoom extends DurableObject<Env> {
  private lastBroadcast = 0;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id');
    if (!userId) return new Response('unauthorized', { status: 401 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { sid: crypto.randomUUID().slice(0, 8), hue: hueFromId(userId), state: null, at: 0 };
    server.serializeAttachment(attachment);
    const hello: ServerMessage = { t: 'hello', id: attachment.sid, hue: attachment.hue, now: Date.now() };
    server.send(JSON.stringify(hello));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return;
    const a = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (now - a.at < SHIP_MIN_INTERVAL_MS) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    const m = parsed as { t?: unknown; s?: unknown };
    if (m.t !== 'state' || !isShipState(m.s)) return;
    a.state = m.s;
    a.at = now;
    ws.serializeAttachment(a);

    if (now - this.lastBroadcast >= BROADCAST_MS) {
      this.lastBroadcast = now;
      this.broadcast(now);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // すでに閉じている
    }
  }

  /** 1 人ずつ、その人から近い船を最大 MAX_SHIPS_SENT 隻、まとめて 1 通で送る */
  private broadcast(now: number): void {
    const date = new Date(now);
    const sockets = this.ctx.getWebSockets();
    const all = sockets.map((ws) => ({ ws, a: ws.deserializeAttachment() as Attachment }));
    const active = all.filter((e) => e.a.state && now - e.a.at < SHIP_STALE_MS);
    const positions = active.map((e) => shipPositionKm(e.a.state as ShipState, date));
    const snaps: ShipSnapshot[] = active.map((e) => ({ id: e.a.sid, hue: e.a.hue, s: e.a.state as ShipState, at: e.a.at }));

    for (const { ws, a } of all) {
      const selfIndex = active.findIndex((e) => e.a.sid === a.sid);
      // まだ自分の状態を送っていない人（つないだ直後）には、部屋の最初の船から近い順に送る
      const from = selfIndex >= 0 ? positions[selfIndex] : (positions[0] ?? { x: 0, y: 0, z: 0 });
      const ships = nearestIndices(from, positions, MAX_SHIPS_SENT, selfIndex).map((i) => snaps[i]);
      const msg: ServerMessage = { t: 'ships', now, ships };
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        // 閉じかけの接続は次の機会に消える
      }
    }
  }
}
