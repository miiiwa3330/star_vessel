/**
 * 相手の UFO に照準を合わせたとき、機体のまわりにスタンプの輪（CHAT_STAMPS）を出す。
 * 毎フレーム機体の位置に追従するので React ではなく DOM を直接動かす（docs/tech/stack.md）。
 * PC ではカーソルを出さず照準（画面の真ん中）で押す。スマホではスタンプを直接タップしても押せる。
 */
import {
  CHAT_STAMPS,
  SHIP_STAMP_AIM_ENTER_PAD_PX,
  SHIP_STAMP_KEEP_PAD_PX,
  pickStampSlot,
  stampRingRadiusPx,
  stampRingSlots,
  type StampRingSlot,
} from '../world/chat';

export interface ShipScreenTarget {
  id: string;
  sx: number;
  sy: number;
  radiusPx: number;
}

export class ShipStampRing {
  private readonly root: HTMLDivElement;
  private readonly slotEls: HTMLDivElement[] = [];
  private activeShipId: string | null = null;
  private slots: StampRingSlot[] = [];
  private hoveredIndex = -1;
  private sentTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ship-stamp-ring';
    this.root.setAttribute('aria-hidden', 'true');
    for (const stamp of CHAT_STAMPS) {
      const el = document.createElement('div');
      el.className = 'ship-stamp-slot';
      el.textContent = stamp;
      this.root.appendChild(el);
      this.slotEls.push(el);
    }
    parent.appendChild(this.root);
  }

  /** 毎フレーム呼ぶ。enabled でないか、照準が外れたら閉じる */
  update(enabled: boolean, aimX: number, aimY: number, w: number, h: number, ships: readonly ShipScreenTarget[]): void {
    if (!enabled || ships.length === 0) {
      this.close();
      return;
    }
    const viewportMin = Math.min(w, h);
    let cur: ShipScreenTarget | null = null;
    if (this.activeShipId) {
      const candidate = ships.find((s) => s.id === this.activeShipId) ?? null;
      if (candidate) {
        const r = stampRingRadiusPx(candidate.radiusPx, viewportMin);
        if (Math.hypot(candidate.sx - aimX, candidate.sy - aimY) <= r + SHIP_STAMP_KEEP_PAD_PX) cur = candidate;
      }
      if (!cur) this.activeShipId = null;
    }
    if (!cur) {
      let bestD = Infinity;
      for (const s of ships) {
        const d = Math.hypot(s.sx - aimX, s.sy - aimY);
        const enterR = Math.max(40, s.radiusPx + SHIP_STAMP_AIM_ENTER_PAD_PX);
        if (d <= enterR && d < bestD) {
          bestD = d;
          cur = s;
        }
      }
      if (cur) this.activeShipId = cur.id;
    }
    if (!cur) {
      this.close();
      return;
    }
    const r = stampRingRadiusPx(cur.radiusPx, viewportMin);
    this.slots = stampRingSlots(cur.sx, cur.sy, r);
    this.hoveredIndex = pickStampSlot(aimX, aimY, this.slots);
    this.root.classList.add('is-open');
    for (let i = 0; i < this.slotEls.length; i++) {
      const s = this.slots[i];
      const el = this.slotEls[i];
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle('is-aimed', i === this.hoveredIndex);
    }
  }

  /** (x, y) が開いているスタンプの上なら、相手とスタンプを返す */
  pick(x: number, y: number): { shipId: string; stamp: string; index: number } | null {
    if (!this.activeShipId || this.slots.length === 0) return null;
    const idx = pickStampSlot(x, y, this.slots);
    if (idx < 0) return null;
    return { shipId: this.activeShipId, stamp: this.slots[idx].stamp, index: idx };
  }

  /** 送った瞬間にそのスタンプを弾ませる */
  pulse(index: number): void {
    const el = this.slotEls[index];
    if (!el) return;
    for (const s of this.slotEls) s.classList.remove('is-sent');
    void el.offsetWidth;
    el.classList.add('is-sent');
    clearTimeout(this.sentTimer);
    this.sentTimer = setTimeout(() => el.classList.remove('is-sent'), 360);
  }

  private close(): void {
    this.activeShipId = null;
    this.slots = [];
    this.hoveredIndex = -1;
    this.root.classList.remove('is-open');
  }
}
