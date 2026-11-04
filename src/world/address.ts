/**
 * 宇宙の住所（要件 F12）。住所のように、大きな範囲から順に狭めて1か所を指す。
 *
 *   MW-ORI-SOL-3-1-002
 *   銀河-銀河の腕-恒星系-惑星-衛星-番号
 *
 * 決まりと理由は docs/tech/world-model.md の「宇宙の住所」。
 * このファイルはサーバー（worker/）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。
 */
import { ARM_CODES, ARM_NAMES_JA, armAt, cellCenterGalacto, eqjPcToGalacto, parseGeneratedSystem, type ArmCode } from './galaxy';
import type { BodyId } from './solar-system';
import { KM_PER_PC } from './units';
import type { Vec3 } from './vec';

/** 天の川銀河 */
export const GALAXY_MILKY_WAY = 'MW';
/** 太陽のある腕（オリオン腕）。銀河のモデル（src/world/galaxy.ts）で太陽の場所を調べた結果と同じ（テストで確かめている） */
export const SUN_ARM: ArmCode = 'ORI';
export const isArmCode = (s: unknown): s is ArmCode => typeof s === 'string' && (ARM_CODES as string[]).includes(s);
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

/** SOL：太陽系、H＋数字：本物の星（HYG の id）、G＋36 進 11 桁：自動で作った星（src/world/galaxy.ts） */
const SYSTEM_PATTERN = /^(SOL|H[1-9][0-9]{0,6}|G[0-9A-Z]{11})$/;
export const isSystemCode = (s: string): boolean => SYSTEM_PATTERN.test(s);

/** HYG の星の恒星系の記号（例：シリウスは H32263） */
export const hygSystemCode = (hygId: number): string => `H${hygId}`;

/**
 * 番号の前までの住所（例：MW-ORI-SOL-3-1）。arm は恒星系のある腕（systemArm で決める）。
 * 太陽系の外（system が SOL 以外）では、惑星・衛星はまだ無いので 0-0。
 */
export function addressPrefix(anchor: BodyId, system: string, arm: ArmCode): string {
  if (!isSystemCode(system)) throw new Error(`恒星系の記号が正しくない: ${system}`);
  if (!isArmCode(arm)) throw new Error(`腕の記号が正しくない: ${arm}`);
  const { planet, moon } = system === SYSTEM_SOL ? SOL_BODY_NUMBERS[anchor] : { planet: 0, moon: 0 };
  return [GALAXY_MILKY_WAY, arm, system, planet, moon].join('-');
}

/**
 * 恒星系のある腕を、サーバーが自分で決められるか。太陽系は SUN_ARM、自動で作った星はマス目の中心の腕。
 * 本物の星（H…）は位置のデータをサーバーが持たないので、決められない（null。ブラウザの値を信じる）
 */
export function knownSystemArm(system: string): ArmCode | null {
  if (system === SYSTEM_SOL) return SUN_ARM;
  const g = parseGeneratedSystem(system);
  return g ? armAt(cellCenterGalacto(g.cell)) : null;
}

/** 番号を付けた住所。番号は 3 桁まで 0 で埋める（1000 以上はそのまま） */
export const addressCode = (prefix: string, serial: number): string => `${prefix}-${String(serial).padStart(3, '0')}`;

export interface SystemAndArm {
  system: string;
  arm: ArmCode;
}

/**
 * いる場所がどの恒星系か。太陽・本物の星（HYG）・自動で作った星のうち、いちばん近い恒星の恒星系にする。
 * 腕は、その恒星のある腕（自動で作った星は、マス目の中心の腕。サーバーと同じ決め方）。
 * stars は STAR_STRIDE 個ずつ並んだ本物の星のデータ（x・y・z が pc、6 番目が HYG の id）。
 */
export function nearestSystem(
  positionKm: Vec3,
  stars: Float32Array,
  stride: number,
  generated: readonly { position: Vec3; system: string }[] = [],
): SystemAndArm {
  const x = positionKm.x / KM_PER_PC;
  const y = positionKm.y / KM_PER_PC;
  const z = positionKm.z / KM_PER_PC;
  let bestD2 = x * x + y * y + z * z; // 太陽は原点
  let best: SystemAndArm = { system: SYSTEM_SOL, arm: SUN_ARM };
  let bestHyg = -1;
  for (let o = 0; o + stride <= stars.length; o += stride) {
    const d2 = (stars[o] - x) ** 2 + (stars[o + 1] - y) ** 2 + (stars[o + 2] - z) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestHyg = o;
    }
  }
  let bestGen = -1;
  generated.forEach((g, i) => {
    const d2 = (g.position.x - x) ** 2 + (g.position.y - y) ** 2 + (g.position.z - z) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestGen = i;
    }
  });
  if (bestGen >= 0) {
    const system = generated[bestGen].system;
    return { system, arm: knownSystemArm(system) ?? SUN_ARM };
  }
  if (bestHyg >= 0) {
    const pos = { x: stars[bestHyg], y: stars[bestHyg + 1], z: stars[bestHyg + 2] };
    best = { system: hygSystemCode(stars[bestHyg + 5]), arm: armAt(eqjPcToGalacto(pos)) };
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
    isArmCode(arm) ? ARM_NAMES_JA[arm] : arm,
    system === SYSTEM_SOL ? '太陽系' : `恒星 ${system}`,
  ];
  if (planet > 0) words.push(system === SYSTEM_SOL ? (SOL_PLANET_NAMES[planet] ?? `第${planet}惑星`) : `第${planet}惑星`);
  if (moon > 0) words.push(system === SYSTEM_SOL && planet === 3 && moon === 1 ? '月' : `第${moon}衛星`);
  words.push(`${Number(serialS)}番`);
  return words.join(' ');
}
