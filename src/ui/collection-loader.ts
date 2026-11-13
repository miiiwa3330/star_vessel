/**
 * 世界の画面の外（タイトル画面のマイページ。2026-11-13）で、図鑑（要件 F38）に要るデータだけを読んで、
 * CollectionSource を作る。three.js は読み込まない（世界の描画は要らないため）。
 * 世界の画面（main.ts）は、宇宙を描くために同じデータをすでに読んでいるので、これは使わずに自分で作る。
 * 読むデータを足したら、main.ts の読み込みと食い違わないようにする（docs/tech/collection.md）
 */
import { decodeStars } from '../world/stars';
import { decodeExoplanets } from '../world/exoplanet-data';
import { decodeCompact } from '../world/compact-objects';
import { StarSystems } from '../world/star-systems';
import { majorGmKm3s2, registerBodies, setBodyResolver } from '../world/solar-system';
import { largeAsteroidBodies, moonBodies, type LargeAsteroid, type MoonRecord } from '../world/small-bodies';
import { spacecraftBody, type SpacecraftRecord } from '../world/spacecraft';
import { cometBody, decodeComets, type Comet } from '../world/comets';
import { decodeClusters } from '../world/clusters';
import { decodeNebulae } from '../world/nebulae';
import { decodeGalaxies } from '../world/galaxies';
import { decodeStarInfo } from '../world/star-info';
import { decodeConstellations, type Constellation } from '../world/constellations';
import { CollectionSource, getCollectionSource, setCollectionSource } from './collection-source';

let loading: Promise<CollectionSource> | null = null;

/** 図鑑のもとを作る（2 回目からは、1 回目のものを返す） */
export function loadCollectionSource(): Promise<CollectionSource> {
  const ready = getCollectionSource();
  if (ready) return Promise.resolve(ready);
  loading ??= load().catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}

const json = <T>(url: string): Promise<T> => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${url}: ${r.status}`))));

async function load(): Promise<CollectionSource> {
  const [starsBin, exoplanets, compact, moons, large, spacecraft, comets, clusters, nebulae, galaxies, starInfo, constellations] = await Promise.all([
    fetch('/data/stars.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`stars.bin: ${r.status}`)))),
    json<Parameters<typeof decodeExoplanets>[0]>('/data/exoplanets.json'),
    json<Parameters<typeof decodeCompact>[0]>('/data/compact.json'),
    json<{ moons: MoonRecord[] }>('/data/moons.json'),
    json<{ large: LargeAsteroid[] }>('/data/asteroids-large.json'),
    json<{ spacecraft: SpacecraftRecord[] }>('/data/spacecraft.json'),
    json<Parameters<typeof decodeComets>[0]>('/data/comets.json'),
    json<Parameters<typeof decodeClusters>[0]>('/data/clusters.json'),
    json<Parameters<typeof decodeNebulae>[0]>('/data/nebulae.json'),
    json<Parameters<typeof decodeGalaxies>[0]>('/data/galaxies.json'),
    json<Parameters<typeof decodeStarInfo>[0]>('/data/star-info.json'),
    json<{ constellations: Constellation[] }>('/data/constellations.json'),
  ]);
  // 太陽系の天体（衛星は番号のあるものだけ。仮符号の衛星は図鑑に入らない）
  registerBodies(moonBodies(moons.moons, { gm: majorGmKm3s2 }).filter((b) => !/p[0-9]+$/.test(b.id)));
  registerBodies(largeAsteroidBodies(large.large));
  registerBodies(spacecraft.spacecraft.map(spacecraftBody));
  const stars = decodeStars(starsBin);
  const realSystems = decodeExoplanets(exoplanets);
  const compactObjects = decodeCompact(compact);
  const systems = new StarSystems(stars, realSystems, compactObjects);
  const cometList: Comet[] = decodeComets(comets);
  const cometByCode = new Map(cometList.map((c) => [c.code, c]));
  // 一覧に無い天体：ほかの恒星系の天体と彗星（いまの位置を出すため）
  setBodyResolver((id) => {
    const exo = systems.findBody(id);
    if (exo) return exo;
    const comet = cometByCode.get(id);
    return comet ? cometBody(comet) : null;
  });
  const source = new CollectionSource({
    systems,
    realSystems,
    starInfo: decodeStarInfo(starInfo),
    compact: compactObjects,
    clusters: decodeClusters(clusters),
    nebulae: decodeNebulae(nebulae),
    galaxies: decodeGalaxies(galaxies),
    comets: cometList,
    constellationsJa: new Map(decodeConstellations(constellations).map((c) => [c.id, c.nameJa])),
    largeAsteroidNumbers: new Set(large.large.map((a) => a.number)),
    now: () => new Date(),
  });
  setCollectionSource(source);
  return source;
}
