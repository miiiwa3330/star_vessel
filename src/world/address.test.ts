import { describe, expect, it } from 'vitest';
import { addressCode, addressPrefix, bodyAddress, hygSystemCode, isSystemCode, knownSystemArm, nearestSystem, readAddress, toRoman } from './address';
import { cellOf, galactoToEqjPc, generateCell } from './galaxy';
import { KM_PER_PC } from './units';

describe('addressPrefix', () => {
  it('太陽系の天体は、惑星は太陽に近い順・衛星はその惑星での番号', () => {
    expect(addressPrefix('Earth', 'SOL', 'ORI')).toBe('MW-ORI-SOL-3-0');
    expect(addressPrefix('Moon', 'SOL', 'ORI')).toBe('MW-ORI-SOL-3-1');
    expect(addressPrefix('Mars', 'SOL', 'ORI')).toBe('MW-ORI-SOL-4-0');
    expect(addressPrefix('Sun', 'SOL', 'ORI')).toBe('MW-ORI-SOL-0-0');
  });

  it('太陽系の外では、惑星・衛星は 0-0', () => {
    expect(addressPrefix('Sun', 'H32263', 'ORI')).toBe('MW-ORI-H32263-0-0');
  });

  it('正しくない恒星系の記号は受け付けない', () => {
    expect(() => addressPrefix('Earth', 'X1', 'ORI')).toThrow();
    expect(isSystemCode('H0')).toBe(false);
    expect(isSystemCode('H32263')).toBe(true);
  });
});

describe('addressCode', () => {
  it('番号は 3 桁まで 0 で埋める', () => {
    expect(addressCode('MW-ORI-SOL-3-1', 2)).toBe('MW-ORI-SOL-3-1-002');
    expect(addressCode('MW-ORI-SOL-3-1', 1234)).toBe('MW-ORI-SOL-3-1-1234');
  });
});

describe('nearestSystem', () => {
  // x, y, z（pc）, 等級, 色, id
  const stars = new Float32Array([
    -0.494, 2.477, -0.758, -1.44, 0, 32263, // シリウス（約 2.6 pc）
    10, 0, 0, 5, 0, 7,
  ]);

  it('太陽の近くでは太陽系', () => {
    expect(nearestSystem({ x: 1e9, y: 0, z: 0 }, stars, 6)).toEqual({ system: 'SOL', arm: 'ORI' });
  });

  it('太陽よりシリウスに近ければ、シリウスの恒星系', () => {
    const p = { x: -0.4 * KM_PER_PC, y: 2.3 * KM_PER_PC, z: -0.7 * KM_PER_PC };
    expect(nearestSystem(p, stars, 6).system).toBe('H32263');
  });

  it('自動で作った星がいちばん近ければ、その星の恒星系。腕はサーバーと同じ決め方', () => {
    const star = generateCell(cellOf(galactoToEqjPc({ x: -5.2, y: 0, z: 0 })))[0];
    const KM = 3.0856775814913673e13;
    const p = { x: star.position.x * KM, y: star.position.y * KM, z: star.position.z * KM };
    const r = nearestSystem(p, stars, 6, [star]);
    expect(r.system).toBe(star.system);
    expect(r.arm).toBe(knownSystemArm(star.system));
  });
});

describe('knownSystemArm', () => {
  it('太陽系はオリオン腕、本物の星は決められない', () => {
    expect(knownSystemArm('SOL')).toBe('ORI');
    expect(knownSystemArm('H32263')).toBeNull();
  });
});

describe('readAddress', () => {
  it('住所を日本語で読む', () => {
    expect(readAddress('MW-ORI-SOL-3-1-002')).toBe('天の川銀河 オリオン腕 太陽系 地球 月 2番');
    expect(readAddress('MW-ORI-SOL-0-0-001')).toBe('天の川銀河 オリオン腕 太陽系 1番');
    expect(readAddress('MW-ORI-H32263-0-0-004')).toBe('天の川銀河 オリオン腕 恒星 H32263 4番');
    expect(readAddress('MW-PER-G0000000000A-0-0-001')).toBe('天の川銀河 ペルセウス腕 恒星 G0000000000A 1番');
  });
});

describe('bodyAddress（天体の id から住所の番号）', () => {
  it('太陽系の衛星は正式な番号、小惑星は A＋小惑星番号', () => {
    expect(addressPrefix('S5.1', 'SOL', 'ORI')).toBe('MW-ORI-SOL-5-1');
    expect(addressPrefix('S6.6', 'SOL', 'ORI')).toBe('MW-ORI-SOL-6-6');
    expect(addressPrefix('A1', 'SOL', 'ORI')).toBe('MW-ORI-SOL-A1-0');
  });

  it('系外惑星は恒星系の記号＋恒星に近い順の番号', () => {
    expect(addressPrefix('H70666.2', 'H70666', 'ORI')).toBe('MW-ORI-H70666-2-0');
    expect(addressPrefix('EABCDEF1.3~2', 'EABCDEF1', 'ORI')).toBe('MW-ORI-EABCDEF1-3-0');
  });

  it('基準の天体が別の恒星系のものなら 0-0', () => {
    expect(addressPrefix('Earth', 'H32263', 'ORI')).toBe('MW-ORI-H32263-0-0');
  });

  it('形の正しくない id は受け付けない', () => {
    expect(bodyAddress('S0.1')).toBeNull();
    expect(bodyAddress('A0')).toBeNull();
    expect(bodyAddress('SOL.1')).toBeNull();
    expect(bodyAddress('X1.1')).toBeNull();
    expect(bodyAddress('H70666.0')).toBeNull();
    expect(bodyAddress('H70666.1~1')).toBeNull();
  });

  it('衛星の番号はローマ数字で読む', () => {
    expect(toRoman(6)).toBe('VI');
    expect(toRoman(14)).toBe('XIV');
    expect(readAddress('MW-ORI-SOL-6-6-001')).toBe('天の川銀河 オリオン腕 太陽系 土星 第VI衛星 1番');
    expect(readAddress('MW-ORI-SOL-A1-0-001')).toBe('天の川銀河 オリオン腕 太陽系 小惑星 (1) 1番');
  });
});

describe('系外惑星の衛星', () => {
  it('id は 恒星系.惑星.衛星 で、住所の衛星の番号になる', () => {
    expect(bodyAddress('H70666.2.1')).toEqual({ planet: '2', moon: 1, system: 'H70666' });
    expect(bodyAddress('GHU8I00I007T.3.12~2')).toEqual({ planet: '3', moon: 12, system: 'GHU8I00I007T' });
    expect(bodyAddress('H70666.2.0')).toBeNull();
    expect(addressPrefix('H70666.2.1', 'H70666', 'ORI')).toBe('MW-ORI-H70666-2-1');
    expect(readAddress('MW-ORI-H70666-2-3-001')).toBe('天の川銀河 オリオン腕 恒星 H70666 第2惑星 第3衛星 1番');
  });
});

describe('2026-11-05 に足した天体の住所', () => {
  it('彗星・仮符号の衛星・探査機・Gaia の星の恒星系', () => {
    expect(bodyAddress('C1P')).toEqual({ planet: 'C1P', moon: 0, system: 'SOL' });
    expect(bodyAddress('CC1995O1')).toEqual({ planet: 'CC1995O1', moon: 0, system: 'SOL' });
    expect(bodyAddress('S5p55501')).toEqual({ planet: '5', moon: 0, system: 'SOL' });
    expect(bodyAddress('V31')).toEqual({ planet: '0', moon: 0, system: 'SOL' });
    expect(isSystemCode('D123')).toBe(true);
    expect(hygSystemCode(1_000_123)).toBe('D123');
    expect(hygSystemCode(32263)).toBe('H32263');
    expect(bodyAddress('D123.2')).toEqual({ planet: '2', moon: 0, system: 'D123' });
    expect(addressPrefix('C1P', 'SOL', 'ORI')).toBe('MW-ORI-SOL-C1P-0');
  });
});
