/**
 * コレクション（図鑑）の天体の絵の決まり（要件 F38。2026-11-12）。
 * 一覧の小さな絵（BodyGlobe.tsx。CSS で描く）と、詳細の回せる絵（ObjectViewer.tsx。canvas に描く）の両方で使う。
 * - 球の天体：画像のある天体（地球・月・水星〜海王星）はその画像、無い天体は宇宙の中と同じ模様（src/world/surface.ts）
 * - 環は明るい環だけ（木星・天王星・海王星の暗い環は、宇宙の中でもほとんど見えないのに、描くと星が小さくなるため）
 * - 恒星・星団・星雲・銀河・彗星は、**天体 1 つずつのデータに合わせた絵**（2026-11-13。大きさ・形・色の決め方は src/world/picture.ts）
 * - ブラックホール・人工の物は、種類の形
 * 模様は、絵を出すときに初めて描く（まだ訪れていない天体は黒いシルエットなので、描かない）
 */
import { TEXTURE_FILES, SURFACE_LOOKS, DEFAULT_LOOK, RING_COLOR } from '../render/body-looks';
import { fbm, paintSurface, type Rgb, type SurfaceImage, type SurfaceLook } from '../world/surface';
import {
  COMPACT_STAR_PICTURE,
  DEFAULT_CLUSTER_PICTURE,
  DEFAULT_COMET_PICTURE,
  DEFAULT_GALAXY_PICTURE,
  DEFAULT_STAR_PICTURE,
  cometPicture,
  starPicture,
  type ClusterPicture,
  type CometPicture,
  type GalaxyPicture,
  type StarPicture,
  type StarSurface,
} from '../world/picture';
import { R_SUN_KM } from '../world/planets';
import { T_SUN_K } from '../world/star-color';
import type { BodyInfo } from '../world/solar-system';
import type { InfoKind } from '../world/info';
import type { NebulaType } from '../world/nebulae';
import type { SurfaceMap } from './globe-render';
import { artFigureTransform, type ConstellationArt, type ConstellationFigure } from '../world/constellation-figure';

export type CollectionLook =
  | {
      type: 'globe';
      /** 画像の URL（画像のある天体） */
      texture?: string;
      /** 画像の無い天体の模様 */
      paint?: { key: string; look: SurfaceLook; seed: number };
      /** 大気の色（0〜255） */
      atmosphere?: Rgb;
      /** 環（内側・外側の半径を、天体の半径の何倍か） */
      ring?: { inner: number; outer: number; color: Rgb; alpha: number };
    }
  | { type: 'star'; color: Rgb; seed: number; picture: StarPicture }
  | { type: 'black-hole' }
  | { type: 'cluster'; globular: boolean; seed: number; picture: ClusterPicture }
  /** scale：絵の中の大きさ（src/world/picture.ts の nebulaScale） */
  | { type: 'nebula'; nebula: NebulaType; seed: number; scale: number }
  | { type: 'galaxy'; seed: number; picture: GalaxyPicture }
  | { type: 'craft' }
  /** 星座：地球から見た線と星。art は重ねる絵（画像の URL と、絵の px → 図の座標の変換）。絵の無い星座は null */
  | { type: 'constellation'; figure: ConstellationFigure; art: { url: string; transform: readonly number[] } | null }
  | { type: 'comet'; seed: number; picture: CometPicture };

/** 天体のデータから決めた絵の値（無ければ、種類の典型の値） */
export interface LookExtra {
  color?: Rgb;
  star?: StarPicture;
  globular?: boolean;
  cluster?: ClusterPicture;
  nebula?: NebulaType;
  nebulaScale?: number;
  galaxy?: GalaxyPicture;
  comet?: CometPicture;
}

const rgb01 = (c: readonly number[]): Rgb => [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];

/** 文字列から決まる種（自動で作る模様の種が無い天体のため） */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 天体の一覧の天体の絵 */
export function bodyLook(b: BodyInfo, kind: InfoKind): CollectionLook {
  if (kind === 'black-hole' || b.kind === 'blackhole') return { type: 'black-hole' };
  if (b.kind === 'star') {
    // 白色矮星・中性子星は、天体の一覧では実際より大きな球なので（近づけるように）、半径からは決めない
    const picture = b.compact ? COMPACT_STAR_PICTURE : starPicture({ radiusSun: b.radiusKm / R_SUN_KM, teffK: b.teffK ?? T_SUN_K });
    return { type: 'star', color: rgb01(b.glow ?? [1, 0.95, 0.85]), seed: seedOf(b.id), picture };
  }
  if (kind === 'satellite' || kind === 'spacecraft') return { type: 'craft' };
  if (kind === 'comet') return { type: 'comet', seed: seedOf(b.id), picture: cometPicture({ m1: b.comet?.m1 ?? null, diameterKm: b.radiusKm * 2 }) };
  const file = TEXTURE_FILES[b.id];
  const look: CollectionLook = file
    ? { type: 'globe', texture: `/textures/${file}` }
    : { type: 'globe', paint: { key: b.id, look: b.surface?.look ?? SURFACE_LOOKS[b.id] ?? DEFAULT_LOOK, seed: b.surface?.seed ?? seedOf(b.id) } };
  if (b.atmosphere) look.atmosphere = rgb01(b.atmosphere.color);
  if (b.rings && b.rings.length > 0 && !b.ringColor) {
    const inner = Math.min(...b.rings.map((r) => r.innerKm)) / b.radiusKm;
    const outer = Math.max(...b.rings.map((r) => r.outerKm)) / b.radiusKm;
    look.ring = { inner, outer, color: RING_COLOR, alpha: 0.85 };
  }
  return look;
}

/** 星座の絵（図と、あれば重ねる絵） */
export function constellationLook(figure: ConstellationFigure, art: ConstellationArt | undefined): CollectionLook {
  const transform = art ? artFigureTransform(art, figure) : null;
  return { type: 'constellation', figure, art: art && transform ? { url: `/textures/constellations/${art.file}`, transform } : null };
}

/** 天体の一覧に無いもの（星団・星雲・銀河など）の絵 */
export function kindLook(kind: InfoKind, key: string, extra: LookExtra = {}): CollectionLook {
  const seed = seedOf(key);
  switch (kind) {
    case 'cluster':
      return { type: 'cluster', globular: !!extra.globular, seed, picture: extra.cluster ?? DEFAULT_CLUSTER_PICTURE(!!extra.globular) };
    case 'nebula':
      return { type: 'nebula', nebula: extra.nebula ?? 'hii', seed, scale: extra.nebulaScale ?? 1 };
    case 'galaxy':
      return { type: 'galaxy', seed, picture: extra.galaxy ?? DEFAULT_GALAXY_PICTURE };
    case 'black-hole':
      return { type: 'black-hole' };
    case 'star':
      return { type: 'star', color: extra.color ?? [255, 236, 200], seed, picture: extra.star ?? DEFAULT_STAR_PICTURE };
    case 'white-dwarf':
    case 'neutron-star':
      return { type: 'star', color: extra.color ?? [205, 220, 255], seed, picture: extra.star ?? COMPACT_STAR_PICTURE };
    case 'satellite':
    case 'spacecraft':
      return { type: 'craft' };
    case 'comet':
      return { type: 'comet', seed, picture: extra.comet ?? DEFAULT_COMET_PICTURE };
    default:
      return { type: 'globe', paint: { key, look: DEFAULT_LOOK, seed } };
  }
}

/**
 * 恒星の表面の模様（横 2：縦 1 の地図）。模様の種類は src/world/picture.ts の StarSurface。
 * 見た目のための模様（太陽のほかの恒星の表面は、ほとんど観測できていない）。明るさだけを変え、色は光の色のまま
 */
export function paintStar(color: Rgb, surface: StarSurface, seed: number, width = 512, height = 256): SurfaceImage {
  const data = new Uint8Array(width * height * 4);
  const smooth = (e0: number, e1: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let row = 0; row < height; row++) {
    const lat = Math.PI / 2 - ((row + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(lat);
    const pz = Math.sin(lat);
    for (let col = 0; col < width; col++) {
      const lon = ((col + 0.5) / width) * 2 * Math.PI;
      const px = cosLat * Math.cos(lon);
      const py = cosLat * Math.sin(lon);
      let k: number;
      if (surface === 'smooth') k = 0.96 + 0.08 * fbm(seed, px * 3, py * 3, pz * 3, 2);
      else if (surface === 'cells') {
        // 数個の巨大な対流の模様と、その上の細かな粒
        const big = fbm(seed, px * 1.7, py * 1.7, pz * 1.7, 3);
        k = 0.5 + 0.95 * smooth(0.25, 0.75, big) * (0.85 + 0.3 * fbm(seed + 9, px * 9, py * 9, pz * 9, 2));
      } else {
        const spots = surface === 'spots';
        // 粒（粒状斑）
        k = 0.84 + 0.28 * fbm(seed, px * (spots ? 10 : 16), py * (spots ? 10 : 16), pz * (spots ? 10 : 16), 3);
        // 黒点：赤色矮星は大きく濃い。太陽に近い星は小さく、赤道の近くに少し
        const s = fbm(seed + 5, px * (spots ? 2.6 : 7), py * (spots ? 2.6 : 7), pz * (spots ? 2.6 : 7), 3);
        const band = spots ? 1 : smooth(0.75, 0.35, Math.abs(pz));
        k *= 1 - (spots ? 0.6 : 0.4) * smooth(spots ? 0.6 : 0.72, spots ? 0.7 : 0.77, s) * band;
      }
      const o = (row * width + col) * 4;
      data[o] = Math.min(255, color[0] * k);
      data[o + 1] = Math.min(255, color[1] * k);
      data[o + 2] = Math.min(255, color[2] * k);
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 一覧の小さな絵の画像の URL（画像があればそれ、無ければ模様を 256×128 で描いた data: の URL。1 回だけ描く） */
const thumbs = new Map<string, string>();
export function globeThumbUrl(look: Extract<CollectionLook, { type: 'globe' }>): string {
  if (look.texture) return look.texture;
  const p = look.paint!;
  const hit = thumbs.get(p.key);
  if (hit !== undefined) return hit;
  const url = toDataUrl(paintSurface(p.look, p.seed, 256, 128));
  thumbs.set(p.key, url);
  return url;
}

function toDataUrl(img: { width: number; height: number; data: Uint8Array }): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const data = ctx.createImageData(img.width, img.height);
  data.data.set(img.data);
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/** 詳細の回せる絵の地図（画像は 1024×512 に縮めて読む。模様は 512×256 で描く）。同じものは 1 回だけ */
const maps = new Map<string, Promise<SurfaceMap | null>>();
export function globeMap(look: Extract<CollectionLook, { type: 'globe' | 'star' }>): Promise<SurfaceMap | null> {
  const id = look.type === 'star' ? `star:${look.seed}:${look.picture.surface}:${look.color.join(',')}` : (look.texture ?? look.paint!.key);
  const hit = maps.get(id);
  if (hit) return hit;
  let p: Promise<SurfaceMap | null>;
  if (look.type === 'star') {
    p = Promise.resolve(paintStar(look.color, look.picture.surface, look.seed));
  } else if (look.texture) {
    const url = look.texture;
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = 1024;
        const h = 512;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ width: w, height: h, data: ctx.getImageData(0, 0, w, h).data });
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } else {
    const q = look.paint!;
    p = Promise.resolve(paintSurface(q.look, q.seed, 512, 256));
  }
  maps.set(id, p);
  return p;
}

export const cssRgb = (c: readonly number[], a = 1): string => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
