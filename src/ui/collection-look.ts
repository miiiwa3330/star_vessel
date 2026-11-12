/**
 * コレクション（図鑑）の絵（要件 F38。2026-11-12）。訪れた天体を、一覧と詳細で、丸い天体の絵として見せる。
 * 3D の描画は使わず、CSS で描く（一覧に 15 個並べても重くならないように）：
 * 画像のある天体は、その画像（横 2：縦 1 の地図）を丸の中に貼り、横に動かして自転に見せる。
 * 画像の無い天体は、宇宙の中と同じ模様（src/world/surface.ts）を小さく描いて貼る
 */
import { TEXTURE_FILES, SURFACE_LOOKS, DEFAULT_LOOK, RING_COLOR } from '../render/body-looks';
import { paintSurface, type Rgb, type SurfaceLook } from '../world/surface';
import type { BodyInfo } from '../world/solar-system';
import type { InfoKind } from '../world/info';

export type CollectionLook =
  | {
      type: 'globe';
      /** 画像の URL（画像が無い天体は、模様を描いた data: の URL） */
      url: string;
      /** 大気の色（CSS の色） */
      atmosphere?: string;
      /** 環（内側・外側の半径を、天体の半径の何倍か） */
      rings?: { inner: number; outer: number; color: string };
    }
  | { type: 'star'; color: string }
  | { type: 'black-hole' }
  | { type: 'cluster' }
  | { type: 'nebula' }
  | { type: 'galaxy' }
  | { type: 'craft' }
  | { type: 'comet' };

const css = (c: readonly number[], a = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
const css01 = (c: readonly number[], a = 1) => css([c[0] * 255, c[1] * 255, c[2] * 255], a);

/** 模様を描いた画像（同じ天体は 1 回だけ描く） */
const painted = new Map<string, string>();
function paintedUrl(key: string, look: SurfaceLook, seed: number): string {
  const hit = painted.get(key);
  if (hit) return hit;
  const img = paintSurface(look, seed, 256, 128);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  let url = '';
  if (ctx) {
    const data = ctx.createImageData(img.width, img.height);
    data.data.set(img.data);
    ctx.putImageData(data, 0, 0);
    url = canvas.toDataURL('image/png');
  }
  painted.set(key, url);
  return url;
}

/** 文字列から決まる種（自動で作る模様の種が無い天体のため） */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 天体の一覧の天体の絵 */
export function bodyLook(b: BodyInfo, kind: InfoKind): CollectionLook {
  if (kind === 'black-hole') return { type: 'black-hole' };
  if (b.kind === 'star') return { type: 'star', color: css01(b.glow ?? [1, 0.95, 0.85]) };
  if (kind === 'satellite' || kind === 'spacecraft') return { type: 'craft' };
  if (kind === 'comet') return { type: 'comet' };
  const file = TEXTURE_FILES[b.id];
  const url = file
    ? `/textures/${file}`
    : paintedUrl(b.id, b.surface?.look ?? SURFACE_LOOKS[b.id] ?? DEFAULT_LOOK, b.surface?.seed ?? seedOf(b.id));
  const look: CollectionLook = { type: 'globe', url };
  if (b.atmosphere) look.atmosphere = css01(b.atmosphere.color, 0.55);
  // 環は、明るい環だけ描く（木星・天王星・海王星の暗い環は、宇宙の中でもほとんど見えないのに、描くと星が小さくなるため）
  if (b.rings && b.rings.length > 0 && !b.ringColor) {
    const inner = Math.min(...b.rings.map((r) => r.innerKm)) / b.radiusKm;
    const outer = Math.max(...b.rings.map((r) => r.outerKm)) / b.radiusKm;
    look.rings = { inner, outer, color: css(RING_COLOR as Rgb, 0.8) };
  }
  return look;
}

/** 天体の一覧に無いもの（星団・星雲・銀河、いまは近くにない小さな天体）の絵 */
export function kindLook(kind: InfoKind, key: string): CollectionLook {
  switch (kind) {
    case 'cluster':
      return { type: 'cluster' };
    case 'nebula':
      return { type: 'nebula' };
    case 'galaxy':
      return { type: 'galaxy' };
    case 'black-hole':
      return { type: 'black-hole' };
    case 'star':
    case 'white-dwarf':
    case 'neutron-star':
      return { type: 'star', color: kind === 'star' ? 'rgb(255, 236, 200)' : 'rgb(205, 220, 255)' };
    case 'satellite':
    case 'spacecraft':
      return { type: 'craft' };
    case 'comet':
      return { type: 'comet' };
    default:
      return { type: 'globe', url: paintedUrl(key, DEFAULT_LOOK, seedOf(key)) };
  }
}
