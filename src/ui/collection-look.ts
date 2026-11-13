/**
 * コレクション（図鑑）の天体の絵の決まり（要件 F38。2026-11-12）。
 * 一覧の小さな絵（BodyGlobe.tsx。CSS で描く）と、詳細の回せる絵（ObjectViewer.tsx。canvas に描く）の両方で使う。
 * - 球の天体：画像のある天体（地球・月・水星〜海王星）はその画像、無い天体は宇宙の中と同じ模様（src/world/surface.ts）
 * - 環は明るい環だけ（木星・天王星・海王星の暗い環は、宇宙の中でもほとんど見えないのに、描くと星が小さくなるため）
 * - 恒星・ブラックホール・星団・星雲・銀河・人工の物・彗星は、種類の形
 * 模様は、絵を出すときに初めて描く（まだ訪れていない天体は黒いシルエットなので、描かない）
 */
import { TEXTURE_FILES, SURFACE_LOOKS, DEFAULT_LOOK, RING_COLOR } from '../render/body-looks';
import { paintSurface, type Rgb, type SurfaceLook } from '../world/surface';
import type { BodyInfo } from '../world/solar-system';
import type { InfoKind } from '../world/info';
import type { NebulaType } from '../world/nebulae';
import type { SurfaceMap } from './globe-render';

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
  | { type: 'star'; color: Rgb; seed: number }
  | { type: 'black-hole' }
  | { type: 'cluster'; globular: boolean; seed: number }
  | { type: 'nebula'; nebula: NebulaType; seed: number }
  | { type: 'galaxy'; tType: number | null; seed: number }
  | { type: 'craft' }
  | { type: 'comet'; seed: number };

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
  if (b.kind === 'star') return { type: 'star', color: rgb01(b.glow ?? [1, 0.95, 0.85]), seed: seedOf(b.id) };
  if (kind === 'satellite' || kind === 'spacecraft') return { type: 'craft' };
  if (kind === 'comet') return { type: 'comet', seed: seedOf(b.id) };
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

/** 天体の一覧に無いもの（星団・星雲・銀河など）の絵 */
export function kindLook(kind: InfoKind, key: string, extra: { globular?: boolean; nebula?: NebulaType; tType?: number | null; color?: Rgb } = {}): CollectionLook {
  const seed = seedOf(key);
  switch (kind) {
    case 'cluster':
      return { type: 'cluster', globular: !!extra.globular, seed };
    case 'nebula':
      return { type: 'nebula', nebula: extra.nebula ?? 'hii', seed };
    case 'galaxy':
      return { type: 'galaxy', tType: extra.tType ?? null, seed };
    case 'black-hole':
      return { type: 'black-hole' };
    case 'star':
      return { type: 'star', color: extra.color ?? [255, 236, 200], seed };
    case 'white-dwarf':
    case 'neutron-star':
      return { type: 'star', color: extra.color ?? [205, 220, 255], seed };
    case 'satellite':
    case 'spacecraft':
      return { type: 'craft' };
    case 'comet':
      return { type: 'comet', seed };
    default:
      return { type: 'globe', paint: { key, look: DEFAULT_LOOK, seed } };
  }
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
export function globeMap(look: Extract<CollectionLook, { type: 'globe' }> | { type: 'star'; color: Rgb; seed: number }): Promise<SurfaceMap | null> {
  const id = look.type === 'star' ? `star:${look.seed}:${look.color.join(',')}` : (look.texture ?? look.paint!.key);
  const hit = maps.get(id);
  if (hit) return hit;
  let p: Promise<SurfaceMap | null>;
  if (look.type === 'star') {
    // 恒星の表面：光の色の、こまかな粒の模様（見た目のための模様）
    const c = look.color;
    const shade = (k: number): Rgb => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
    p = Promise.resolve(paintSurface({ kind: 'rocky', colors: [shade(0.78), shade(0.95), shade(1.08)], craters: 0 }, look.seed, 512, 256));
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
