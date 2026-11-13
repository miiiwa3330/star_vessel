/**
 * 図鑑の詳細の天体を、ドラッグで回せる 3D の絵として描く（2026-11-12。要件 F38）。
 * three.js を使わず、2D の canvas に 1 画素ずつ描く（宇宙の描画〈WebGPU〉と取り合わず、天体 1 つなら十分に速い）。
 * - 球：横 2：縦 1 の地図（画像・自動の模様）を、回した球に貼る。光は左上の手前から（光る天体は影を付けない）
 * - 環・円盤：赤道の面の輪。球より手前の部分だけ球の上に、奥の部分は球に隠す
 * - 点の集まり（星団・銀河・星雲・彗星）：3D の点を回して、奥から順に重ねる
 * 見る向きは yaw（縦の軸のまわり）と pitch（横の軸のまわり）。正射影（遠くから見た形）
 */

export interface SurfaceMap {
  width: number;
  height: number;
  /** RGBA。上の行（北極）から */
  data: Uint8ClampedArray | Uint8Array;
}

export interface GlobeOptions {
  yaw: number;
  pitch: number;
  /** 光る天体（恒星）：影を付けず、ふちを少し暗くする */
  emissive?: boolean;
  /** 地図が無いときの色（0〜255） */
  color?: readonly [number, number, number];
  /** 環（内側・外側の半径は、球の半径を 1） */
  ring?: { inner: number; outer: number; color: readonly [number, number, number]; alpha: number; emissive?: boolean };
  /** 大気の色（ふちのにじみ。0〜255） */
  atmosphere?: readonly [number, number, number];
}

/** 描く範囲の半径（球の半径を 1）。環がはみ出す分と、にじみの分を空ける */
export const globeExtent = (o: Pick<GlobeOptions, 'ring' | 'atmosphere'>): number => Math.max(o.ring ? o.ring.outer * 1.02 : 1, o.atmosphere ? 1.12 : 1.04);

/** 見る向きの回転（体の座標 → 見る座標）。体の北極は +y、見る人は +z の側にいる */
export function viewMatrix(yaw: number, pitch: number): number[] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Rx(pitch)·Ry(yaw)
  return [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy];
}

/** 見る座標の点を、体の座標にする（回転の逆＝転置） */
export function toBody(m: readonly number[], x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
}

/** 体の座標の向きから、地図の上の位置（0〜1） */
export function mapUv(bx: number, by: number, bz: number): [number, number] {
  const lon = Math.atan2(bx, bz);
  const lat = Math.asin(Math.max(-1, Math.min(1, by)));
  return [((lon / (2 * Math.PI) + 0.5) % 1 + 1) % 1, 0.5 - lat / Math.PI];
}

const LIGHT = (() => {
  const v = [-0.55, 0.45, 0.7];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** 球（と環）を out に描く。out は size×size の RGBA（透明で始まる） */
export function renderGlobe(out: Uint8ClampedArray, size: number, map: SurfaceMap | null, o: GlobeOptions): void {
  const ext = globeExtent(o);
  const m = viewMatrix(o.yaw, o.pitch);
  // 環の面の向き（体の +y を見る座標に）
  const nx = m[1];
  const ny = m[4];
  const nz = m[7];
  const base = o.color ?? [150, 150, 150];
  for (let py = 0; py < size; py++) {
    const y = -(((py + 0.5) / size) * 2 - 1) * ext;
    for (let px = 0; px < size; px++) {
      const x = (((px + 0.5) / size) * 2 - 1) * ext;
      const i = (py * size + px) * 4;
      const rr = x * x + y * y;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let zSphere = -Infinity;
      if (rr <= 1) {
        const z = Math.sqrt(1 - rr);
        zSphere = z;
        const [bx, by, bz] = toBody(m, x, y, z);
        let cr = base[0];
        let cg = base[1];
        let cb = base[2];
        if (map) {
          const [u, v] = mapUv(bx, by, bz);
          const sx = Math.min(map.width - 1, (u * map.width) | 0);
          const sy = Math.min(map.height - 1, (v * map.height) | 0);
          const j = (sy * map.width + sx) * 4;
          cr = map.data[j];
          cg = map.data[j + 1];
          cb = map.data[j + 2];
        }
        let shade: number;
        if (o.emissive) shade = 0.62 + 0.38 * z;
        else {
          const d = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2];
          shade = 0.07 + 0.93 * Math.max(0, d);
        }
        r = cr * shade;
        g = cg * shade;
        b = cb * shade;
        a = 255;
        // ふちのにじみ（大気）
        if (o.atmosphere) {
          const rim = (1 - z) ** 3 * 0.8;
          r += o.atmosphere[0] * rim;
          g += o.atmosphere[1] * rim;
          b += o.atmosphere[2] * rim;
        }
        // ふちをなめらかに（大気のある天体は、外のにじみの色へつなぐ。間に透けた筋ができないように）
        const edge = Math.max(0, Math.min(1, ((1 - Math.sqrt(rr)) * size * 0.5) / ext));
        if (o.atmosphere) {
          r = r * edge + o.atmosphere[0] * (1 - edge);
          g = g * edge + o.atmosphere[1] * (1 - edge);
          b = b * edge + o.atmosphere[2] * (1 - edge);
          a = 255 * (edge + (1 - edge) * 0.5);
        } else a = 255 * edge;
      } else if (o.atmosphere && rr < 1.12 * 1.12) {
        const t = 1 - (Math.sqrt(rr) - 1) / 0.12;
        a = 255 * t * t * 0.5;
        r = o.atmosphere[0];
        g = o.atmosphere[1];
        b = o.atmosphere[2];
      }
      if (o.ring && Math.abs(nz) > 1e-4) {
        // 視線（−z の向き）と環の面の交わり
        const t = -(nx * x + ny * y) / nz;
        const d = Math.sqrt(rr + t * t);
        if (d >= o.ring.inner && d <= o.ring.outer && t > zSphere) {
          const q = (d - o.ring.inner) / (o.ring.outer - o.ring.inner);
          // 細い縞（見た目のための模様）
          const band = 0.65 + 0.35 * Math.sin(q * 41) * Math.sin(q * 13 + 1);
          let ra = o.ring.alpha * band;
          // 球の影（光と反対の側）：球の後ろに隠れる環を暗くする
          let lit = 1;
          if (!o.ring.emissive) {
            const [bx, by, bz] = [x, y, t];
            const along = bx * LIGHT[0] + by * LIGHT[1] + bz * LIGHT[2];
            const perp2 = bx * bx + by * by + bz * bz - along * along;
            if (along < 0 && perp2 < 1) lit = 0.25;
          } else ra = Math.min(1, ra * (1.4 - q));
          const rc = o.ring.color;
          r = r * (1 - ra) + rc[0] * lit * ra;
          g = g * (1 - ra) + rc[1] * lit * ra;
          b = b * (1 - ra) + rc[2] * lit * ra;
          a = Math.max(a, 255 * ra);
        }
      }
      out[i] = r > 255 ? 255 : r;
      out[i + 1] = g > 255 ? 255 : g;
      out[i + 2] = b > 255 ? 255 : b;
      out[i + 3] = a > 255 ? 255 : a;
    }
  }
}

/** 点の集まりの 1 点（体の座標。半径 1 の中に入れる） */
export interface CloudPoint {
  x: number;
  y: number;
  z: number;
  /** 画面の上の大きさ（描く範囲の幅を 1） */
  s: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 点を回して、画面の位置と奥行きにする（奥のものから並べる） */
export function projectCloud(points: readonly CloudPoint[], yaw: number, pitch: number): { p: CloudPoint; x: number; y: number; z: number }[] {
  const m = viewMatrix(yaw, pitch);
  return points
    .map((p) => ({
      p,
      x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
      y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
      z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
    }))
    .sort((a, b) => a.z - b.z);
}
