/**
 * 宇宙の住所（要件 F12）。住所のように、大きな範囲から順に狭めて1か所を指す。
 *
 *   MW-ORI-SOL-3-1-002
 *   銀河-銀河の腕-恒星系-惑星-衛星-番号
 *
 * 決まりと理由は docs/tech/world-model.md の「宇宙の住所」。
 * このファイルはサーバー（worker/）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。
 */
import type { BodyId } from './solar-system';
import { KM_PER_PC } from './units';
import type { Vec3 } from './vec';

/** 天の川銀河 */
export const GALAXY_MILKY_WAY = 'MW';
/**
 * オリオン腕（太陽のある腕）。銀河の腕を決めるモデルはまだ無いので、本物のデータの範囲（太陽から約 3,200 光年）は
 * すべてオリオン腕として扱う（仮。docs/tech/world-model.md）
 */
export const ARM_ORION = 'ORI';
/** 太陽系 */
export const SYSTEM_SOL = 'SOL';

/** 太陽系の天体の、住所での番号。惑星は太陽に近い順、衛星はその惑星での番号。0 は「その近くではない」 */
export const SOL_BODY_NUMBERS: Record<BodyId, { planet: number; moon: number }> = {
  Sun: { planet: 0, moon: 0 },
  Mercury: { planet: 1, moon: 0 },
  Venus: { planet: 2, moon: 0 },
  Earth: { planet: 3, moon: 0 },
  Moon: { planet: 3, moon: 1 },
  Mars: { planet: 4, moon: 0 },
  Jupiter: { planet: 5, moon: 0 },
  Saturn: { planet: 6, moon: 0 },
  Uranus: { planet: 7, moon: 0 },
  Neptune: { planet: 8, moon: 0 },
  // 冥王星は準惑星だが、住所では太陽に近い順の続きの番号にする
  Pluto: { planet: 9, moon: 0 },
};

const SYSTEM_PATTERN = /^(SOL|H[1-9][0-9]{0,6})$/;
export const isSystemCode = (s: string): boolean => SYSTEM_PATTERN.test(s);

/** HYG の星の恒星系の記号（例：シリウスは H32263） */
export const hygSystemCode = (hygId: number): string => `H${hygId}`;

/**
 * 番号の前までの住所（例：MW-ORI-SOL-3-1）。
 * 太陽系の外（system が SOL 以外）では、惑星・衛星はまだ無いので 0-0。
 */
export function addressPrefix(anchor: BodyId, system: string): string {
  if (!isSystemCode(system)) throw new Error(`恒星系の記号が正しくない: ${system}`);
  const { planet, moon } = system === SYSTEM_SOL ? SOL_BODY_NUMBERS[anchor] : { planet: 0, moon: 0 };
  return [GALAXY_MILKY_WAY, ARM_ORION, system, planet, moon].join('-');
}

/** 番号を付けた住所。番号は 3 桁まで 0 で埋める（1000 以上はそのまま） */
export const addressCode = (prefix: string, serial: number): string => `${prefix}-${String(serial).padStart(3, '0')}`;

/**
 * いる場所がどの恒星系か。太陽を含めて、いちばん近い恒星の恒星系にする。
 * stars は STAR_STRIDE 個ずつ並んだ星のデータ（x・y・z が pc、6 番目が HYG の id）。
 */
export function nearestSystem(positionKm: Vec3, stars: Float32Array, stride: number): string {
  const x = positionKm.x / KM_PER_PC;
  const y = positionKm.y / KM_PER_PC;
  const z = positionKm.z / KM_PER_PC;
  let best = SYSTEM_SOL;
  let bestD2 = x * x + y * y + z * z; // 太陽は原点
  for (let o = 0; o + stride <= stars.length; o += stride) {
    const dx = stars[o] - x;
    const dy = stars[o + 1] - y;
    const dz = stars[o + 2] - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = hygSystemCode(stars[o + 5]);
    }
  }
  return best;
}

const SOL_PLANET_NAMES = ['', '水星', '金星', '地球', '火星', '木星', '土星', '天王星', '海王星', '冥王星'];

/** 住所の読み（例：天の川銀河 オリオン腕 太陽系 地球 月 2番） */
export function readAddress(code: string): string {
  const parts = code.split('-');
  if (parts.length !== 6) return code;
  const [galaxy, arm, system, planetS, moonS, serialS] = parts;
  const planet = Number(planetS);
  const moon = Number(moonS);
  const words: string[] = [
    galaxy === GALAXY_MILKY_WAY ? '天の川銀河' : galaxy,
    arm === ARM_ORION ? 'オリオン腕' : arm,
    system === SYSTEM_SOL ? '太陽系' : `恒星 ${system}`,
  ];
  if (planet > 0) words.push(system === SYSTEM_SOL ? (SOL_PLANET_NAMES[planet] ?? `第${planet}惑星`) : `第${planet}惑星`);
  if (moon > 0) words.push(system === SYSTEM_SOL && planet === 3 && moon === 1 ? '月' : `第${moon}衛星`);
  words.push(`${Number(serialS)}番`);
  return words.join(' ');
}
