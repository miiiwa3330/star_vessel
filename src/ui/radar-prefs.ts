/**
 * レーダーの範囲と、出すものの種類を、この端末に覚えておく（2026-11-12）。
 * 覚えておけない環境（プライベートのウィンドウなど）では、ふだんの値で動く
 */
import { clampRadarMaxKm, DEFAULT_RADAR_LAYERS, RADAR_LAYERS, RADAR_RANGE, type RadarLayer } from '../world/radar';

/** 名前が「マップ」だったころの記号のまま（覚えている値を引き継ぐため。2026-11-12 にレーダーへ名前を変えた） */
const KEY = 'sv.map';

export interface RadarPrefs {
  rangeKm: number;
  layers: Record<RadarLayer, boolean>;
}

export function loadRadarPrefs(): RadarPrefs {
  const prefs: RadarPrefs = { rangeKm: RADAR_RANGE.maxKm, layers: { ...DEFAULT_RADAR_LAYERS } };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const r = raw as { rangeKm?: unknown; layers?: unknown };
      if (typeof r.rangeKm === 'number') prefs.rangeKm = clampRadarMaxKm(r.rangeKm);
      if (r.layers && typeof r.layers === 'object') {
        for (const { id } of RADAR_LAYERS) {
          const v = (r.layers as Record<string, unknown>)[id];
          if (typeof v === 'boolean') prefs.layers[id] = v;
        }
      }
    }
  } catch {
    // 読めなければ、ふだんの値
  }
  return prefs;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** 二本指で範囲を変えている間に何度も書かないよう、少し待ってから書く */
export function saveRadarPrefs(prefs: RadarPrefs): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // 書けなくても、いまの画面ではそのまま使える
    }
  }, 400);
}
