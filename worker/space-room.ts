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
import { designOrNone } from '../src/world/ship-schema';
import type { ShipDesign } from '../src/world/ship-design';
import { isStampId, STAMP_MIN_INTERVAL_MS } from '../src/world/stamps';
import { PRESENCE_REFRESH_MS, presenceStatement } from '../src/world/presence';

const BROADCAST_MS = 1000 / SHIP_SEND_HZ;
const MAX_MESSAGE_BYTES = 2048;

/** 接続ごとに覚えておくこと。休止しても消えないよう、WebSocket に付けて保存する */
interface Attachment {
  sid: string;
  /** 部屋の名前（恒星系の記号）。休止すると部屋の名前を忘れるので、接続ごとに覚えておく（人数を書くため。要件 F50） */
  room: string;
  hue: number;
  state: ShipState | null;
  /** 船の設計（最後に受け取ったもの） */
  design?: ShipDesign;
  /** 状態を受け取った時刻（ms） */
  at: number;
  /** 最後にスタンプを送った時刻（ms） */
  stampAt?: number;
}

/**
 * 近い船を選ぶための位置。サーバーは太陽系の主な天体の位置しか計算できない（衛星・小惑星・系外惑星の一覧を持たない）ので、
 * それ以外を基準にしている船は、基準の天体からの相対位置で代わりにする（同じ天体のまわりの船どうしは正しく並ぶ）
 */
function roughPositionKm(s: ShipState, date: Date) {
  try {
    return shipPositionKm(s, date);
  } catch {
    return s.offsetKm;
  }
}

export class SpaceRoom extends DurableObject<Env> {
  private lastBroadcast = 0;
  /** 人数を最後に書いた時刻（ms）。休止すると 0 に戻るので、起きたあとに 1 回多く書くことがあるだけ */
  private lastPresence = 0;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const userId = request.headers.get('x-user-id');
    if (!userId) return new Response('unauthorized', { status: 401 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = {
      sid: crypto.randomUUID().slice(0, 8),
      room: request.headers.get('x-room') ?? '',
      hue: hueFromId(userId),
      state: null,
      at: 0,
    };
    server.serializeAttachment(attachment);
    this.reportPresence(attachment.room, undefined, Date.now());
    const hello: ServerMessage = { t: 'hello', id: attachment.sid, hue: attachment.hue, now: Date.now() };
    server.send(JSON.stringify(hello));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return;
    const a = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    // 人数は、つながったとき・切れたときのほか、前に書いてから 1 分たったら書き直す（切れたと知らせずに消えた部屋の行を、数えなくするため）
    if (now - this.lastPresence >= PRESENCE_REFRESH_MS) this.reportPresence(a.room, undefined, now);
    const m = parsed as { t?: unknown; s?: unknown; d?: unknown; k?: unknown };
    if (m.t === 'stamp') {
      this.stamp(ws, a, m.k, now);
      return;
    }
    if (now - a.at < SHIP_MIN_INTERVAL_MS) return;
    if (m.t !== 'state' || !isShipState(m.s)) return;
    a.state = m.s;
    a.design = designOrNone(m.d) ?? a.design;
    a.at = now;
    ws.serializeAttachment(a);

    if (now - this.lastBroadcast >= BROADCAST_MS) {
      this.lastBroadcast = now;
      this.broadcast(now);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a) this.reportPresence(a.room, ws, Date.now());
    try {
      ws.close(code, reason);
    } catch {
      // すでに閉じている
    }
  }

  /**
   * いま状態が届いている船（要件 F53。タイトル画面の背景のため）。Worker から呼ぶ（RPC）。
   * 配る相手に合わせた絞り込みはしない。アカウントの ID は、もともと持っていない（接続ごとの短い ID だけ）
   */
  async currentShips(): Promise<ShipSnapshot[]> {
    const now = Date.now();
    const out: ShipSnapshot[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.state && now - a.at < SHIP_STALE_MS) out.push({ id: a.sid, hue: a.hue, s: a.state, d: a.design, at: a.at });
    }
    return out;
  }

  /**
   * いまの接続の数を、D1 の presence 表に書く（要件 F50）。失敗しても、宇宙の部屋の動きには影響させない。
   * exclude：閉じようとしている接続（閉じる処理の中では、まだ一覧に残っていることがあるので数えない）
   */
  private reportPresence(room: string, exclude: WebSocket | undefined, now: number): void {
    if (!room) return;
    this.lastPresence = now;
    const count = this.ctx.getWebSockets().filter((s) => s !== exclude).length;
    const st = presenceStatement(room, count, now);
    this.ctx.waitUntil(
      this.env.DB.prepare(st.sql)
        .bind(...st.params)
        .run()
        .catch((e: unknown) => console.error('人数を書けない', e)),
    );
  }

  /**
   * スタンプ（要件 F6）。送った人の船が「近い順 MAX_SHIPS_SENT 隻」に入っている人（＝その船が見えている人）と、送った本人に届ける。
   * 続けて送れるのは STAMP_MIN_INTERVAL_MS に 1 回まで。まだ自分の状態を送っていない人のスタンプは捨てる。
   * 近さは、届いている最後の位置で決める（ふだんの配る処理と違い、古い位置の船も含める）
   */
  private stamp(ws: WebSocket, a: Attachment, k: unknown, now: number): void {
    if (!isStampId(k) || !a.state) return;
    if (a.stampAt !== undefined && now - a.stampAt < STAMP_MIN_INTERVAL_MS) return;
    a.stampAt = now;
    ws.serializeAttachment(a);
    const date = new Date(now);
    // 位置の古さは問わない（タブを一時的に裏に回した直後などでも届くように）。最後に受け取った位置で近さを決める
    const all = this.ctx.getWebSockets().map((s) => ({ ws: s, a: s.deserializeAttachment() as Attachment }));
    const active = all.filter((e) => e.a.state);
    const positions = active.map((e) => roughPositionKm(e.a.state as ShipState, date));
    const senderIndex = active.findIndex((e) => e.a.sid === a.sid);
    const msg = JSON.stringify({ t: 'stamp', now, from: a.sid, hue: a.hue, k } satisfies ServerMessage);
    active.forEach((e, i) => {
      const sees = e.a.sid === a.sid || nearestIndices(positions[i], positions, MAX_SHIPS_SENT, i).includes(senderIndex);
      if (!sees) return;
      try {
        e.ws.send(msg);
      } catch {
        // 閉じかけの接続は次の機会に消える
      }
    });
  }

  /** 1 人ずつ、その人から近い船を最大 MAX_SHIPS_SENT 隻、まとめて 1 通で送る */
  private broadcast(now: number): void {
    const date = new Date(now);
    const sockets = this.ctx.getWebSockets();
    const all = sockets.map((ws) => ({ ws, a: ws.deserializeAttachment() as Attachment }));
    const active = all.filter((e) => e.a.state && now - e.a.at < SHIP_STALE_MS);
    const positions = active.map((e) => roughPositionKm(e.a.state as ShipState, date));
    const snaps: ShipSnapshot[] = active.map((e) => ({
      id: e.a.sid,
      hue: e.a.hue,
      s: e.a.state as ShipState,
      d: e.a.design,
      at: e.a.at,
    }));

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
