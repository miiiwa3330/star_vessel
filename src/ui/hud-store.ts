/**
 * 画面の表示（HUD）に出す値と、画面から世界への操作。
 * 世界のループが 1 秒に 10 回だけ値を書き、React が読む。
 * 毎フレーム React を動かさないため（docs/tech/stack.md「2. 3D と画面の部品のつなぎ方」）。
 */
import type { RadarBlip } from '../world/radar';
import type { StampId } from '../world/stamps';
import { DEFAULT_STAR_LIMIT, type StarLimitMode } from '../world/stars';
import type { ViewMode } from '../controls/chase-camera';
import type { Visit } from '../world/visits';

/** スマホの画面のボタンで押せるキー */
export type MoveKeyCode = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'Space' | 'ShiftLeft';

/** 情報のカード（要件 F36・F37） */
export interface InfoCardState {
  key: string;
  name: string;
  /** 選んだ天体・近づいた天体（照準の先は aimLabel の 1 行だけ） */
  source: 'selected' | 'near';
  /** 自分からの距離（表示用の文字） */
  distance: string;
  details: string[];
  /** はじめて訪れたとき（近づいたカードだけ） */
  firstVisit: boolean;
}

/** 近くの天体の一覧の 1 行 */
export interface NearbyItem {
  key: string;
  name: string;
  kindJa: string;
  distance: string;
}
export interface NearbySection {
  title: string;
  items: NearbyItem[];
}

/** 左の列で開いているパネル */
export type LeftPanel = 'stamps' | 'nearby' | 'collection' | null;

/** スタンプの履歴の 1 行 */
export interface StampLogItem {
  key: number;
  hue: number;
  text: string;
  mine: boolean;
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
  /** 一人称・後ろから・前から */
  viewMode: ViewMode;
  /** ゲームメニュー（一時停止）を出しているか。PC で Esc を押してカーソルを出したとき（要件 F60） */
  paused: boolean;
  /** 左上の表示（座標など）を出しているか（F3 キーで切り替え） */
  statusVisible: boolean;
  /** スマホの三人称で、1 本指のドラッグでカメラを回すか */
  orbitDrag: boolean;
  /** スタンプを送れるか（宇宙の部屋につながっているか） */
  stampReady: boolean;
  stampLog: StampLogItem[];
  /** いる場所の目印（星団の中なら、その名前） */
  region: string | null;
  /** 中にいる星雲・銀河の名前 */
  deepRegion: string | null;
  /** 地球の中心を原点にした自分の位置（km・EQJ。要件 F39） */
  fromEarthKm: { x: number; y: number; z: number };
  /** 星の見え方（要件 F34） */
  starLimit: StarLimitMode;
  /** 星座の線を出しているか（要件 F40） */
  constellations: boolean;
  /** 照準の先の星座の名前（星座の線を出しているときだけ） */
  aimConstellation: string | null;
  infoCard: InfoCardState | null;
  /** 照準の先の天体（照準の下に 1 行だけ出す。要件 F36） */
  aimLabel: { name: string; distance: string } | null;
  /** 選んだ天体（印を付ける） */
  selectedKey: string | null;
  leftPanel: LeftPanel;
  nearby: NearbySection[];
  /** 訪れた天体（古い順） */
  visits: Visit[];
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
  paused: false,
  statusVisible: true,
  orbitDrag: false,
  stampReady: false,
  stampLog: [],
  region: null,
  deepRegion: null,
  fromEarthKm: { x: 0, y: 0, z: 0 },
  starLimit: DEFAULT_STAR_LIMIT,
  constellations: false,
  aimConstellation: null,
  infoCard: null,
  aimLabel: null,
  selectedKey: null,
  leftPanel: null,
  nearby: [],
  visits: [],
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
  /** 一人称 → 後ろから → 前から と切り替える */
  toggleView: (): void => {},
  /** ゲームメニューから操縦に戻る（カーソルを消す。押したときの処理の中で呼ぶ） */
  resume: (): void => {},
  /** スマホの十字のボタン・上昇・下降のボタンで、キーを押す・離す（code は KeyboardEvent.code） */
  setMoveKey: (_code: MoveKeyCode, _down: boolean): void => {},
  /** スマホの三人称で、ドラッグを「船の向き」と「カメラを回す」で切り替える */
  toggleOrbitDrag: (): void => {},
  /** 星の見え方を、肉眼 → 双眼鏡 → 写真 → 肉眼…と切り替える */
  cycleStarLimit: (): void => {},
  /** 星座の線を出す・消す（要件 F40） */
  toggleConstellations: (): void => {},
  /** スタンプを送る（要件 F6） */
  sendStamp: (_id: StampId): void => {},
  /** 天体を選ぶ（null で選ぶのをやめる。要件 F35） */
  selectTarget: (_key: string | null): void => {},
  /** 選んだ天体の方を向く */
  faceTarget: (): void => {},
  /** 左の列のパネルを開く・閉じる（同じものを押すと閉じる） */
  toggleLeftPanel: (panel: Exclude<LeftPanel, null>): void => {
    hudStore.set({ leftPanel: hudStore.get().leftPanel === panel ? null : panel });
  },
  /** 左上の表示（座標など）を出す・消す（F3 キー） */
  toggleStatus: (): void => {
    hudStore.set({ statusVisible: !hudStore.get().statusVisible });
  },
};

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function showNotice(text: string, ms = 3000): void {
  hudStore.set({ notice: text });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => hudStore.set({ notice: null }), ms);
}
