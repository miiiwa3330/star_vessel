/**
 * 恒星系の記号から、恒星と惑星を引く（要件 F22）。
 *
 * - H＋HYG の id：星のデータ（stars.bin）の星
 * - D＋番号：Gaia DR3 の星（stars-gaia-*.bin）
 * - G＋マス目と番号：自動で作った星（src/world/galaxy.ts）
 * - E＋ハッシュ：系外惑星のデータにだけある恒星（HYG に無い恒星）
 *
 * いる恒星系の天体は、天体の一覧（src/world/solar-system.ts）に入れ替えて登録する（enter）。
 * 遠くの恒星系の天体（そこに置かれたワープホールなど）は findBody で引く。
 */
import { bodyAddress, GAIA_ID_BASE, SYSTEM_SOL } from './address';
import type { RealSystem } from './exoplanet-data';
import { generateCell, parseGeneratedSystem } from './galaxy';
import { systemBodies, type HostStar } from './planets';
import type { CompactObject } from './compact-objects';
import { registerBodies, unregisterBodies, type BodyInfo } from './solar-system';
import { STAR_STRIDE } from './stars';

/** 覚えておく恒星系の数（遠くのワープホールの位置を毎回作り直さないため） */
const CACHE_SIZE = 64;

export class StarSystems {
  private hygIndex: Map<number, number> | null = null;
  private readonly cache = new Map<string, BodyInfo[]>();
  private current: string = SYSTEM_SOL;
  private registered: string[] = [];

  private readonly compactByCode = new Map<string, CompactObject>();

  constructor(
    /** 星のデータ。Gaia の星を読み込むと data が大きくなるので、入れ物ごと持つ */
    private readonly catalog: { data: Float32Array },
    private readonly real: ReadonlyMap<string, RealSystem>,
    compact: readonly CompactObject[] = [],
  ) {
    for (const c of compact) this.compactByCode.set(c.code, c);
  }

  /** 系外惑星のデータにだけある恒星（E…）。星空に描き、いちばん近い恒星を探すのに使う */
  extraStars(): { position: { x: number; y: number; z: number }; absMag: number; bv: number; system: string }[] {
    const out = [];
    // 実在の星の燃えかす（白色矮星・パルサー・ブラックホール）も、星空に描き、いちばん近い恒星を探すのに使う
    for (const c of this.compactByCode.values()) out.push({ position: c.positionPc, absMag: c.absMag, bv: c.bv, system: c.code });
    for (const s of this.real.values()) {
      if (s.positionPc && s.absMag !== undefined && s.bv !== undefined) {
        out.push({ position: s.positionPc, absMag: s.absMag, bv: s.bv, system: s.code });
      }
    }
    return out;
  }

  /** 星のデータが増えたら呼ぶ（星の id の索引を作り直す） */
  catalogChanged(): void {
    this.hygIndex = null;
  }

  hostOf(system: string): HostStar | null {
    if (system.startsWith('H') || (system.startsWith('D') && /^D[0-9]+$/.test(system))) {
      if (!this.hygIndex) {
        this.hygIndex = new Map();
        const d = this.catalog.data;
        for (let o = 0; o + STAR_STRIDE <= d.length; o += STAR_STRIDE) this.hygIndex.set(d[o + 5], o);
      }
      const o = this.hygIndex.get(system.startsWith('D') ? GAIA_ID_BASE + Number(system.slice(1)) : Number(system.slice(1)));
      if (o === undefined) return null;
      const s = this.catalog.data;
      const bv = Number.isFinite(s[o + 4]) ? s[o + 4] : 0.65;
      return { system, positionPc: { x: s[o], y: s[o + 1], z: s[o + 2] }, absMag: s[o + 3], bv };
    }
    if (system.startsWith('G')) {
      const g = parseGeneratedSystem(system);
      // 番号は並びの位置ではない（燃えかすは 1000 から）ので、記号で探す
      const star = g ? generateCell(g.cell).find((s) => s.system === system) : undefined;
      return star ? { system, positionPc: star.position, absMag: star.absMag, bv: star.bv, compact: star.compact } : null;
    }
    const c = this.compactByCode.get(system);
    if (c) {
      return {
        system,
        positionPc: c.positionPc,
        absMag: c.absMag,
        bv: c.bv,
        compact: c.kind,
        compactInfo: { name: c.name, teffK: c.teffK, periodS: c.periodS, massSun: c.massSun },
      };
    }
    const r = this.real.get(system);
    if (r?.positionPc && r.absMag !== undefined && r.bv !== undefined) {
      return { system, positionPc: r.positionPc, absMag: r.absMag, bv: r.bv };
    }
    return null;
  }

  /** 恒星系の天体（恒星と惑星）。作れなければ空 */
  bodiesOf(system: string): BodyInfo[] {
    const hit = this.cache.get(system);
    if (hit) return hit;
    const host = this.hostOf(system);
    const bodies = host ? systemBodies(host, this.real.get(system) ?? null) : [];
    if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(system, bodies);
    return bodies;
  }

  /** 天体の id から、その天体を引く（太陽系の天体は扱わない） */
  findBody(id: string): BodyInfo | null {
    const system = id.endsWith('.0') ? id.slice(0, -2) : bodyAddress(id)?.system;
    if (!system || system === SYSTEM_SOL) return null;
    return this.bodiesOf(system).find((b) => b.id === id) ?? null;
  }

  /** いる恒星系が変わったら、天体の一覧を入れ替える。太陽系なら系外の天体を外すだけ */
  enter(system: string): void {
    if (system === this.current) return;
    this.current = system;
    if (this.registered.length > 0) unregisterBodies(this.registered);
    this.registered = [];
    if (system === SYSTEM_SOL) return;
    const bodies = this.bodiesOf(system);
    registerBodies(bodies);
    this.registered = bodies.map((b) => b.id);
  }

  get currentSystem(): string {
    return this.current;
  }
}
