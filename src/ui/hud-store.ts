/**
 * 画面の表示（HUD）に出す値。世界のループが 1 秒に数回だけ書き、React が読む。
 * 毎フレーム React を動かさないため（docs/tech/stack.md「2. 3D と画面の部品のつなぎ方」）。
 */
import type { BodyId } from '../world/solar-system';

export interface HudState {
  date: Date;
  anchor: BodyId;
  /** 基準の天体の表面からの高さ（km） */
  altitudeKm: number;
  speedKmS: number;
  backend: 'WebGPU' | 'WebGL2' | '準備中';
  status: string | null;
}

let state: HudState = {
  date: new Date(),
  anchor: 'Earth',
  altitudeKm: 0,
  speedKmS: 0,
  backend: '準備中',
  status: '読み込み中…',
};
const listeners = new Set<() => void>();

export const hudStore = {
  get: () => state,
  set(patch: Partial<HudState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
