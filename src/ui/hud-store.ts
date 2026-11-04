/**
 * 画面の表示（HUD）に出す値と、画面から世界への操作。
 * 世界のループが 1 秒に 10 回だけ値を書き、React が読む。
 * 毎フレーム React を動かさないため（docs/tech/stack.md「2. 3D と画面の部品のつなぎ方」）。
 */
import type { RadarBlip } from '../world/radar';
import type { BodyId } from '../world/solar-system';

export interface WarpListItem {
  id: string;
  /** 宇宙の住所（例：MW-ORI-SOL-3-1-002） */
  code: string;
  /** 住所の読み（例：天の川銀河 オリオン腕 太陽系 地球 月 2番） */
  reading: string;
  distanceKm: number;
  mine: boolean;
}

export interface HudState {
  date: Date;
  anchor: BodyId;
  /** 基準の天体の表面からの高さ（km） */
  altitudeKm: number;
  speedKmS: number;
  /** 近くにいるほかのプレイヤーの数（部屋につながっていなければ null） */
  nearbyShips: number | null;
  backend: 'WebGPU' | 'WebGL2' | '準備中';
  status: string | null;
  /** 一時的なお知らせ（ワープホールを置いた、など） */
  notice: string | null;
  radar: RadarBlip[];
  warps: WarpListItem[];
  /** ワープホールが使えるか（サーバーにつながらないときは false） */
  warpsReady: boolean;
}

let state: HudState = {
  date: new Date(),
  anchor: 'Earth',
  altitudeKm: 0,
  speedKmS: 0,
  nearbyShips: null,
  backend: '準備中',
  status: '読み込み中…',
  notice: null,
  radar: [],
  warps: [],
  warpsReady: false,
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
  /** 一覧を開いたときに、全員のワープホールを取り直す */
  refreshWarps: (): void => {},
  /** 速さを変える（スマホのボタン用） */
  changeSpeed: (_steps: number): void => {},
};

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function showNotice(text: string, ms = 3000): void {
  hudStore.set({ notice: text });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => hudStore.set({ notice: null }), ms);
}
