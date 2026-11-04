/**
 * 人工衛星の軌道要素（TLE）の取り込み。サーバー（worker/satellites.ts）とツール（tools/build-satellites.mjs と同じ決め方）で使う。
 * 出どころは SatNOGS DB（https://db.satnogs.org/、CC BY-SA 4.0）。決まりは docs/tech/satellites.md。
 * three.js・DOM・astronomy-engine・satellite.js を読み込まない。
 */
export interface SatelliteRecord {
  /** NORAD のカタログ番号 */
  id: number;
  name: string;
  l1: string;
  l2: string;
}

export const SATNOGS_TLE_URL = 'https://db.satnogs.org/api/tle/?format=json';
/** 宇宙ステーションに結合している部品の名前（本体の ISS (ZARYA)・CSS (TIANHE) 以外） */
const DOCKED_MODULE = /^(ISS|CSS) \((?!ZARYA|TIANHE)/;

/** SatNOGS の TLE の一覧を、使う形にする。形のおかしいものは捨てる */
export function fromSatnogs(raw: unknown): SatelliteRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SatelliteRecord[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const id = r.norad_cat_id;
    const l1 = r.tle1;
    const l2 = r.tle2;
    const name = typeof r.tle0 === 'string' ? r.tle0.replace(/^0 /, '').trim() : String(id);
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) continue;
    if (typeof l1 !== 'string' || typeof l2 !== 'string' || !l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
    if (l1.length !== 69 || l2.length !== 69) continue;
    // 宇宙ステーションに結合している部品（ISS のナウカ、中国宇宙ステーションの問天など）は、本体と同じ場所にいるので外す
    if (DOCKED_MODULE.test(name)) continue;
    out.push({ id, name: name.slice(0, 40), l1, l2 });
  }
  return out.sort((a, b) => a.id - b.id);
}
