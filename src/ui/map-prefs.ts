/**
 * マップの範囲と、出すものの種類を、この端末に覚えておく（2026-11-12）。
 * 覚えておけない環境（プライベートのウィンドウなど）では、ふだんの値で動く
 */
import { clampRadarMaxKm, DEFAULT_MAP_LAYERS, MAP_LAYERS, RADAR_RANGE, type MapLayer } from '../world/radar';

const KEY = 'sv.map';

export interface MapPrefs {
  rangeKm: number;
  layers: Record<MapLayer, boolean>;
}

export function loadMapPrefs(): MapPrefs {
  const prefs: MapPrefs = { rangeKm: RADAR_RANGE.maxKm, layers: { ...DEFAULT_MAP_LAYERS } };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const r = raw as { rangeKm?: unknown; layers?: unknown };
      if (typeof r.rangeKm === 'number') prefs.rangeKm = clampRadarMaxKm(r.rangeKm);
      if (r.layers && typeof r.layers === 'object') {
        for (const { id } of MAP_LAYERS) {
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
export function saveMapPrefs(prefs: MapPrefs): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // 書けなくても、いまの画面ではそのまま使える
    }
  }, 400);
}
