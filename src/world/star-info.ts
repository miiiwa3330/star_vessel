/**
 * 恒星の名前と見え方（public/data/star-info.json。npm run star-info が HYG v4.4 から作る。CC BY-SA 4.0）。
 * 固有名のある恒星（540 個）と、系外惑星のある HYG の恒星だけ。図鑑（要件 F38）と情報のカードの名前に使う。
 * three.js・DOM・astronomy-engine を読み込まない。決まりは docs/tech/collection.md
 */
export interface StarInfo {
  /** HYG の id（恒星系の記号は H＋id） */
  id: number;
  /** IAU の固有名（英語。例：Sirius）。無ければ null */
  proper: string | null;
  /** バイエル符号・フラムスティード番号（例：9Alp CMa） */
  bayer: string | null;
  /** スペクトル型（例：A0m...） */
  spectral: string | null;
  /** 地球から見た明るさ（等級） */
  apparentMag: number | null;
  /** 星座（IAU の略号。例：CMa） */
  constellation: string | null;
}

type Row = [number, string | null, string | null, string | null, number | null, string | null];

export function decodeStarInfo(json: { stars: Row[] }): Map<string, StarInfo> {
  const out = new Map<string, StarInfo>();
  for (const r of json.stars) {
    out.set(`H${r[0]}`, { id: r[0], proper: r[1], bayer: r[2], spectral: r[3], apparentMag: r[4], constellation: r[5] });
  }
  return out;
}

/**
 * よく知られた恒星の日本語の名前（カタカナ）。IAU の固有名（英語）から引く。ここに無い恒星は英語の名前のまま。
 * 書き方は、国立天文台「理科年表」などで広く使われている読みに合わせた
 */
export const STAR_NAMES_JA: Readonly<Record<string, string>> = {
  Sirius: 'シリウス',
  Canopus: 'カノープス',
  'Rigil Kentaurus': 'リギル・ケンタウルス',
  Toliman: 'トリマン',
  'Proxima Centauri': 'プロキシマ・ケンタウリ',
  Arcturus: 'アークトゥルス',
  Vega: 'ベガ',
  Capella: 'カペラ',
  Rigel: 'リゲル',
  Procyon: 'プロキオン',
  Achernar: 'アケルナル',
  Betelgeuse: 'ベテルギウス',
  Hadar: 'ハダル',
  Altair: 'アルタイル',
  Acrux: 'アクルックス',
  Aldebaran: 'アルデバラン',
  Antares: 'アンタレス',
  Spica: 'スピカ',
  Pollux: 'ポルックス',
  Fomalhaut: 'フォーマルハウト',
  Deneb: 'デネブ',
  Mimosa: 'ミモザ',
  Regulus: 'レグルス',
  Adhara: 'アダーラ',
  Castor: 'カストル',
  Gacrux: 'ガクルックス',
  Shaula: 'シャウラ',
  Bellatrix: 'ベラトリックス',
  Elnath: 'エルナト',
  Miaplacidus: 'ミアプラキドゥス',
  Alnilam: 'アルニラム',
  Alnitak: 'アルニタク',
  Mintaka: 'ミンタカ',
  Saiph: 'サイフ',
  Alioth: 'アリオト',
  Dubhe: 'ドゥーベ',
  Merak: 'メラク',
  Phecda: 'フェクダ',
  Megrez: 'メグレズ',
  Mizar: 'ミザール',
  Alcor: 'アルコル',
  Alkaid: 'アルカイド',
  Mirfak: 'ミルファク',
  Algol: 'アルゴル',
  Wezen: 'ウェズン',
  Sargas: 'サルガス',
  'Kaus Australis': 'カウス・アウストラリス',
  Avior: 'アヴィオール',
  Menkalinan: 'メンカリナン',
  Atria: 'アトリア',
  Alhena: 'アルヘナ',
  Peacock: 'ピーコック',
  Mirzam: 'ミルザム',
  Alphard: 'アルファルド',
  Polaris: 'ポラリス（北極星）',
  Hamal: 'ハマル',
  Algieba: 'アルギエバ',
  Diphda: 'ディフダ',
  Nunki: 'ヌンキ',
  Menkent: 'メンケント',
  Mirach: 'ミラク',
  Alpheratz: 'アルフェラッツ',
  Rasalhague: 'ラスアルハゲ',
  Kochab: 'コカブ',
  Denebola: 'デネボラ',
  Thuban: 'トゥバン',
  Albireo: 'アルビレオ',
  Alcyone: 'アルキオネ',
  Mira: 'ミラ',
  Sadr: 'サドル',
  Vindemiatrix: 'ビンデミアトリックス',
  "Barnard's Star": 'バーナード星',
  'Van Maanen\'s Star': 'ファン・マーネン星',
  Zubenelgenubi: 'ズベン・エル・ゲヌビ',
  Schedar: 'シェダル',
  Caph: 'カフ',
  Enif: 'エニフ',
  Scheat: 'シェアト',
  Markab: 'マルカブ',
  Unukalhai: 'ウヌカルハイ',
  Eltanin: 'エルタニン',
  Alderamin: 'アルデラミン',
};

/** 恒星の名前（日本語の名前があればそれ。無ければ固有名） */
export function starNameJa(info: StarInfo | undefined): string | null {
  if (!info?.proper) return null;
  return STAR_NAMES_JA[info.proper] ?? info.proper;
}
