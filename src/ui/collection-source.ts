/**
 * コレクション（図鑑。要件 F38）のもと：集められる天体のカタログ（番号付き）と、詳細の説明・絵（2026-11-12）。
 * 入れる天体の決まり・説明の出典は docs/tech/collection.md。並べ方と番号は src/world/catalog.ts。
 * main.ts が作って setCollectionSource で渡す。カタログは、図鑑を初めて開いたときに 1 回だけ作る（2 万 5 千個ほど）
 */
import { buildCatalog, solOrder, type CatalogEntry, type CatalogSeed } from '../world/catalog';
import { bodyKind, clusterKey, describeBody, galaxyKey, INFO_KIND_NAMES_JA, nebulaKey, type InfoKind } from '../world/info';
import { allBodies, findBody, heliocentricPositionKm, type BodyInfo } from '../world/solar-system';
import { bodyAddress } from '../world/address';
import type { StarSystems } from '../world/star-systems';
import type { RealSystem } from '../world/exoplanet-data';
import { starNameJa, type StarInfo } from '../world/star-info';
import type { CompactObject } from '../world/compact-objects';
import { clusterLabel, type Cluster } from '../world/clusters';
import { NEBULA_TYPE_NAMES_JA, nebulaLabel, type Nebula } from '../world/nebulae';
import { galaxyLabel, type Galaxy } from '../world/galaxies';
import type { Comet } from '../world/comets';
import { teffFromBv, starColor } from '../world/planets';
import { PLANET_FACTS, SUN_FACTS } from '../world/planet-facts';
import { KM_PER_AU, KM_PER_LY, KM_PER_PC } from '../world/units';
import { length, sub, type Vec3 } from '../world/vec';
import type { Visit } from '../world/visits';
import { bodyLook, kindLook, type CollectionLook } from './collection-look';

/** カタログの 1 つの元のデータ */
export type CollectionData =
  | { t: 'body'; id: string }
  | { t: 'comet'; comet: Comet }
  | { t: 'star'; system: string; info?: StarInfo; real?: RealSystem; positionPc: Vec3; absMag: number; bv: number }
  | { t: 'exoplanet'; system: string; real: RealSystem; index: number; positionPc: Vec3 }
  | { t: 'compact'; obj: CompactObject }
  | { t: 'cluster'; c: Cluster }
  | { t: 'nebula'; n: Nebula }
  | { t: 'galaxy'; g: Galaxy }
  /** カタログに無いが、訪れた場所（自動で作った星など）。番号は付けない */
  | { t: 'extra'; visit: Visit };

export type CollectionEntry = CatalogEntry<CollectionData>;

/** 詳細の説明（上から順に出す） */
export interface Article {
  /** 解説の文（段落ごと） */
  lead: string[];
  /** 数の表（見出しと、項目・値の組） */
  sections: { title: string; rows: [string, string][] }[];
  /** くらべてみると（計算から作る文） */
  notes: string[];
}

/** AI が書いた解説（src/ui/encyclopedia-text.ts。図鑑を開いたときに読み込む） */
export interface EncyclopediaTexts {
  articles: Readonly<Record<string, readonly string[]>>;
  kinds: Readonly<Partial<Record<InfoKind | 'pulsar', readonly string[]>>>;
}

export interface CollectionDeps {
  systems: StarSystems;
  realSystems: ReadonlyMap<string, RealSystem>;
  starInfo: ReadonlyMap<string, StarInfo>;
  compact: readonly CompactObject[];
  clusters: readonly Cluster[];
  nebulae: readonly Nebula[];
  galaxies: readonly Galaxy[];
  comets: readonly Comet[];
  /** 星座の略号 → 日本語の名前 */
  constellationsJa: ReadonlyMap<string, string>;
  largeAsteroidNumbers: ReadonlySet<number>;
  now: () => Date;
}

/** 彗星のうち、入れるもの：番号の付いた周期彗星（分裂した破片は除く）と、人の名前の付いた彗星（観測計画の名前の彗星は除く） */
const SURVEY = /\((?:NEOWISE|ATLAS|PANSTARRS|Pan-STARRS|LINEAR|LONEOS|Catalina|Spacewatch|SOHO|STEREO|Lemmon|Siding Spring|NEAT|SWAN|Great comet|Messier|ZTF|WISE|TESS|Gaia|Bernardinelli-Bernstein)\b/i;
export function isCollectedComet(c: Comet): boolean {
  if (/^\d+P\//.test(c.name)) return !/-[A-Z]{1,2}$/.test(c.name);
  return /\([A-Za-z][^)]*\)\s*$/.test(c.name) && !SURVEY.test(c.name) && !/-[A-Z]\s*\(/.test(c.name);
}

const KM_PER_EARTH_R = 6371;

export class CollectionSource {
  private cat: CollectionEntry[] | null = null;
  private readonly byKey = new Map<string, CollectionEntry>();
  constructor(private readonly deps: CollectionDeps) {}

  /** 番号付きのカタログ（初めて呼んだときに作る） */
  catalog(): CollectionEntry[] {
    if (!this.cat) {
      this.cat = buildCatalog(this.seeds());
      for (const e of this.cat) this.byKey.set(e.key, e);
    }
    return this.cat;
  }

  has(key: string): boolean {
    this.catalog();
    return this.byKey.has(key);
  }

  entry(key: string): CollectionEntry | undefined {
    this.catalog();
    return this.byKey.get(key);
  }

  /** カタログに無い、訪れた場所（自動で作った星・仮符号の衛星など）。番号は 0（付けない） */
  extras(visits: readonly Visit[]): CollectionEntry[] {
    this.catalog();
    return visits
      .filter((v) => !this.byKey.has(v.key))
      .map((v) => ({ no: 0, key: v.key, kind: v.kind, name: v.name, nameEn: null, parentKey: null, data: { t: 'extra', visit: v } }));
  }

  // ---- 入れる天体 ----

  private seeds(): CatalogSeed<CollectionData>[] {
    const d = this.deps;
    const out: CatalogSeed<CollectionData>[] = [];
    // 太陽系：太陽・惑星・冥王星・番号のある衛星・大きな小惑星と準惑星・探査機
    for (const b of allBodies()) {
      const order = this.solOrderOf(b);
      if (order === null) continue;
      out.push({ key: b.id, kind: bodyKind(b), name: b.nameJa || b.id, nameEn: enName(b.name ?? b.id, b.nameJa), order, data: { t: 'body', id: b.id } });
    }
    // 彗星
    const comets = d.comets.filter(isCollectedComet);
    comets.forEach((c) => {
      const periodic = /^(\d+)P\//.exec(c.name);
      const rank = periodic ? Number(periodic[1]) : 1000 + c.tpDays / 1e5;
      out.push({ key: c.code, kind: 'comet', name: cometJa(c.name), nameEn: c.name, order: solOrder.comet(rank), data: { t: 'comet', comet: c } });
    });
    // 系外惑星のある恒星（すぐ後ろに、その惑星）
    for (const real of d.realSystems.values()) {
      const host = d.systems.hostOf(real.code);
      if (!host) continue;
      const info = d.starInfo.get(real.code);
      const ja = starNameJa(info);
      const key = `${real.code}.0`;
      out.push({
        key,
        kind: 'star',
        name: ja ?? real.name,
        nameEn: enName(info?.proper ?? real.name, ja ?? real.name),
        distancePc: length(host.positionPc),
        data: { t: 'star', system: real.code, info, real, positionPc: host.positionPc, absMag: host.absMag, bv: host.bv },
        children: real.planets.map((p, i) => ({
          key: `${real.code}.${i + 1}`,
          kind: 'exoplanet' as const,
          name: p.name,
          nameEn: null,
          data: { t: 'exoplanet' as const, system: real.code, real, index: i, positionPc: host.positionPc },
        })),
      });
    }
    // 固有名のある恒星（HYG）
    for (const [system, info] of d.starInfo) {
      if (!info.proper || d.realSystems.has(system)) continue;
      const host = d.systems.hostOf(system);
      if (!host) continue;
      const ja = starNameJa(info) ?? info.proper;
      out.push({
        key: `${system}.0`,
        kind: 'star',
        name: ja,
        nameEn: enName(info.proper, ja),
        distancePc: length(host.positionPc),
        data: { t: 'star', system, info, positionPc: host.positionPc, absMag: host.absMag, bv: host.bv },
      });
    }
    // パルサーとブラックホール（白色矮星は、名前がカタログの番号だけなので入れない）
    for (const c of d.compact) {
      if (c.kind === 'white-dwarf') continue;
      out.push({ key: `${c.code}.0`, kind: c.kind, name: c.name, nameEn: null, distancePc: length(c.positionPc), data: { t: 'compact', obj: c } });
    }
    for (const c of d.clusters)
      out.push({ key: clusterKey(c), kind: 'cluster', name: clusterLabel(c), nameEn: enName(c.name, clusterLabel(c)), distancePc: length(c.positionPc), data: { t: 'cluster', c } });
    for (const n of d.nebulae) {
      const en = n.name.replace(/^NAME /, '');
      out.push({ key: nebulaKey(n), kind: 'nebula', name: nebulaLabel(n), nameEn: enName(en, nebulaLabel(n)), distancePc: length(n.positionPc), data: { t: 'nebula', n } });
    }
    for (const g of d.galaxies)
      out.push({ key: galaxyKey(g), kind: 'galaxy', name: galaxyLabel(g), nameEn: enName(g.name, galaxyLabel(g)), distancePc: length(g.positionPc), data: { t: 'galaxy', g } });
    return out;
  }

  /** 太陽系の天体の並び順。入れないものは null */
  private solOrderOf(b: BodyInfo): number | null {
    if (b.id === 'Sun') return solOrder.sun;
    const addr = bodyAddress(b.id);
    if (!addr || addr.system !== 'SOL') return null;
    if (/^V\d+$/.test(b.id)) return solOrder.spacecraft(Number(b.id.slice(1)) / 1e6);
    const asteroid = /^A(\d+)$/.exec(b.id);
    if (asteroid) {
      if (!this.deps.largeAsteroidNumbers.has(Number(asteroid[1]))) return null;
      const aKm = b.motion.type === 'kepler' ? b.motion.elements.aKm : 0;
      return solOrder.smallBody(aKm / KM_PER_AU);
    }
    const planet = Number(addr.planet);
    if (!Number.isInteger(planet) || planet < 1 || planet > 9) return null;
    // 衛星は番号のあるものだけ（S5.1 など。仮符号の衛星 S5p… は入れない）
    if (addr.moon === 0 && b.kind === 'moon') return null;
    if (b.kind === 'satellite' || b.kind === 'comet') return null;
    return solOrder.planet(planet, addr.moon);
  }

  // ---- 絵 ----

  look(e: CollectionEntry): CollectionLook {
    const d = e.data;
    switch (d.t) {
      case 'body': {
        const b = findBody(d.id);
        return b ? bodyLook(b, e.kind) : kindLook(e.kind, e.key);
      }
      case 'exoplanet': {
        const b = this.deps.systems.findBody(e.key);
        return b ? bodyLook(b, e.kind) : kindLook(e.kind, e.key);
      }
      case 'star': {
        const teff = d.real?.star.teffK ?? teffFromBv(d.bv);
        const c = starColor(teff);
        return kindLook('star', e.key, { color: [c[0] * 255, c[1] * 255, c[2] * 255] });
      }
      case 'compact':
        return kindLook(e.kind, e.key);
      case 'cluster':
        return kindLook('cluster', e.key, { globular: d.c.kind === 'globular' });
      case 'nebula':
        return kindLook('nebula', e.key, { nebula: d.n.type });
      case 'galaxy':
        return kindLook('galaxy', e.key, { tType: d.g.tType });
      case 'comet':
        return kindLook('comet', e.key);
      case 'extra': {
        const b = findBody(e.key) ?? this.deps.systems.findBody(e.key);
        return b ? bodyLook(b, e.kind) : kindLook(e.kind, e.key);
      }
    }
  }

  // ---- 位置 ----

  /** いまの位置（太陽中心 km）。分からなければ null */
  positionKm(e: CollectionEntry, date: Date): Vec3 | null {
    const d = e.data;
    const pc = (p: Vec3) => ({ x: p.x * KM_PER_PC, y: p.y * KM_PER_PC, z: p.z * KM_PER_PC });
    switch (d.t) {
      case 'star':
      case 'exoplanet':
        return pc(d.positionPc);
      case 'compact':
        return pc(d.obj.positionPc);
      case 'cluster':
        return pc(d.c.positionPc);
      case 'nebula':
        return pc(d.n.positionPc);
      case 'galaxy':
        return pc(d.g.positionPc);
      default:
        try {
          return heliocentricPositionKm(e.key, date);
        } catch {
          return null;
        }
    }
  }

  // ---- 説明 ----

  /** まだ訪れていない天体の、わかっていること（種類と、だいたいの場所） */
  hint(e: CollectionEntry): Article {
    const date = this.deps.now();
    const rows: [string, string][] = [['種類', kindName(e)]];
    const where = this.roughPlace(e, date);
    if (where) rows.push(['場所', where]);
    return {
      lead: [],
      sections: [{ title: 'わかっていること', rows }],
      notes: ['まだ訪れていません。近づくと、名前とくわしい説明が読めるようになります。'],
    };
  }

  private roughPlace(e: CollectionEntry, date: Date): string | null {
    const d = e.data;
    if (d.t === 'body' || d.t === 'comet') {
      const b = findBody(e.key);
      if (e.kind === 'moon' && b?.parent) return `太陽系・${findBody(b.parent)?.nameJa ?? b.parent}のまわり`;
      if (e.kind === 'spacecraft') return '太陽系のどこか（太陽系を飛んでいる）';
      const p = this.positionKm(e, date);
      return p ? `太陽系・太陽から 約 ${round2(length(p) / KM_PER_AU)} 天文単位` : '太陽系';
    }
    if (d.t === 'exoplanet') return `${this.entry(`${d.system}.0`)?.name ?? 'ある恒星'}のまわり（太陽から 約 ${round2((length(d.positionPc) * KM_PER_PC) / KM_PER_LY)} 光年）`;
    const p = this.positionKm(e, date);
    if (!p) return null;
    const ly = round2(length(p) / KM_PER_LY);
    const con = d.t === 'star' && d.info?.constellation ? this.deps.constellationsJa.get(d.info.constellation) : null;
    const dir = con ? `${con}の方向` : skyDirection(sub(p, heliocentricPositionKm('Earth', date)));
    return `太陽から 約 ${ly} 光年・${dir}`;
  }

  /** 訪れた天体の、くわしい説明 */
  article(e: CollectionEntry, texts: EncyclopediaTexts | null): Article {
    const date = this.deps.now();
    const lead = [...(texts?.articles[this.textKey(e)] ?? [])];
    const kindText = texts?.kinds[e.kind === 'neutron-star' ? 'pulsar' : e.kind];
    const sections: Article['sections'] = [];
    const notes: string[] = [];
    const d = e.data;
    if (d.t === 'body') this.bodySections(d.id, e, sections, notes);
    else if (d.t === 'comet') this.cometSections(d.comet, sections, notes);
    else if (d.t === 'star') this.starSections(d, sections, notes);
    else if (d.t === 'exoplanet') this.exoplanetSections(d, sections, notes);
    else if (d.t === 'compact') this.compactSections(d.obj, sections);
    else if (d.t === 'cluster') this.clusterSections(d.c, sections);
    else if (d.t === 'nebula') this.nebulaSections(d.n, sections);
    else if (d.t === 'galaxy') this.galaxySections(d.g, sections);
    else if (d.t === 'extra') {
      const b = findBody(e.key) ?? this.deps.systems.findBody(e.key);
      if (b) sections.push({ title: 'データ', rows: describeBody(b, null).map((s, i) => [i === 0 ? '種類' : '・', s] as [string, string]) });
      notes.push('この天体は、図鑑の番号の付いた天体ではありません（自動で作った天体や、番号の無い天体）。訪れた記録として残しています。');
    }
    // いまの位置（どの天体も）
    const p = this.positionKm(e, date);
    if (p) {
      const earth = heliocentricPositionKm('Earth', date);
      const fromEarth = sub(p, earth);
      const rows: [string, string][] = [];
      const sun = length(p);
      if (e.key !== 'Sun') rows.push(['太陽から', distanceJa(sun)]);
      if (e.key !== 'Earth') rows.push(['地球から', distanceJa(length(fromEarth))]);
      if (e.key !== 'Earth') rows.push(['地球から光で', lightTimeJa(length(fromEarth))]);
      if (e.key !== 'Earth' && e.key !== 'Sun' && length(fromEarth) > 0) rows.push(['地球から見た方向', skyDirection(fromEarth)]);
      if (rows.length) sections.push({ title: 'いまの位置', rows });
      const lightYears = length(fromEarth) / KM_PER_LY;
      if (lightYears > 1) notes.push(`いま地球に届いているこの天体の光は、約 ${round2(lightYears)} 年前に出た光です。私たちは、いつも少し昔の姿を見ています。`);
    }
    if (kindText) lead.push(...kindText);
    return { lead, sections, notes };
  }

  /** 解説の文の記号 */
  private textKey(e: CollectionEntry): string {
    const d = e.data;
    if (d.t === 'body') return d.id;
    if (d.t === 'comet') return `comet:${d.comet.name}`;
    if (d.t === 'star') return `star:${d.info?.proper ?? d.real?.name ?? d.system}`;
    if (d.t === 'exoplanet') return `planet:${d.real.planets[d.index].name}`;
    if (d.t === 'compact') return `compact:${d.obj.code}`;
    if (d.t === 'cluster') return `deep:${d.c.name}`;
    if (d.t === 'nebula') return `deep:${d.n.name}`;
    if (d.t === 'galaxy') return `deep:${d.g.name}`;
    return '';
  }

  private bodySections(id: string, e: CollectionEntry, sections: Article['sections'], notes: string[]): void {
    const b = findBody(id);
    if (!b) return;
    const parent = b.parent ? findBody(b.parent) : null;
    const facts = id === 'Sun' ? null : PLANET_FACTS[id];
    const basic: [string, string][] = [['種類', kindName(e)]];
    if (parent && id !== 'Sun') basic.push(['まわりを回る相手', parent.nameJa]);
    if (b.kind === 'spacecraft' || b.kind === 'satellite') basic.push(['大きさ', `約 ${num(b.radiusKm * 2 * 1000)} m`]);
    else {
      basic.push(['半径', `${num(b.radiusKm)} km`]);
      if (id !== 'Earth') basic.push(['地球とくらべた半径', `${ratio(b.radiusKm / KM_PER_EARTH_R)} 倍`]);
    }
    if (id === 'Sun') {
      basic.push(['質量', `${sci(SUN_FACTS.mass1e24Kg * 1e24)} kg（地球の約 ${num(Math.round(SUN_FACTS.mass1e24Kg / 5.97))} 倍）`]);
      basic.push(['平均の密度', `${num(SUN_FACTS.densityKgM3)} kg/m³`]);
      basic.push(['表面の重力', `${SUN_FACTS.gravityMS2} m/s²（地球の約 ${ratio(SUN_FACTS.gravityMS2 / 9.8)} 倍）`]);
      basic.push(['スペクトル型', SUN_FACTS.spectralType]);
      basic.push(['表面の温度', '約 5,772 K']);
      basic.push(['中心の温度', `約 ${num(SUN_FACTS.centralTempK / 1e6)} 百万 K`]);
      basic.push(['光の強さ（光度）', `${sci(SUN_FACTS.luminosity1e24W * 1e24)} W`]);
      basic.push(['地球から見た明るさ', `${SUN_FACTS.apparentMag} 等`]);
      basic.push(['絶対等級', `${SUN_FACTS.absoluteMag} 等`]);
      basic.push(['自転の周期', `約 ${round2(SUN_FACTS.rotationHours / 24)} 日（緯度 16 度。緯度によって違う）`]);
      basic.push(['近くの恒星に対する速さ', `${SUN_FACTS.speedKmS} km/s`]);
    }
    if (facts) {
      basic.push(['質量', `${sci(facts.mass1e24Kg * 1e24)} kg（地球の ${ratio(facts.mass1e24Kg / 5.97)} 倍）`]);
      basic.push(['平均の密度', `${num(facts.densityKgM3)} kg/m³（水の ${round2(facts.densityKgM3 / 1000)} 倍）`]);
      basic.push(['表面の重力', `${facts.gravityMS2} m/s²（地球の ${ratio(facts.gravityMS2 / 9.8)} 倍）`]);
      basic.push(['脱出速度', `${facts.escapeKmS} km/s`]);
      if (facts.meanTempC !== undefined) basic.push(['平均の温度', `${facts.meanTempC} ℃`]);
      if (facts.surfacePressureBar !== undefined)
        basic.push(['表面の気圧', facts.surfacePressureBar === null ? '表面が無い（ガスの惑星）' : `${facts.surfacePressureBar} 気圧`]);
      if (facts.dayHours !== undefined) basic.push(['1 日の長さ', durationJa(facts.dayHours / 24)]);
      if (facts.obliquityDeg !== undefined) basic.push(['自転の軸の傾き', `${facts.obliquityDeg} 度`]);
      if (facts.moons !== undefined) basic.push(['衛星の数', `${facts.moons} 個（NASA の表の時点）`]);
      if (facts.rings !== undefined) basic.push(['環', facts.rings ? 'ある' : '無い']);
      if (facts.magneticField !== undefined) basic.push(['全体の磁場', facts.magneticField === null ? 'わかっていない' : facts.magneticField ? 'ある' : '無い']);
    } else if (id !== 'Sun') {
      if (b.atmosphere) basic.push(['大気', 'ある']);
      if (b.rings) basic.push(['環', 'ある']);
    }
    sections.push({ title: id === 'Sun' ? '太陽のすがた' : 'すがた', rows: basic });

    const orbit: [string, string][] = [];
    if (facts?.distance1e6Km !== undefined) {
      const ofEarth = id === 'Moon';
      orbit.push([ofEarth ? '地球からの平均の距離' : '太陽からの平均の距離', `${num(facts.distance1e6Km * 1e6)} km${ofEarth ? '' : `（${round2((facts.distance1e6Km * 1e6) / KM_PER_AU)} 天文単位）`}`]);
      orbit.push(['いちばん近いとき', `${num(facts.perihelion1e6Km! * 1e6)} km`]);
      orbit.push(['いちばん遠いとき', `${num(facts.aphelion1e6Km! * 1e6)} km`]);
      orbit.push(['公転の周期', durationJa(facts.orbitalPeriodDays!)]);
      orbit.push(['公転の速さ', `${facts.orbitalSpeedKmS} km/s`]);
      orbit.push(['軌道の傾き', `${facts.inclinationDeg} 度`]);
      orbit.push(['軌道の離心率', `${facts.eccentricity}`]);
    } else if (b.motion.type === 'kepler') {
      const el = b.motion.elements;
      orbit.push(['軌道の大きさ（長半径）', el.aKm > 0.05 * KM_PER_AU ? `${round3(el.aKm / KM_PER_AU)} 天文単位` : `${num(el.aKm)} km`]);
      orbit.push(['公転の周期', durationJa(el.periodDays)]);
      orbit.push(['軌道の離心率', `${round3(el.e)}`]);
      orbit.push(['軌道の傾き', `${round2((el.iRad * 180) / Math.PI)} 度`]);
    }
    if (b.spin.type === 'steady' && !facts && id !== 'Sun') orbit.push(['自転の周期', durationJa(b.spin.periodHours / 24)]);
    if (b.spin.type === 'locked') orbit.push(['自転', 'いつも同じ面を親の天体に向けている（自転と公転の周期が同じ）']);
    if (orbit.length) sections.push({ title: '回り方', rows: orbit });

    // くらべてみると
    if (facts && id !== 'Earth') {
      notes.push(`体重 50 kg の人がこの天体の表面に立つと、${round2((50 * facts.gravityMS2) / 9.8)} kg の重さに感じます。`);
      if (facts.orbitalPeriodDays && id !== 'Moon') notes.push(`この天体の 1 年は、地球の ${round2(facts.orbitalPeriodDays / 365.25)} 年です。`);
    }
    if (b.kind !== 'spacecraft' && b.kind !== 'satellite' && id !== 'Earth' && b.radiusKm > 0) {
      const earths = (b.radiusKm / KM_PER_EARTH_R) ** 3;
      if (earths > 1.5) notes.push(`体積は地球の約 ${num(Math.round(earths))} 個分です。`);
      else if (earths < 0.7) notes.push(`地球の中に、この天体が約 ${num(Math.round(1 / earths))} 個入ります。`);
    }
  }

  private cometSections(c: Comet, sections: Article['sections'], notes: string[]): void {
    const rows: [string, string][] = [['種類', '彗星']];
    rows.push(['太陽にいちばん近いとき（近日点の距離）', `${round3(c.qAu)} 天文単位`]);
    rows.push(['軌道の離心率', `${round3(c.e)}${c.e >= 1 ? '（放物線・双曲線。太陽のまわりに戻ってこない）' : ''}`]);
    if (c.e < 1) {
      const a = c.qAu / (1 - c.e);
      rows.push(['太陽からいちばん遠いとき', `${round2(a * (1 + c.e))} 天文単位`]);
      rows.push(['公転の周期', durationJa(365.25 * a ** 1.5)]);
    }
    rows.push(['軌道の傾き', `${round2(c.iDeg)} 度`]);
    rows.push(['近日点を通る日', new Date(c.tpDays * 86_400_000).toLocaleDateString('ja-JP', { dateStyle: 'long' })]);
    if (c.diameterKm) rows.push(['核の直径', `約 ${round2(c.diameterKm)} km`]);
    sections.push({ title: '軌道', rows });
    if (c.e < 1 && c.qAu / (1 - c.e) > 0) {
      const p = (c.qAu / (1 - c.e)) ** 1.5;
      if (p < 200) notes.push(`この彗星は約 ${round2(p)} 年ごとに太陽のそばへ戻ってきます。`);
    }
  }

  private starSections(d: Extract<CollectionData, { t: 'star' }>, sections: Article['sections'], notes: string[]): void {
    const rows: [string, string][] = [['種類', '恒星']];
    if (d.info?.proper) rows.push(['固有名', d.info.proper]);
    if (d.info?.bayer) rows.push(['符号', d.info.bayer]);
    if (d.info?.constellation) rows.push(['星座', this.deps.constellationsJa.get(d.info.constellation) ?? d.info.constellation]);
    if (d.info?.spectral) rows.push(['スペクトル型', d.info.spectral]);
    const teff = d.real?.star.teffK ?? teffFromBv(d.bv);
    rows.push(['表面の温度', `約 ${num(Math.round(teff / 10) * 10)} K${d.real?.star.teffK ? '' : '（色から求めた値）'}`]);
    if (d.real?.star.radiusSun) rows.push(['半径', `太陽の ${ratio(d.real.star.radiusSun)} 倍`]);
    if (d.real?.star.massSun) rows.push(['質量', `太陽の ${ratio(d.real.star.massSun)} 倍`]);
    const lum = 10 ** (-0.4 * (d.absMag - 4.83));
    rows.push(['光の強さ（光度）', `太陽の約 ${ratio(lum)} 倍（明るさから求めた値）`]);
    if (d.info?.apparentMag !== null && d.info?.apparentMag !== undefined) rows.push(['地球から見た明るさ', `${d.info.apparentMag} 等${d.info.apparentMag <= 6 ? '（夜空で肉眼で見える）' : '（肉眼では見えない）'}`]);
    rows.push(['絶対等級', `${round2(d.absMag)} 等`]);
    sections.push({ title: '恒星のすがた', rows });
    if (d.real) {
      const pl: [string, string][] = d.real.planets.map((p, i) => [`${i + 1}`, `${p.name}（公転 ${durationJa(p.periodDays)}）`]);
      sections.push({ title: `惑星（${d.real.planets.length} 個）`, rows: pl });
    }
    if (lum > 2) notes.push(`この恒星は、太陽の約 ${ratio(lum)} 倍の光を出しています。太陽と同じ距離にあれば、地球はとても住めない暑さになります。`);
    else if (lum < 0.3) notes.push(`この恒星の光は太陽の約 ${ratio(lum)} 倍しかありません。ちょうどよい温度の惑星があるとすれば、恒星のすぐ近くを回っているはずです。`);
  }

  private exoplanetSections(d: Extract<CollectionData, { t: 'exoplanet' }>, sections: Article['sections'], notes: string[]): void {
    const p = d.real.planets[d.index];
    const host = this.entry(`${d.system}.0`);
    const rows: [string, string][] = [['種類', '系外惑星（太陽以外の恒星のまわりを回る惑星）']];
    rows.push(['主星（回っている恒星）', host?.name ?? d.real.name]);
    rows.push(['軌道の大きさ（長半径）', `${round3(p.aAu)} 天文単位`]);
    rows.push(['公転の周期', durationJa(p.periodDays)]);
    if (p.e !== null) rows.push(['軌道の離心率', `${round3(p.e)}`]);
    if (p.radiusRj !== null) rows.push(['半径', `木星の ${ratio(p.radiusRj)} 倍（地球の ${ratio((p.radiusRj * 69_911) / KM_PER_EARTH_R)} 倍）`]);
    if (p.massMj !== null) rows.push(['質量', `木星の ${ratio(p.massMj)} 倍（地球の ${ratio(p.massMj * 317.8)} 倍）`]);
    if (p.temperatureK !== null) rows.push(['温度', `約 ${num(Math.round(p.temperatureK))} K（${num(Math.round(p.temperatureK - 273))} ℃）`]);
    sections.push({ title: '惑星のすがた', rows });
    if (p.aAu < 0.1) notes.push(`主星までの距離は、太陽と水星の距離（0.39 天文単位）よりずっと近い ${round3(p.aAu)} 天文単位です。`);
    if (p.massMj !== null && p.massMj * 317.8 < 10 && p.temperatureK !== null && p.temperatureK > 180 && p.temperatureK < 320)
      notes.push('温度と重さから見ると、水が液体でいられるかもしれない惑星の候補です（大気のようすによって大きく変わります）。');
  }

  private compactSections(c: CompactObject, sections: Article['sections']): void {
    const rows: [string, string][] = [['種類', INFO_KIND_NAMES_JA[c.kind]]];
    if (c.periodS) {
      rows.push(['自転の周期', `${c.periodS < 1 ? round3(c.periodS * 1000) + ' ミリ秒' : round3(c.periodS) + ' 秒'}`]);
      rows.push(['1 秒に回る回数', `約 ${round2(1 / c.periodS)} 回`]);
    }
    if (c.massSun) rows.push(['質量', c.massSun > 1e5 ? `太陽の約 ${round2(c.massSun / 1e6)} 百万倍` : `太陽の約 ${round2(c.massSun)} 倍${c.code === 'BSGRASTR' ? '' : '（分からないときは典型的な値）'}`]);
    if (c.kind === 'black-hole' && c.massSun) rows.push(['事象の地平面の半径', `約 ${num(Math.round(2.953 * c.massSun))} km`]);
    sections.push({ title: 'すがた', rows });
  }

  private clusterSections(c: Cluster, sections: Article['sections']): void {
    const rows: [string, string][] = [['種類', c.kind === 'globular' ? '球状星団' : '散開星団']];
    if (c.nameJa) rows.push(['カタログの名前', c.name]);
    rows.push(['見つかっているメンバーの星', `${num(c.members)} 個（Gaia で見つかったもの）`]);
    rows.push(['半数の星が入る半径', `${round2(c.r50Pc * 3.2616)} 光年`]);
    if (c.rtPc) rows.push(['星団の重力が届く範囲（潮汐半径）', `${round2(c.rtPc * 3.2616)} 光年`]);
    if (c.logAge !== null) rows.push(['年齢', ageJa(10 ** c.logAge)]);
    sections.push({ title: '星団のすがた', rows });
  }

  private nebulaSections(n: Nebula, sections: Article['sections']): void {
    const rows: [string, string][] = [['種類', NEBULA_TYPE_NAMES_JA[n.type]]];
    if (n.nameJa) rows.push(['カタログの名前', n.name.replace(/^NAME /, '')]);
    rows.push(['半径', `${n.measured ? '' : '約 '}${round2(n.radiusPc * 3.2616)} 光年${n.measured ? '' : '（種類ごとの典型的な値）'}`]);
    sections.push({ title: '星雲のすがた', rows });
  }

  private galaxySections(g: Galaxy, sections: Article['sections']): void {
    const t = g.tType;
    const type = t === null ? '銀河' : t <= -1 ? '楕円銀河・矮小楕円銀河' : t === 0 ? 'レンズ状銀河' : t <= 8 ? '渦巻銀河' : '不規則銀河';
    const rows: [string, string][] = [['種類', type]];
    if (g.nameJa) rows.push(['カタログの名前', g.name]);
    rows.push(['半径', `約 ${num(Math.round(g.radiusPc * 3.2616))} 光年`]);
    rows.push(['明るさ（B バンドの絶対等級）', `${round2(g.absB)} 等（天の川銀河は約 −20.8 等）`]);
    if (g.inclinationDeg !== null) rows.push(['傾き（真上から 0 度）', `${round2(g.inclinationDeg)} 度`]);
    sections.push({ title: '銀河のすがた', rows });
  }
}

// ---- 書き方 ----

const num = (n: number) => Math.round(n).toLocaleString('ja-JP');
const round2 = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('ja-JP') : Number(n.toPrecision(3)).toLocaleString('ja-JP'));
const round3 = (n: number) => Number(n.toPrecision(3)).toString();
const ratio = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('ja-JP') : n >= 0.01 ? Number(n.toPrecision(3)).toString() : n.toExponential(1));
/** 大きな数を「1.99 × 10³⁰」の形で */
function sci(n: number): string {
  const e = Math.floor(Math.log10(n));
  const m = n / 10 ** e;
  const sup = String(e).replace(/[0-9-]/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] ?? '⁻');
  return `${Number(m.toPrecision(3))} × 10${sup}`;
}

export function distanceJa(km: number): string {
  if (km < 1e6) return `${num(km)} km`;
  if (km < 0.1 * KM_PER_LY) return `${round2(km / KM_PER_AU)} 天文単位（${round2(km / 1e8)} 億 km）`;
  const ly = km / KM_PER_LY;
  return ly >= 1e6 ? `${round2(ly / 1e6)} 百万光年` : `${round2(ly)} 光年`;
}

function lightTimeJa(km: number): string {
  const s = km / 299_792.458;
  if (s < 60) return `${round2(s)} 秒`;
  if (s < 3600) return `${round2(s / 60)} 分`;
  if (s < 86_400) return `${round2(s / 3600)} 時間`;
  if (s < 86_400 * 365.25) return `${round2(s / 86_400)} 日`;
  return `${round2(s / (86_400 * 365.25))} 年`;
}

function durationJa(days: number): string {
  if (days < 2 / 24) return `${round2(days * 1440)} 分`;
  if (days < 2) return `${round2(days * 24)} 時間`;
  if (days < 730) return `${round2(days)} 日`;
  return `${round2(days / 365.25)} 年`;
}

function ageJa(years: number): string {
  if (years >= 1e8) return `約 ${round2(years / 1e8)} 億年`;
  if (years >= 1e4) return `約 ${round2(years / 1e4)} 万年`;
  return `約 ${num(years)} 年`;
}

/** 空の方向（赤経・赤緯。地球から見て） */
export function skyDirection(v: Vec3): string {
  const r = length(v);
  let ra = (Math.atan2(v.y, v.x) * 12) / Math.PI;
  if (ra < 0) ra += 24;
  const dec = (Math.asin(v.z / r) * 180) / Math.PI;
  const h = Math.floor(ra);
  const m = Math.floor((ra - h) * 60);
  return `赤経 ${h}時${m}分・赤緯 ${dec >= 0 ? '+' : '−'}${Math.abs(dec).toFixed(1)}度`;
}

const kindName = (e: { kind: InfoKind }) => INFO_KIND_NAMES_JA[e.kind];
const enName = (en: string | null | undefined, ja: string) => (en && en !== ja ? en : null);
/** 周期彗星の日本語の名前：「1P/Halley」→「ハレー彗星（1P）」のようにはしない（読みが決まっていない彗星が多い）。番号と名前のまま */
const cometJa = (name: string) => name;

// ---- 図鑑を開いた画面から使う ----

let source: CollectionSource | null = null;
export const setCollectionSource = (s: CollectionSource) => {
  source = s;
};
export const getCollectionSource = () => source;
