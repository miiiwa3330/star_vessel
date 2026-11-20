/**
 * 図鑑の、点の集まりで描く絵（星団・銀河・星雲・彗星）。一覧の小さな絵（BodyGlobe.tsx）と、詳細の回せる絵（ObjectViewer.tsx）の両方で使う。
 * 形は、天体 1 つずつのデータから決めた値（src/world/picture.ts）と、名前から決まる種で作る。誰の端末でも同じ形。
 * 見た目のための形で、観測された星の並びではない（要件 F38）
 */
import { mulberry32 } from '../world/random';
import { projectCloud, type CloudPoint } from './globe-render';
import type { CollectionLook } from './collection-look';

type CloudLook = Extract<CollectionLook, { type: 'cluster' | 'galaxy' | 'nebula' | 'comet' }>;

export const isCloudLook = (look: CollectionLook): look is CloudLook =>
  look.type === 'cluster' || look.type === 'galaxy' || look.type === 'nebula' || look.type === 'comet';

/** 最初に見る向き。銀河は、観測の傾き */
export const INITIAL_YAW = 0.6;
export const initialPitch = (look: CollectionLook): number => (look.type === 'galaxy' ? look.picture.pitch : look.type === 'black-hole' ? 0.32 : 0.28);

/** 点の集まりを作る */
export function makeCloud(look: CloudLook): CloudPoint[] {
  const rand = mulberry32(look.seed);
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 4; i++) s += rand();
    return (s - 2) / 0.58;
  };
  const pts: CloudPoint[] = [];
  /** warm：0 青白 〜 1 黄・赤 */
  const star = (x: number, y: number, z: number, s: number, warm: number, a = 1) => {
    const t = warm;
    pts.push({ x, y, z, s, r: Math.round(200 + 55 * t), g: Math.round(215 + 20 * (1 - Math.abs(t - 0.5))), b: Math.round(255 - 90 * t), a });
  };
  if (look.type === 'cluster') {
    const { count, core, warm } = look.picture;
    for (let i = 0; i < count; i++) {
      // プラマーの分布（宇宙の中の星団と同じ）。絵の外へはみ出したものは選び直す
      let r = 2;
      for (let k = 0; k < 20 && r > 1; k++) r = core / Math.sqrt(Math.max(1e-3, Math.max(1e-6, rand()) ** (-2 / 3) - 1));
      r = Math.min(r, 1);
      const u = 2 * rand() - 1;
      const th = rand() * 2 * Math.PI;
      const sxy = Math.sqrt(1 - u * u);
      const big = rand() ** 6;
      // 明るい星：若い星団では青い星、古い星団では赤い巨星
      const w = Math.min(1, Math.max(0, warm + (rand() - 0.5) * 0.5 + big * (warm > 0.5 ? 0.3 : -0.3)));
      star(r * sxy * Math.cos(th), r * u, r * sxy * Math.sin(th), (look.globular ? 0.005 : 0.008) + 0.012 * big, w, look.globular ? 0.5 : 0.9);
    }
  } else if (look.type === 'galaxy') {
    const p = look.picture;
    const k = p.scale;
    if (p.shape === 'elliptical') {
      for (let i = 0; i < 1400 * p.density; i++) star(gauss() * 0.375 * k, gauss() * 0.375 * p.flatten * k, gauss() * 0.375 * k, 0.005 + 0.006 * rand(), 0.75 + 0.25 * rand(), 0.55);
    } else if (p.shape === 'spiral') {
      // 中心のふくらみ（型が早いほど大きい）
      for (let i = 0; i < 1700 * p.bulge * p.density; i++)
        star(gauss() * p.bulge * 0.5 * k, gauss() * p.bulge * 0.36 * k, gauss() * p.bulge * 0.5 * k, 0.005 + 0.006 * rand(), 0.75 + 0.25 * rand(), 0.55);
      for (let i = 0; i < 1600 * p.density; i++) {
        const r = 0.12 + 0.85 * Math.sqrt(rand());
        let th = rand() * 2 * Math.PI;
        if (rand() < 0.78) th = Math.floor(rand() * 2) * Math.PI + Math.log(r / 0.12) * p.wind + gauss() * 0.28;
        const blue = rand() < 0.55;
        const x = r * Math.cos(th) * k;
        const z = r * Math.sin(th) * k;
        star(x, gauss() * 0.025 * k, z, 0.004 + 0.007 * rand(), blue ? 0.1 * rand() : 0.4 + 0.3 * rand(), 0.6);
        // 星の生まれる所の、ほんのり赤い光
        if (blue && rand() < 0.04) pts.push({ x, y: 0, z, s: 0.03 + 0.03 * rand(), r: 255, g: 120, b: 170, a: 0.22 });
      }
    } else {
      // 不規則：いくつかの塊
      const clumps = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({ x: gauss() * 0.28, y: gauss() * 0.08, z: gauss() * 0.28, s: 0.14 + 0.2 * rand() }));
      for (let i = 0; i < 1500 * p.density; i++) {
        const c = clumps[Math.floor(rand() * clumps.length)];
        const blue = rand() < 0.6;
        const x = (c.x + gauss() * c.s) * k;
        const y = (c.y + gauss() * c.s * 0.45) * k;
        const z = (c.z + gauss() * c.s) * k;
        star(x, y, z, 0.004 + 0.007 * rand(), blue ? 0.1 * rand() : 0.4 + 0.3 * rand(), 0.6);
        if (blue && rand() < 0.03) pts.push({ x, y, z, s: 0.03 + 0.03 * rand(), r: 255, g: 120, b: 170, a: 0.22 });
      }
    }
  } else if (look.type === 'nebula') {
    // 種類ごとの色：電離した水素（赤・桃）、惑星状星雲（青緑の殻）、超新星残骸（すじ）、反射星雲（青）、暗黒星雲（茶）
    const palette: Record<string, [number, number, number][]> = {
      hii: [
        [255, 90, 140],
        [255, 150, 120],
        [140, 200, 255],
      ],
      pn: [
        [90, 230, 220],
        [120, 160, 255],
        [255, 120, 150],
      ],
      snr: [
        [255, 160, 90],
        [120, 170, 255],
        [255, 110, 130],
      ],
      rn: [
        [120, 170, 255],
        [170, 200, 255],
        [210, 220, 255],
      ],
      dn: [
        [120, 80, 60],
        [90, 60, 50],
        [160, 120, 90],
      ],
    };
    const cols = palette[look.nebula] ?? palette.hii;
    const shell = look.nebula === 'pn' || look.nebula === 'snr';
    const k = look.scale;
    for (let i = 0; i < 520; i++) {
      let x: number;
      let y: number;
      let z: number;
      if (shell) {
        const u = 2 * rand() - 1;
        const th = rand() * 2 * Math.PI;
        const r = (look.nebula === 'pn' ? 0.55 : 0.75) + gauss() * 0.06;
        const s = Math.sqrt(1 - u * u);
        x = r * s * Math.cos(th);
        y = r * u * (look.nebula === 'pn' ? 0.8 : 1);
        z = r * s * Math.sin(th);
      } else {
        x = gauss() * 0.32;
        y = gauss() * 0.24;
        z = gauss() * 0.3;
      }
      const c = cols[Math.floor(rand() * cols.length)];
      pts.push({ x: x * k, y: y * k, z: z * k, s: (0.05 + 0.08 * rand()) * k, r: c[0], g: c[1], b: c[2], a: look.nebula === 'dn' ? 0.03 : shell ? 0.09 : 0.045 });
    }
    // 中の星
    for (let i = 0; i < 24; i++) star(gauss() * 0.3 * k, gauss() * 0.25 * k, gauss() * 0.3 * k, 0.005 + 0.006 * rand(), rand() * 0.4, 0.8);
    if (look.nebula === 'pn') star(0, 0, 0, 0.018, 0, 1);
  } else {
    // 彗星：核と、太陽と反対の向き（ここでは −x）へのびる尾。尾の長さ・濃さとコマの大きさはデータから
    const { tail, coma } = look.picture;
    const len = 1.45 * tail;
    const head = len * 0.38;
    pts.push({ x: head, y: 0, z: 0, s: 0.05, r: 255, g: 255, b: 255, a: 1 });
    pts.push({ x: head, y: 0, z: 0, s: coma, r: 170, g: 220, b: 255, a: 0.5 });
    for (let i = 0; i < 700 * (0.4 + 0.6 * tail); i++) {
      const t = rand();
      const spread = 0.02 + t * 0.22 * tail;
      const dust = rand() < 0.5;
      pts.push({
        x: head - t * len,
        y: gauss() * spread + (dust ? -t * t * 0.25 * tail : 0),
        z: gauss() * spread,
        s: 0.02 + 0.05 * rand(),
        r: dust ? 255 : 130,
        g: dust ? 230 : 190,
        b: dust ? 190 : 255,
        a: 0.12 * (1 - t),
      });
    }
  }
  return pts;
}

/**
 * 点の集まりを canvas に描く。res は canvas の 1 辺の画素の数。
 * unknown：まだ訪れていない天体（黒いシルエットにするので、重ねて明るくしない）。
 * pointScale：小さな絵で、星の点がつぶれないように大きくする倍率。starAlpha：その分、重なって白く飛ばないように星の点を薄くする倍率
 */
export function drawCloud(
  ctx: CanvasRenderingContext2D,
  res: number,
  cloud: readonly CloudPoint[],
  yaw: number,
  pitch: number,
  opts: { unknown?: boolean; pointScale?: number; starAlpha?: number } = {},
): void {
  const scale = opts.pointScale ?? 1;
  ctx.clearRect(0, 0, res, res);
  ctx.globalCompositeOperation = opts.unknown ? 'source-over' : 'lighter';
  for (const q of projectCloud(cloud, yaw, pitch)) {
    const x = (q.x * 0.47 + 0.5) * res;
    const y = (-q.y * 0.47 + 0.5) * res;
    const soft = q.p.s > 0.02;
    const s = Math.max(0.6, q.p.s * res * (soft ? 1 : scale));
    const a = q.p.a * (0.75 + 0.25 * q.z) * (soft || opts.unknown ? 1 : (opts.starAlpha ?? 1));
    if (soft) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, `rgba(${q.p.r}, ${q.p.g}, ${q.p.b}, ${a})`);
      g.addColorStop(1, `rgba(${q.p.r}, ${q.p.g}, ${q.p.b}, 0)`);
      ctx.fillStyle = g;
    } else ctx.fillStyle = `rgba(${q.p.r}, ${q.p.g}, ${q.p.b}, ${a})`;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
