/**
 * 宇宙の部屋（worker/space-room.ts）とのつながり。部屋は恒星系ごと。
 * 自分の状態を送り、近くの船の状態を受け取る。切れたら、間をあけてつなぎ直す。
 */
import { reportServerTime } from '../world/clock';
import type { ChatMessage, ServerMessage, ShipSnapshot, ShipState, StateMessage } from '../world/ship-schema';
import { cleanChatText, isStampText } from '../world/chat';
import type { ShipLook } from '../world/ship-design';

const MAX_RETRY_MS = 10_000;

export interface ReceivedChat {
  from: string;
  hue: number;
  name: string | null;
  text: string;
  to?: string;
  toHue?: number;
  toName?: string | null;
}

export class SpaceLink {
  /** 近くの船（最後に受け取ったもの） */
  ships: ShipSnapshot[] = [];
  /** 自分の色相（サーバーが決める） */
  hue: number | null = null;
  /** 自分の船の短い ID（サーバーが決める。届いたチャットが自分のものか見分ける） */
  selfId: string | null = null;
  /** チャットが届いたとき（要件 F6）。main.ts が入れる */
  onChat: (c: ReceivedChat) => void = () => {};
  private ws: WebSocket | null = null;
  private room: string | null = null;
  private retryMs = 1_000;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** いる恒星系の部屋に入る。同じ部屋なら何もしない */
  setRoom(system: string): void {
    if (system === this.room) return;
    this.room = system;
    this.ships = [];
    this.retryMs = 1_000;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.connect();
  }

  send(state: ShipState, design?: ShipLook): void {
    if (!this.connected) return;
    const msg: StateMessage = { t: 'state', s: state, d: design };
    this.ws?.send(JSON.stringify(msg));
  }

  /** チャットを送る（to があるときは相手 UFO 宛てのスタンプ）。送れる形でなければ false */
  sendChat(raw: string, to?: string): boolean {
    const text = cleanChatText(raw);
    if (!this.connected || text === null) return false;
    if (to !== undefined && !isStampText(text)) return false;
    const msg: ChatMessage = to ? { t: 'chat', text, to } : { t: 'chat', text };
    this.ws?.send(JSON.stringify(msg));
    return true;
  }

  private connect(): void {
    const room = this.room;
    if (!room) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/api/space/${encodeURIComponent(room)}`);
    this.ws = ws;
    ws.onmessage = (e) => {
      let m: ServerMessage;
      try {
        m = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      reportServerTime(m.now);
      if (m.t === 'hello') {
        this.hue = m.hue;
        this.selfId = m.id;
        this.retryMs = 1_000;
      } else if (m.t === 'ships' && Array.isArray(m.ships)) {
        this.ships = m.ships;
      } else if (m.t === 'chat') {
        const text = cleanChatText(m.text);
        if (text !== null && typeof m.from === 'string' && typeof m.hue === 'number') {
          const directed = typeof m.to === 'string' && typeof m.toHue === 'number';
          this.onChat({
            from: m.from,
            hue: m.hue,
            name: typeof m.name === 'string' ? m.name : null,
            text,
            ...(directed ? { to: m.to, toHue: m.toHue, toName: typeof m.toName === 'string' ? m.toName : null } : {}),
          });
        }
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // 部屋を変えたために閉じた
      this.ws = null;
      this.ships = [];
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs * 2);
    };
  }
}
