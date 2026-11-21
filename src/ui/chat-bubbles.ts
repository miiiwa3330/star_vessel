/**
 * 船の上に出すチャットの吹き出しとスタンプの演出（要件 F6）。毎フレーム船の画面上の位置に合わせて動かすので、
 * React ではなく DOM を直接動かす（React を毎フレーム動かさない決まり。docs/tech/stack.md）。
 *
 * - 文章のチャット：白いシンプルな吹き出し（CHAT_SHOW_MS で消える）
 * - 自分の主張スタンプ（絵文字 1〜2 個）：枠なしの絵文字が SNS のいいねのように弾んで左右にゆらぎながら上へ浮かび消える（STAMP_SHOW_MS）
 * - もらったスタンプ（相手 UFO 宛て）：もらった UFO のまわりに、複数の絵文字がふわりと浮かんで漂い消える（GIFT_STAMP_SHOW_MS）
 */
import { CHAT_SHOW_MS, GIFT_STAMP_SHOW_MS, STAMP_SHOW_MS, isStampText } from '../world/chat';

export interface BubbleAnchor {
  /** 機体の上の基準位置（吹き出し・主張スタンプ用。CSS ピクセル） */
  x: number;
  y: number;
  /** 機体の中心（もらったスタンプのふわふわ配置用） */
  cx?: number;
  cy?: number;
  /** 機体の画面上の半径（CSS ピクセル） */
  radiusPx?: number;
}

interface Bubble {
  el: HTMLDivElement;
  body: HTMLDivElement;
  until: number;
}

interface Reaction {
  shipId: string;
  el: HTMLDivElement;
  until: number;
}

interface Gift {
  shipId: string;
  el: HTMLDivElement;
  until: number;
  angle: number;
  radiusScale: number;
}

const MAX_REACTIONS = 48;
const MAX_GIFTS = 64;
const SVG_NS = 'http://www.w3.org/2000/svg';
// 本体の底辺と 2.5px 重ねるパス（margin-top: -3px と合わせてサブピクセルの隙間が出ない）
const TAIL_PATH = 'M0 0 H22 V2.5 C16.5 2.5 14 5.2 12.1 9.1 C11.6 10.1 10.4 10.1 9.9 9.1 C8 5.2 5.5 2.5 0 2.5 Z';

function createBubbleElement(): { el: HTMLDivElement; body: HTMLDivElement } {
  const el = document.createElement('div');
  el.className = 'chat-bubble';
  const inner = document.createElement('div');
  inner.className = 'chat-bubble-inner';
  const body = document.createElement('div');
  body.className = 'chat-bubble-body';
  const tail = document.createElementNS(SVG_NS, 'svg');
  tail.setAttribute('class', 'chat-bubble-tail');
  tail.setAttribute('viewBox', '0 0 22 11');
  tail.setAttribute('width', '22');
  tail.setAttribute('height', '11');
  tail.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', '#fff');
  path.setAttribute('d', TAIL_PATH);
  tail.appendChild(path);
  inner.append(body, tail);
  el.appendChild(inner);
  return { el, body };
}
const GIFT_OFFSETS = [
  { angle: -Math.PI * 0.78, sizePx: 28, delayMs: 0 },
  { angle: -Math.PI * 0.22, sizePx: 22, delayMs: 90 },
  { angle: Math.PI * 0.92, sizePx: 24, delayMs: 180 },
  { angle: Math.PI * 0.08, sizePx: 20, delayMs: 270 },
] as const;

export class ChatBubbles {
  private readonly root: HTMLDivElement;
  private readonly bubbles = new Map<string, Bubble>();
  private readonly reactions: Reaction[] = [];
  private readonly gifts: Gift[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'chat-bubbles';
    this.root.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.root);
  }

  /** shipId の船の上に text を出す。スタンプは枠なしで浮かび、文章は白い吹き出しを置き換える */
  show(shipId: string, text: string, _hue: number, nowMs: number): void {
    if (isStampText(text)) {
      this.spawnReaction(shipId, text, nowMs);
      return;
    }
    let b = this.bubbles.get(shipId);
    if (!b) {
      const created = createBubbleElement();
      this.root.appendChild(created.el);
      b = { el: created.el, body: created.body, until: 0 };
      this.bubbles.set(shipId, b);
    }
    b.body.textContent = text;
    b.el.classList.remove('is-pop');
    void b.el.offsetWidth; // 出るときの動きをやり直す
    b.el.classList.add('is-pop');
    b.until = nowMs + CHAT_SHOW_MS;
  }

  /** もらったスタンプ：shipId の UFO のまわりに、複数の絵文字をふわふわと浮かべる */
  showGift(shipId: string, text: string, nowMs: number): void {
    for (const o of GIFT_OFFSETS) {
      while (this.gifts.length >= MAX_GIFTS) {
        this.gifts.shift()?.el.remove();
      }
      const el = document.createElement('div');
      el.className = 'chat-gift';
      const inner = document.createElement('span');
      inner.className = 'chat-gift-inner';
      inner.textContent = text;
      inner.style.fontSize = `${o.sizePx}px`;
      inner.style.animationDelay = `${o.delayMs}ms`;
      inner.style.setProperty('--bob-x', `${((Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10)).toFixed(0)}px`);
      inner.style.setProperty('--bob-y', `${(16 + Math.random() * 14).toFixed(0)}px`);
      inner.style.setProperty('--tilt', `${((Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8)).toFixed(0)}deg`);
      el.appendChild(inner);
      this.root.appendChild(el);
      this.gifts.push({
        shipId,
        el,
        until: nowMs + GIFT_STAMP_SHOW_MS + o.delayMs,
        angle: o.angle + (Math.random() - 0.5) * 0.36,
        radiusScale: 0.85 + Math.random() * 0.5,
      });
    }
  }

  private spawnReaction(shipId: string, text: string, nowMs: number): void {
    while (this.reactions.length >= MAX_REACTIONS) {
      this.reactions.shift()?.el.remove();
    }
    const el = document.createElement('div');
    el.className = 'chat-reaction';
    const inner = document.createElement('span');
    inner.className = 'chat-reaction-inner';
    inner.textContent = text;
    inner.style.setProperty('--rise', `${(72 + Math.random() * 44).toFixed(0)}px`);
    inner.style.setProperty('--sway', `${((Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 14)).toFixed(0)}px`);
    inner.style.setProperty('--dx', `${((Math.random() - 0.5) * 34).toFixed(0)}px`);
    inner.style.setProperty('--rot', `${((Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10)).toFixed(0)}deg`);
    el.appendChild(inner);
    this.root.appendChild(el);
    this.reactions.push({ shipId, el, until: nowMs + STAMP_SHOW_MS });
  }

  /**
   * 吹き出しとスタンプを船の位置に置く。screenOf は船の画面上の位置（CSS ピクセル）を返す。画面の外・後ろ・非表示なら null
   */
  update(nowMs: number, screenOf: (shipId: string) => BubbleAnchor | null): void {
    for (const [id, b] of this.bubbles) {
      if (nowMs > b.until) {
        b.el.remove();
        this.bubbles.delete(id);
        continue;
      }
      const p = screenOf(id);
      if (!p) {
        b.el.style.display = 'none';
        continue;
      }
      b.el.style.display = '';
      b.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i];
      if (nowMs > r.until) {
        r.el.remove();
        this.reactions.splice(i, 1);
        continue;
      }
      const p = screenOf(r.shipId);
      if (!p) {
        r.el.style.display = 'none';
        continue;
      }
      r.el.style.display = '';
      r.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (let i = this.gifts.length - 1; i >= 0; i--) {
      const g = this.gifts[i];
      if (nowMs > g.until) {
        g.el.remove();
        this.gifts.splice(i, 1);
        continue;
      }
      const p = screenOf(g.shipId);
      if (!p) {
        g.el.style.display = 'none';
        continue;
      }
      const cx = p.cx ?? p.x;
      const cy = p.cy ?? p.y;
      const r = Math.max(24, Math.min(160, p.radiusPx ?? 32)) * g.radiusScale;
      const gx = cx + Math.cos(g.angle) * r;
      const gy = cy + Math.sin(g.angle) * r;
      g.el.style.display = '';
      g.el.style.transform = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
}
