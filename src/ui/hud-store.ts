/**
 * 画面の表示（HUD）に出す値と、画面から世界への操作。
 * 世界のループが 1 秒に 10 回だけ値を書き、React が読む。
 * 毎フレーム React を動かさないため（docs/tech/stack.md「2. 3D と画面の部品のつなぎ方」）。
 */
import type { RadarBlip } from '../world/radar';
import type { BodyId } from '../world/solar-system';

export interface WarpListItem {
  id: string;
  name: string;
  distanceKm: number;
  mine: boolean;
}

export interface HudState {
  date: Date;
  anchor: BodyId;
  /** 基準の天体の表面からの高さ（km） */
  altitudeKm: number;
  speedKmS: number;
  backend: 'WebGPU' | 'WebGL2' | '準備中';
  status: string | null;
  /** 一時的なお知らせ（ワープホールを置いた、など） */
  notice: string | null;
  radar: RadarBlip[];
  warps: WarpListItem[];
  /** ワープホールが全員と共有されているか（仮の保存のあいだは false） */
  warpsShared: boolean;
}

let state: HudState = {
  date: new Date(),
  anchor: 'Earth',
  altitudeKm: 0,
  speedKmS: 0,
  backend: '準備中',
  status: '読み込み中…',
  notice: null,
  radar: [],
  warps: [],
  warpsShared: false,
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

/** 画面から世界への操作。main.ts が中身を入れる */
export const hudActions = {
  placeWarp: (): void => {},
  warpTo: (_id: string): void => {},
  removeWarp: (_id: string): void => {},
};

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function showNotice(text: string, ms = 3000): void {
  hudStore.set({ notice: text });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => hudStore.set({ notice: null }), ms);
}
