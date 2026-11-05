/**
 * 選んだ天体の印（要件 F35）。画面の中ならその位置に輪、画面の外（後ろ）なら、ふちにその方向を指す矢印。
 * 毎フレーム動かすので、React ではなく DOM を直接動かす
 */
export class TargetMarker {
  private readonly ring: HTMLDivElement;
  private readonly arrow: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.ring = document.createElement('div');
    this.ring.className = 'target-ring';
    this.arrow = document.createElement('div');
    this.arrow.className = 'target-arrow';
    for (const el of [this.ring, this.arrow]) {
      el.setAttribute('aria-hidden', 'true');
      el.style.display = 'none';
      parent.appendChild(el);
    }
  }

  hide(): void {
    this.ring.style.display = 'none';
    this.arrow.style.display = 'none';
  }

  /**
   * ndc は画面の座標（−1〜1。カメラの前なら inFront）。w・h は画面の大きさ（CSS ピクセル）
   */
  show(ndc: { x: number; y: number }, inFront: boolean, w: number, h: number): void {
    const onScreen = inFront && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
    if (onScreen) {
      this.arrow.style.display = 'none';
      this.ring.style.display = '';
      this.ring.style.transform = `translate(${(((ndc.x + 1) / 2) * w).toFixed(1)}px, ${(((1 - ndc.y) / 2) * h).toFixed(1)}px) translate(-50%, -50%)`;
      return;
    }
    // 画面の外：中心からその方向へ、ふちの少し内側に矢印を置く（後ろなら向きを反対にする）
    let x = ndc.x;
    let y = ndc.y;
    if (!inFront) {
      x = -x;
      y = -y;
    }
    const len = Math.hypot(x, y) || 1;
    x /= len;
    y /= len;
    const margin = 36;
    const s = Math.min((w / 2 - margin) / Math.max(Math.abs(x), 1e-6), (h / 2 - margin) / Math.max(Math.abs(y), 1e-6));
    const px = w / 2 + x * s;
    const py = h / 2 - y * s;
    const angle = Math.atan2(-y, x);
    this.ring.style.display = 'none';
    this.arrow.style.display = '';
    this.arrow.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) rotate(${angle}rad)`;
  }
}
