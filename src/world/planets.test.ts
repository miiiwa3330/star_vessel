import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bodyAddress } from './address';
import { decodeExoplanets } from './exoplanet-data';
import { keplerPositionKm, type KeplerElements } from './kepler';
import { massFromAbsMag, systemBodies, teffFromBv, type HostStar } from './planets';
import { generatedSystemCode } from './galaxy';
import { KM_PER_PC } from './units';
import { length, normalize, scale, type Vec3 } from './vec';

const real = decodeExoplanets(JSON.parse(readFileSync('public/data/exoplanets.json', 'utf8')));
const host = (system: string, absMag = 4.83, bv = 0.65, positionPc: Vec3 = { x: 10, y: 0, z: 0 }): HostStar => ({
  system,
  positionPc,
  absMag,
  bv,
});

describe('恒星のおおよその性質', () => {
  it('太陽の色と明るさなら、温度は約 5,800 K・質量は 1', () => {
    expect(teffFromBv(0.65)).toBeGreaterThan(5600);
    expect(teffFromBv(0.65)).toBeLessThan(6000);
    expect(massFromAbsMag(4.83)).toBeCloseTo(1, 5);
    expect(massFromAbsMag(12)).toBeLessThan(0.3);
  });
});

describe('自動で作る惑星', () => {
  it('同じ恒星なら、いつも同じ惑星', () => {
    const a = systemBodies(host('H12345'), null);
    const b = systemBodies(host('H12345'), null);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('惑星の番号は恒星に近い順で、id から住所の番号が決まる', () => {
    let checked = 0;
    for (let i = 1; i < 200 && checked < 20; i++) {
      const bodies = systemBodies(host(`H${i}`), null).filter((b) => b.kind === 'exoplanet');
      if (bodies.length < 2) continue;
      checked++;
      const axes = bodies.map((b) => (b.motion.type === 'kepler' ? b.motion.elements.aKm : 0));
      expect([...axes].sort((x, y) => x - y)).toEqual(axes);
      bodies.forEach((b, k) => expect(bodyAddress(b.id)).toEqual({ planet: String(k + 1), moon: 0, system: `H${i}` }));
    }
    expect(checked).toBe(20);
  });

  it('太陽に似た恒星の約 4 分の 3 が惑星を持つ（観測の割合に合わせた値 0.75）', () => {
    let withPlanets = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const code = generatedSystemCode({ ix: i, iy: 3, iz: -7 }, i % 1000);
      if (systemBodies(host(code), null).length > 1) withPlanets++;
    }
    expect(withPlanets / n).toBeGreaterThan(0.7);
    expect(withPlanets / n).toBeLessThan(0.8);
  });

  it('惑星は恒星の中に入らない', () => {
    for (let i = 0; i < 300; i++) {
      const bodies = systemBodies(host(`H${i + 1}`, -1, 1.5), null); // 赤色巨星（半径が大きい）
      const star = bodies[0];
      for (const b of bodies.filter((x) => x.kind === 'exoplanet')) {
        if (b.motion.type === 'kepler') expect(b.motion.elements.aKm).toBeGreaterThan(star.radiusKm * 2);
      }
    }
  });
});

describe('実在の惑星', () => {
  it('TRAPPIST-1 には 7 個の惑星が、恒星に近い順に並ぶ', () => {
    const sys = [...real.values()].find((s) => s.name === 'TRAPPIST-1')!;
    const bodies = systemBodies(host(sys.code, sys.absMag!, sys.bv!, sys.positionPc!), sys);
    expect(bodies.length).toBe(8);
    expect(bodies[1].nameJa).toBe('TRAPPIST-1 b');
    expect(bodies[7].nameJa).toBe('TRAPPIST-1 h');
  });

  it('トランジットの時刻には、惑星は恒星と太陽（地球）の間にいる', () => {
    const sys = [...real.values()].find((s) => s.name === 'TRAPPIST-1')!;
    const bodies = systemBodies(host(sys.code, sys.absMag!, sys.bv!, sys.positionPc!), sys);
    const planet = sys.planets[0];
    const el = (bodies[1].motion as { elements: KeplerElements }).elements;
    const atTransit = new Date((planet.transitJd! - 2_440_587.5) * 86_400_000);
    const rel = keplerPositionKm(el, atTransit);
    const towardSun = normalize(scale(sys.positionPc!, -KM_PER_PC));
    const along = (rel.x * towardSun.x + rel.y * towardSun.y + rel.z * towardSun.z) / length(rel);
    expect(along).toBeGreaterThan(0.99);
  });
});

describe('系外惑星の衛星と環（要件 F26）', () => {
  const baseline = JSON.parse(readFileSync('src/world/__fixtures__/generated-planets-v1.json', 'utf8')) as Record<
    string,
    { id: string; radiusKm: number; el: unknown }[]
  >;
  const hostFor = (code: string, i: number): HostStar => ({
    system: code,
    positionPc: { x: 100 + i, y: -50, z: 20 },
    absMag: 2 + (i % 12),
    bv: 0.2 + (i % 9) * 0.15,
  });

  it('衛星と環を足しても、惑星（id・大きさ・軌道）は世代 1 のまま変わらない', () => {
    Object.keys(baseline).forEach((code, i) => {
      const planets = systemBodies(hostFor(code, i), null)
        .filter((b) => b.kind === 'exoplanet')
        .map((b) => ({ id: b.id, radiusKm: b.radiusKm, el: (b.motion as { elements: unknown }).elements }));
      expect(JSON.parse(JSON.stringify(planets))).toEqual(baseline[code]);
    });
  });

  it('衛星は惑星に近い順の番号で、惑星のヒル球の 0.4 倍の内側を回る', () => {
    let moonCount = 0;
    for (let i = 0; i < 300; i++) {
      const bodies = systemBodies(host(`H${5000 + i}`), null);
      for (const planet of bodies.filter((b) => b.kind === 'exoplanet')) {
        const moons = bodies.filter((b) => b.parent === planet.id);
        const axes = moons.map((m) => (m.motion as { elements: KeplerElements }).elements.aKm);
        expect([...axes].sort((a, b) => a - b)).toEqual(axes);
        moons.forEach((m, k) => {
          expect(bodyAddress(m.id)).toMatchObject({ moon: k + 1, planet: bodyAddress(planet.id)!.planet });
          expect(axes[k]).toBeGreaterThan(planet.radiusKm * 2);
        });
        if (planet.rings && axes.length > 0) {
          expect(Math.max(...planet.rings.map((r) => r.outerKm))).toBeLessThan(axes[0]);
        }
        moonCount += moons.length;
      }
    }
    expect(moonCount).toBeGreaterThan(50);
  });

  it('木星型の惑星の大半は衛星を持つ', () => {
    let giants = 0;
    let withMoons = 0;
    for (let i = 0; i < 3000; i++) {
      const bodies = systemBodies(host(`H${20000 + i}`), null);
      for (const p of bodies.filter((b) => b.kind === 'exoplanet' && b.radiusKm > 6 * 6378.1)) {
        if ((p.motion as { elements: KeplerElements }).elements.periodDays < 10) continue;
        giants++;
        if (bodies.some((b) => b.parent === p.id)) withMoons++;
      }
    }
    expect(giants).toBeGreaterThan(30);
    expect(withMoons / giants).toBeGreaterThan(0.75);
  });

  it('実在の惑星には衛星と環を付けない', () => {
    const sys = [...real.values()].find((s) => s.name === 'TRAPPIST-1')!;
    const bodies = systemBodies(host(sys.code, sys.absMag!, sys.bv!, sys.positionPc!), sys);
    expect(bodies.some((b) => b.kind === 'moon' || b.rings)).toBe(false);
  });
});
