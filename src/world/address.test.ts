import { describe, expect, it } from 'vitest';
import { addressCode, addressPrefix, isSystemCode, knownSystemArm, nearestSystem, readAddress } from './address';
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
