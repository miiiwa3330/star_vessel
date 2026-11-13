/**
 * 図鑑の星座の絵（2026-11-13）：地球から見た星座の線と星（北が上・東が左）と、重ねる星座の絵。
 * 一覧の小さな絵（BodyGlobe.tsx）と、詳細の絵（ObjectViewer.tsx）の両方で使う。
 * 図の作り方・絵の合わせ方は src/world/constellation-figure.ts
 */
import type { ConstellationFigure } from '../world/constellation-figure';

/** 図の座標（−1〜1。y は上）を、canvas の座標にする */
const toCanvas = (res: number, x: number, y: number): [number, number] => [(x * 0.5 + 0.5) * res, (0.5 - y * 0.5) * res];

/** 線と星を描く。unknown：まだ集めていない星座（黒いシルエットにするので、形が分かるよう線を太く） */
export function drawConstellation(ctx: CanvasRenderingContext2D, res: number, figure: ConstellationFigure, unknown = false): void {
  ctx.clearRect(0, 0, res, res);
  const unit = res / 340;
  ctx.lineCap = 'round';
  ctx.strokeStyle = unknown ? '#fff' : 'rgba(150, 185, 255, 0.85)';
  ctx.lineWidth = Math.max(1, (unknown ? 3 : 1.4) * unit);
  ctx.beginPath();
  for (let i = 0; i < figure.lines.length; i += 4) {
    ctx.moveTo(...toCanvas(res, figure.lines[i], figure.lines[i + 1]));
    ctx.lineTo(...toCanvas(res, figure.lines[i + 2], figure.lines[i + 3]));
  }
  ctx.stroke();
  for (const s of figure.stars) {
    const [x, y] = toCanvas(res, s.x, s.y);
    // 明るい星ほど大きく（1 等で約 4.5、5 等で約 2。幅 340 px のとき）
    const r = Math.max(0.9, Math.min(6, 5.1 - 0.62 * s.mag) * unit);
    if (!unknown) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
      g.addColorStop(0, 'rgba(190, 215, 255, 0.5)');
      g.addColorStop(1, 'rgba(190, 215, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/** 星座の絵を、図に合わせて描く。transform は artFigureTransform の値（絵の px → 図の座標） */
export function drawConstellationArt(ctx: CanvasRenderingContext2D, res: number, image: CanvasImageSource, t: readonly number[]): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, res, res);
  const h = res / 2;
  ctx.setTransform(h * t[0], -h * t[1], h * t[2], -h * t[3], h * t[4] + h, -h * t[5] + h);
  ctx.drawImage(image, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 絵は黒い地に灰色で描かれている。明るさを濃さに直して、線の色に近いうすい青にする（黒いところは透ける）
  const data = ctx.getImageData(0, 0, res, res);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = Math.max(px[i], px[i + 1], px[i + 2]);
    px[i] = 160;
    px[i + 1] = 200;
    px[i + 2] = 255;
    px[i + 3] = (lum * px[i + 3]) / 255;
  }
  ctx.putImageData(data, 0, 0);
}
