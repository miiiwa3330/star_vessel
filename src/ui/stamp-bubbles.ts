/**
 * 船の上に出すスタンプの吹き出し（要件 F6）。毎フレーム船の画面上の位置に合わせて動かすので、
 * React ではなく DOM を直接動かす（React を毎フレーム動かさない決まり。docs/tech/stack.md）。
 */
import { STAMP_SHOW_MS } from '../world/stamps';

interface Bubble {
  el: HTMLDivElement;
  until: number;
}

export class StampBubbles {
  private readonly root: HTMLDivElement;
  private readonly bubbles = new Map<string, Bubble>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'stamp-bubbles';
    this.root.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.root);
  }

  /** shipId の船の上に text を出す（同じ船の前の吹き出しは置き換える） */
  show(shipId: string, text: string, hue: number, nowMs: number): void {
    let b = this.bubbles.get(shipId);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'stamp-bubble';
      this.root.appendChild(el);
      b = { el, until: 0 };
      this.bubbles.set(shipId, b);
    }
    b.el.textContent = text;
    b.el.style.setProperty('--hue', String(hue));
    b.el.classList.toggle('is-phrase', [...text].length > 2);
    b.el.classList.remove('is-pop');
    void b.el.offsetWidth; // 出るときの動きをやり直す
    b.el.classList.add('is-pop');
    b.until = nowMs + STAMP_SHOW_MS;
  }

  /**
   * 吹き出しを船の位置に置く。screenOf は船の画面上の位置（CSS ピクセル）を返す。画面の外・後ろなら null
   */
  update(nowMs: number, screenOf: (shipId: string) => { x: number; y: number } | null): void {
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
  }
}
