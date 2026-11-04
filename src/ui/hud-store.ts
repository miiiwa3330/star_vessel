/**
 * 画面の表示（HUD）に出す値と、画面から世界への操作。
 * 世界のループが 1 秒に 10 回だけ値を書き、React が読む。
 * 毎フレーム React を動かさないため（docs/tech/stack.md「2. 3D と画面の部品のつなぎ方」）。
 */
import type { RadarBlip } from '../world/radar';
import type { HullType } from '../world/ship-design';
import type { ViewMode } from '../controls/chase-camera';

/** 宇宙船を作る画面の状態（開いていなければ null） */
export interface ShipBuilderState {
  /** 選んでいる船体（画面の後ろに、この船を見せる） */
  hull: HullType;
  /** 初めて遊ぶときに出したか */
  firstTime: boolean;
  saving: boolean;
}

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
  /** 基準の天体の名前 */
  anchorName: string;
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
  /** 一人称・三人称 */
  viewMode: ViewMode;
  /** スマホの三人称で、1 本指のドラッグでカメラを回すか */
  orbitDrag: boolean;
  shipBuilder: ShipBuilderState | null;
  /** 宇宙船の設定がサーバーに保存できるか */
  shipReady: boolean;
}

let state: HudState = {
  date: new Date(),
  anchorName: '地球',
  altitudeKm: 0,
  speedKmS: 0,
  nearbyShips: null,
  backend: '準備中',
  status: '読み込み中…',
  notice: null,
  radar: [],
  warps: [],
  warpsReady: false,
  viewMode: 'first',
  orbitDrag: false,
  shipBuilder: null,
  shipReady: false,
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
  /** 一人称・三人称を切り替える */
  toggleView: (): void => {},
  /** スマホの三人称で、ドラッグを「船の向き」と「カメラを回す」で切り替える */
  toggleOrbitDrag: (): void => {},
  openShipBuilder: (): void => {},
  /** 船体を選ぶ（画面の後ろの船が変わる） */
  previewHull: (_hull: HullType): void => {},
  saveShip: (): void => {},
  closeShipBuilder: (): void => {},
};

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function showNotice(text: string, ms = 3000): void {
  hudStore.set({ notice: text });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => hudStore.set({ notice: null }), ms);
}
