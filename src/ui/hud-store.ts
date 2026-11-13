/**
 * 画面の表示（HUD）に出す値と、画面から世界への操作。
 * 世界のループが 1 秒に 10 回だけ値を書き、React が読む。
 * 毎フレーム React を動かさないため（docs/tech/stack.md「2. 3D と画面の部品のつなぎ方」）。
 */
import { clampRadarMaxKm, type RadarLayer, type RadarBlip } from '../world/radar';
import { loadRadarPrefs, saveRadarPrefs } from './radar-prefs';
import { DEFAULT_STAR_LIMIT, type StarLimitMode } from '../world/stars';
import type { ViewMode } from '../controls/chase-camera';
import type { Visit } from '../world/visits';
import type { InfoKind } from '../world/info';
import type { Vec3 } from '../world/vec';

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

/**
 * 開いている画面（どれか 1 つだけ。2026-11-12）。PC では、どれかが開いている間はカーソルを出し、閉じると操縦に戻る（カーソルを消す）。
 * menu：ゲームメニュー（Esc）・radar：大きくしたレーダー（R。ワープもここから。前の名前はマップ）・map：3D のマップ（M・6）・
 * chat：チャットの入力（Enter・T）・collection：コレクション（1）・photo：撮った写真（5・F2）
 */
export type Overlay = 'menu' | 'radar' | 'map' | 'chat' | 'collection' | 'photo' | null;

/** 3D のマップに出す、訪れた場所（要件 F62）。位置が分からないもの（遠くへ行った彗星など）は出さない */
export interface MapPoint {
  key: string;
  name: string;
  kind: InfoKind;
  /** 太陽中心の位置（km・EQJ） */
  positionKm: Vec3;
}

/** 撮った写真（要件 F61。ブラウザの中だけに置き、保存・共有するまでどこにも送らない） */
export interface Photo {
  /** URL.createObjectURL の URL（閉じたら消す） */
  url: string;
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
}

/** チャットの履歴の 1 行（要件 F6） */
export interface ChatLogItem {
  key: number;
  hue: number;
  /** 宇宙船名（サインアップしていない人は null） */
  name: string | null;
  text: string;
  mine: boolean;
  /** 受け取った時刻（Date.now()。ふだんの表示で、しばらくたった行を消すため） */
  at: number;
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
  /** 基準の天体の名前（英語。左上の表示） */
  anchorName: string;
  /** 基準の天体の表面からの高さ（km） */
  altitudeKm: number;
  speedKmS: number;
  /** 近くにいるほかのプレイヤーの数（部屋につながっていなければ null） */
  nearbyShips: number | null;
  backend: 'WebGPU' | 'WebGL2' | 'Loading';
  /** 左上の状態の文（英語） */
  status: string | null;
  /** 一時的なお知らせ（ワープホールを置いた、など） */
  notice: string | null;
  radar: RadarBlip[];
  /** レーダー（大きくしたものも、隅の小さなものも）のふちの距離（km）。二本指・ホイールで変える */
  radarRangeKm: number;
  /** レーダー（大きくしたものも、隅の小さなものも）に出すものの種類 */
  radarLayers: Record<RadarLayer, boolean>;
  warps: WarpListItem[];
  /** ワープホールが使えるか（サーバーにつながらないときは false） */
  warpsReady: boolean;
  /** 一人称・後ろから・前から */
  viewMode: ViewMode;
  /** 開いている画面（ゲームメニュー・レーダー・マップ・チャットの入力・コレクション・写真） */
  overlay: Overlay;
  /** マウスのカーソルを消して操縦する端末か（PC）。スマホは false */
  pointerLock: boolean;
  /** いまカーソルを消して操縦しているか（PC） */
  locked: boolean;
  /** 左上の表示（座標など）を出しているか（F3 キーで切り替え） */
  statusVisible: boolean;
  /** スマホの三人称で、1 本指のドラッグでカメラを回すか */
  orbitDrag: boolean;
  /** チャットを送れるか（宇宙の部屋につながっているか） */
  chatReady: boolean;
  /** チャットの履歴（新しい順） */
  chatLog: ChatLogItem[];
  /** いる場所の目印（星団の中なら、その名前。英語） */
  region: string | null;
  /** 中にいる星雲・銀河の名前（英語） */
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
  /** レーダーで選んだワープホール（TARGET と同じ場所にカードを出す。選んだ天体とはどちらか一方。レーダーを閉じるとやめる） */
  selectedWarp: string | null;
  /** 訪れた天体（古い順） */
  visits: Visit[];
  /** 撮った写真（写真の画面を開いている間） */
  photo: Photo | null;
  /** 3D のマップの点（マップを開いている間だけ、1 秒ごとに入れ直す） */
  mapPoints: MapPoint[];
  /** 3D のマップを開いたときの、自分の位置（太陽中心 km） */
  mapSelfKm: Vec3;
  /** 3D のマップを開いたときに、真ん中にする訪れた場所（コレクションの「MAP で見る」。null なら自分） */
  mapFocus: string | null;
  /** いる場所で消せる自分のワープホール（下のワープホールのボタンが、消すボタンになる） */
  warpHere: { id: string; code: string } | null;
  /** 写真を撮った回数（シャッターの光を出すため） */
  shutter: number;
}

const radarPrefs = loadRadarPrefs();

let state: HudState = {
  date: new Date(),
  anchorName: 'Earth',
  altitudeKm: 0,
  speedKmS: 0,
  nearbyShips: null,
  backend: 'Loading',
  status: 'Loading…',
  notice: null,
  radar: [],
  radarRangeKm: radarPrefs.rangeKm,
  radarLayers: radarPrefs.layers,
  warps: [],
  warpsReady: false,
  viewMode: 'first',
  overlay: null,
  pointerLock: false,
  locked: false,
  statusVisible: true,
  orbitDrag: false,
  chatReady: false,
  chatLog: [],
  region: null,
  deepRegion: null,
  fromEarthKm: { x: 0, y: 0, z: 0 },
  starLimit: DEFAULT_STAR_LIMIT,
  constellations: false,
  aimConstellation: null,
  infoCard: null,
  aimLabel: null,
  selectedKey: null,
  selectedWarp: null,
  visits: [],
  photo: null,
  mapPoints: [],
  mapSelfKm: { x: 0, y: 0, z: 0 },
  mapFocus: null,
  warpHere: null,
  shutter: 0,
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
  /**
   * 下のワープホールのボタン（4 キー）。ふだんは、いまの場所にワープホールを作る。
   * 自分のワープホールのそばでは、そのワープホールを消す（もう一度押すと消える。2026-11-12）
   */
  pressWarpButton: (): void => {},
  /** 図鑑の天体の方を向く（図鑑の「その方を向く」）。main.ts が中身を入れる */
  faceEntry: (_key: string): void => {},
  /** 3D のマップを、訪れた場所を真ん中にして開く（コレクションから） */
  openMapAt: (key: string): void => {
    hudStore.set({ mapFocus: key });
    hudActions.setOverlay('map');
  },
  /** ワープする（レーダーで選んだワープホールのカードから） */
  warpTo: (_id: string): void => {},
  /** ワープホールを選ぶ（null でやめる）。選ぶと、選んでいた天体はやめる */
  selectWarp: (id: string | null): void => {
    if (id !== null && hudStore.get().selectedKey !== null) hudActions.selectTarget(null);
    hudStore.set({ selectedWarp: id });
  },
  /** 選んだワープホールの方を向く */
  faceWarp: (_id: string): void => {},
  /** レーダーを開いたときに、全員のワープホールを取り直す */
  refreshWarps: (): void => {},
  /** 写真を撮る（下のボタン・5・F2）。main.ts が中身を入れる */
  takePhoto: (): void => {},
  /** レーダーの範囲（ふちの距離 km）を変える。この端末に覚えておく */
  setRadarRange: (km: number): void => {
    const rangeKm = clampRadarMaxKm(km);
    if (rangeKm === hudStore.get().radarRangeKm) return;
    hudStore.set({ radarRangeKm: rangeKm });
    saveRadarPrefs({ rangeKm, layers: hudStore.get().radarLayers });
  },
  /** レーダーに出すものの種類を、出す・出さないと切り替える。この端末に覚えておく */
  toggleRadarLayer: (layer: RadarLayer): void => {
    const cur = hudStore.get();
    const layers = { ...cur.radarLayers, [layer]: !cur.radarLayers[layer] };
    hudStore.set({ radarLayers: layers });
    saveRadarPrefs({ rangeKm: cur.radarRangeKm, layers });
  },
  /** 速さを変える（スマホのボタン用） */
  changeSpeed: (_steps: number): void => {},
  /** 一人称 → 後ろから → 前から と切り替える */
  toggleView: (): void => {},
  /**
   * 画面を開く・閉じる（null で閉じて操縦に戻る）。PC では、開くとカーソルを出し、閉じるとカーソルを消す
   * （カーソルを消すのは、押したときの処理の中でしかできないので、クリック・キーの処理の中で呼ぶ）。main.ts が中身を入れる
   */
  setOverlay: (overlay: Overlay): void => {
    hudStore.set({ overlay });
  },
  /** 同じ画面が開いていれば閉じ、そうでなければ開く */
  toggleOverlay: (overlay: Exclude<Overlay, null>): void => {
    hudActions.setOverlay(hudStore.get().overlay === overlay ? null : overlay);
  },
  /** スマホの十字のボタン・上昇・下降のボタンで、キーを押す・離す（code は KeyboardEvent.code） */
  setMoveKey: (_code: MoveKeyCode, _down: boolean): void => {},
  /** スマホの三人称で、ドラッグを「船の向き」と「カメラを回す」で切り替える */
  toggleOrbitDrag: (): void => {},
  /** 星の見え方を、肉眼 → 双眼鏡 → 写真 → 肉眼…と切り替える */
  cycleStarLimit: (): void => {},
  /** 星座の線を出す・消す（要件 F40） */
  toggleConstellations: (): void => {},
  /** チャットを送る（要件 F6）。送れたら true */
  sendChat: (_text: string): boolean => false,
  /** 天体を選ぶ（null で選ぶのをやめる。要件 F35） */
  selectTarget: (_key: string | null): void => {},
  /** 選んだ天体の方を向く */
  faceTarget: (): void => {},
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
