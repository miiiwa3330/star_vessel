/**
 * 恒星系の記号から、恒星と惑星を引く（要件 F22）。
 *
 * - H＋HYG の id：星のデータ（stars.bin）の星
 * - G＋マス目と番号：自動で作った星（src/world/galaxy.ts）
 * - E＋ハッシュ：系外惑星のデータにだけある恒星（HYG に無い恒星）
 *
 * いる恒星系の天体は、天体の一覧（src/world/solar-system.ts）に入れ替えて登録する（enter）。
 * 遠くの恒星系の天体（そこに置かれたワープホールなど）は findBody で引く。
 */
import { bodyAddress, SYSTEM_SOL } from './address';
import type { RealSystem } from './exoplanet-data';
import { generateCell, parseGeneratedSystem } from './galaxy';
import { systemBodies, type HostStar } from './planets';
import { registerBodies, unregisterBodies, type BodyInfo } from './solar-system';
import { STAR_STRIDE } from './stars';

/** 覚えておく恒星系の数（遠くのワープホールの位置を毎回作り直さないため） */
const CACHE_SIZE = 64;

export class StarSystems {
  private hygIndex: Map<number, number> | null = null;
  private readonly cache = new Map<string, BodyInfo[]>();
  private current: string = SYSTEM_SOL;
  private registered: string[] = [];

  constructor(
    private readonly stars: Float32Array,
    private readonly real: ReadonlyMap<string, RealSystem>,
  ) {}

  /** 系外惑星のデータにだけある恒星（E…）。星空に描き、いちばん近い恒星を探すのに使う */
  extraStars(): { position: { x: number; y: number; z: number }; absMag: number; bv: number; system: string }[] {
    const out = [];
    for (const s of this.real.values()) {
      if (s.positionPc && s.absMag !== undefined && s.bv !== undefined) {
        out.push({ position: s.positionPc, absMag: s.absMag, bv: s.bv, system: s.code });
      }
    }
    return out;
  }

  hostOf(system: string): HostStar | null {
    if (system.startsWith('H')) {
      if (!this.hygIndex) {
        this.hygIndex = new Map();
        for (let o = 0; o + STAR_STRIDE <= this.stars.length; o += STAR_STRIDE) this.hygIndex.set(this.stars[o + 5], o);
      }
      const o = this.hygIndex.get(Number(system.slice(1)));
      if (o === undefined) return null;
      const s = this.stars;
      const bv = Number.isFinite(s[o + 4]) ? s[o + 4] : 0.65;
      return { system, positionPc: { x: s[o], y: s[o + 1], z: s[o + 2] }, absMag: s[o + 3], bv };
    }
    if (system.startsWith('G')) {
      const g = parseGeneratedSystem(system);
      const star = g ? generateCell(g.cell)[g.index] : undefined;
      return star ? { system, positionPc: star.position, absMag: star.absMag, bv: star.bv } : null;
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
