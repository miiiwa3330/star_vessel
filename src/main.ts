import * as THREE from 'three/webgpu';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { FlightControls } from './controls/flight';
import { ensureSession } from './net/auth';
import { WarpApiError, warpApi } from './net/warp-repository';
import { SpaceLink } from './net/space-link';
import { createStarfield } from './render/starfield';
import { SolarSystemView } from './render/solar-system-view';
import { ChaseCamera } from './controls/chase-camera';
import { hullLengthKm } from './render/ship-models';
import { shipApi } from './net/ship-repository';
import { defaultDesignFor, SHIP_DESIGN_VERSION, type ShipDesign } from './world/ship-design';
import { ChatBubbles } from './ui/chat-bubbles';
import { CHAT_LOG_SIZE, CHAT_MIN_INTERVAL_MS } from './world/chat';
import { AsteroidField, type AsteroidFile } from './render/asteroid-field';
import { REQUIRED_TEXTURES, TEXTURE_FILES } from './render/body-looks';
import { WarpView } from './render/warp-view';
import { ShipView } from './render/ship-view';
import { GalaxyView } from './render/galaxy-view';
import { galactoToEqjPc } from './world/galaxy';
import { Hud } from './ui/Hud';
import { InfoController } from './ui/info-controller';
import { hudActions, hudStore, showNotice, type MapPoint } from './ui/hud-store';
import { CollectionSource, setCollectionSource } from './ui/collection-source';
import { decodeStarInfo, starNameJa } from './world/star-info';
import { worldNow } from './world/clock';
import { keepOutsideBodies } from './world/collision';
import { absolutePositionKm, moveBy, reanchor, startObserver } from './world/observer';
import { radarLayerOfBody, radarBlips, radarRange, type RadarTarget } from './world/radar';
import { SHIP_SEND_HZ } from './world/ship-schema';
import { ShipSmoother } from './world/ship-smoothing';
import { allBodies, bodyFixedToEqj, bodyInfo, findBody, majorGmKm3s2, registerBodies, unregisterBodies, type BodyInfo, heliocentricPositionKm, setBodyResolver } from './world/solar-system';
import { decodeExoplanets } from './world/exoplanet-data';
import { largeAsteroidBodies, moonBodies, smallAsteroidBody, type LargeAsteroid, type MoonRecord } from './world/small-bodies';
import { findAsteroidByNumber, findNearbyAsteroids } from './world/asteroid-search';
import { SatelliteCatalog, type SatelliteRecord } from './world/satellites';
import { SatelliteField } from './render/satellite-field';
import { ClusterView } from './render/cluster-view';
import { NebulaView } from './render/nebula-view';
import { ExtragalacticView } from './render/extragalactic-view';
import { ConstellationView } from './render/constellation-view';
import { CometField } from './render/comet-field';
import { activeComets, cometBody, decodeComets, type Comet } from './world/comets';
import { constellationSegments, decodeConstellations, type Constellation } from './world/constellations';
import { decodeNebulae, type Nebula } from './world/nebulae';
import { decodeGalaxies, type Galaxy } from './world/galaxies';
import { spacecraftBody, type SpacecraftRecord } from './world/spacecraft';
import { decodeCompact, type CompactObject } from './world/compact-objects';
import { clusterAt, decodeClusters, type Cluster } from './world/clusters';
import { StarSystems } from './world/star-systems';
import { starBodyId } from './world/planets';
import { createExtraStarfield } from './render/starfield';
import { applyStarMotion, decodeStars, DEFAULT_STAR_LIMIT, STAR_LIMIT_NAMES_JA, STAR_LIMITS, STAR_STRIDE, yearsSinceJ2000, type StarLimitMode } from './world/stars';
import { starLimitMag } from './render/star-sprites';
import { nearestSystem, readAddress, setAddressNameLookup, SYSTEM_SOL } from './world/address';
import { KM_PER_AU, KM_PER_PC } from './world/units';
import { add, length, mulVec, normalize, scale, sub, type Vec3 } from './world/vec';
import { arriveAt, planWarpHere, removableWarpHere, warpPositionKm } from './world/warp';
import { MAX_WARPS_PER_PLAYER, type WarpHole } from './world/warp-schema';

/** 星の見え方を覚えておく場所（localStorage） */
const STAR_LIMIT_KEY = 'star_vessel.starLimit';
/** 星座の線を出しているかを覚えておく場所（localStorage） */
const CONSTELLATIONS_KEY = 'star_vessel.constellations';
/** 仮符号の衛星は、親の惑星からこの距離（km）より近いときだけ一覧に入れる（数が多く、見えないくらい小さいので） */
const PROVISIONAL_MOON_RANGE_KM = 1e8;
/** スマホで描く Gaia の星の数（明るい順） */
const GAIA_MOBILE_STARS = 100_000;
/** 太陽の近く（尾が出る）と自分の近くの彗星を、最大いくつ天体の一覧に入れるか。自分から何 km を近いとするか */
const MAX_ACTIVE_COMETS = 40;
const COMET_NEAR_KM = 2e7;
/** 自分の船の吹き出しの id */
const SELF_BUBBLE = 'self';

const FOV = 60;
const HUD_INTERVAL_MS = 100;
/** いる恒星系（宇宙の部屋）を確かめ直す間隔 */
const ROOM_CHECK_MS = 2_000;

async function main() {
  createRoot(document.getElementById('ui')!).render(createElement(Hud));
  const canvas = document.getElementById('view') as HTMLCanvasElement;

  // 太陽系は km、恒星は pc。とても広い奥行きを扱うので、対数の奥行きを使う
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  await renderer.init();
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const isWebGPU = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  hudStore.set({ backend: isWebGPU ? 'WebGPU' : 'WebGL2' });

  // 手前は 1 m まで（他の船に近づけるように）。奥行きは対数なので、手前を小さくしても遠くは崩れない
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.001, 1e11);
  // 奥は約 3 億 pc（いちばん遠い銀河が 2,600 万 pc）
  const starCamera = new THREE.PerspectiveCamera(FOV, 1, 1e-6, 3e8);
  const starScene = new THREE.Scene();

  const loader = new THREE.TextureLoader();
  const loadTexture = async (url: string) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  // 天体の画像。地球と月は必ずある。ほかは置いてあれば使い、無ければ模様を自動で描く（src/render/body-looks.ts）
  const textureEntries = Object.entries(TEXTURE_FILES).map(async ([id, file]) => {
    try {
      return [id, await loadTexture(`/textures/${file}`)] as const;
    } catch (e) {
      if (REQUIRED_TEXTURES.includes(id)) throw e;
      return null;
    }
  });
  const fetchJson = <T,>(url: string, fallback: T): Promise<T> =>
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
      .catch((e: unknown) => {
        console.error(`${url} が読めない`, e);
        return fallback;
      });
  const [textures, starsBin, starsMotion, exoplanetsJson] = await Promise.all([
    Promise.all(textureEntries),
    fetch('/data/stars.bin').then((r) => {
      if (!r.ok) throw new Error('星のデータ（/data/stars.bin）が読めない。npm run stars で作る');
      return r.arrayBuffer();
    }),
    fetch('/data/stars-motion.bin')
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null),
    fetch('/data/exoplanets.json').then((r) => {
      if (!r.ok) throw new Error('系外惑星のデータ（/data/exoplanets.json）が読めない。npm run exoplanets で作る');
      return r.json();
    }),
  ]);
  // 太陽系の衛星と、大きな小惑星・準惑星（要件 F20・F21）。読めなくても宇宙は見られるようにする
  let asteroidFiles: AsteroidFile[] = [];
  /** 仮符号の衛星。親の惑星の近くにいるときだけ、天体の一覧に入れる */
  const provisionalMoons = new Map<string, BodyInfo>();
  const largeAsteroidNumbers = new Set<number>();
  await Promise.all([
    fetch('/data/moons.json')
      .then((r) => r.json())
      .then((d: { moons: MoonRecord[] }) => {
        const all = moonBodies(d.moons, { gm: majorGmKm3s2 });
        for (const b of all) if (/p[0-9]+$/.test(b.id)) provisionalMoons.set(b.id, b);
        registerBodies(all.filter((b) => !provisionalMoons.has(b.id)));
      }),
    fetch('/data/asteroids-large.json')
      .then((r) => r.json())
      .then((d: { large: LargeAsteroid[]; files: AsteroidFile[] }) => {
        registerBodies(largeAsteroidBodies(d.large));
        d.large.forEach((a) => largeAsteroidNumbers.add(a.number));
        asteroidFiles = d.files;
      }),
  ]).catch((e: unknown) => console.error('衛星・小惑星のデータが読めない', e));
  const asteroids = new AsteroidField();
  const solar = new SolarSystemView(Object.fromEntries(textures.filter((t) => t !== null)));
  const stars = decodeStars(starsBin);
  // 星を今の位置へ（要件 F5）。Barnard 星のように速い星は、J2000.0 から 4 分角以上動いている
  if (starsMotion) applyStarMotion(stars.data, new Float32Array(starsMotion), yearsSinceJ2000(worldNow()));
  starScene.add(createStarfield(stars).sprite);
  // Gaia DR3 の星（docs/tech/gaia-stars.md）は起動してから裏で読み込む（?stars=hyg を付けると読まない。重さの確かめ用）
  const loadGaiaStars = async (onLoaded: () => void) => {
    if (new URLSearchParams(location.search).get('stars') === 'hyg') return;
    const index = await fetch('/data/stars-gaia.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { files: { name: string; count: number }[] } | null;
    if (!index) return;
    // スマホ（指で操作する端末）は最初のファイル（本来の明るさの順なので、明るい星）だけ読む。データの量と重さのため
    const coarse = matchMedia('(pointer: coarse)').matches;
    const files = coarse ? index.files.slice(0, 1) : index.files;
    const parts = await Promise.all(files.map((f) => fetch(`/data/${f.name}`).then((r) => r.arrayBuffer())));
    const gaia = parts.map((b) => new Float32Array(b));
    const merged = new Float32Array(stars.data.length + gaia.reduce((n, g) => n + g.length, 0));
    merged.set(stars.data, 0);
    let o = stars.data.length;
    for (const g of gaia) {
      merged.set(g, o);
      o += g.length;
    }
    // スマホは、読んだ星のうちさらに明るいものだけを描く
    const part = { count: (merged.length - stars.data.length) / STAR_STRIDE, data: merged.subarray(stars.data.length) };
    const drawn = coarse ? { count: Math.min(part.count, GAIA_MOBILE_STARS), data: part.data } : part;
    starScene.add(createStarfield(drawn).sprite);
    stars.data = merged;
    stars.count = merged.length / STAR_STRIDE;
    onLoaded();
  };
  // 星座の線（要件 F40）は、星の今の位置から作る
  const constellationList = await fetchJson<{ constellations: Constellation[] }>('/data/constellations.json', { constellations: [] }).then(decodeConstellations);
  const constellationSeg = constellationSegments(constellationList, stars.data, STAR_STRIDE);
  const constellationView = new ConstellationView(constellationSeg);
  starScene.add(constellationView.group);
  // 系外惑星（要件 F22）。いる恒星系の恒星と惑星を、天体の一覧に入れ替えて登録する
  const realSystems = decodeExoplanets(exoplanetsJson);
  // 実在の星の燃えかす（白色矮星・パルサー・ブラックホール）。読めなくても宇宙は見られるようにする
  const compactObjects = await fetch('/data/compact.json')
    .then((r) => r.json())
    .then(decodeCompact)
    .catch((e: unknown) => {
      console.error('白色矮星・パルサー・ブラックホールのデータが読めない', e);
      return [] as CompactObject[];
    });
  const systems = new StarSystems(stars, realSystems, compactObjects);
  // 恒星の名前と見え方（固有名のある恒星・系外惑星のある恒星。図鑑と情報のカード）。読めなくても動く
  const starInfo = await fetchJson<{ stars: Parameters<typeof decodeStarInfo>[0]['stars'] }>('/data/star-info.json', { stars: [] }).then(decodeStarInfo);
  void loadGaiaStars(() => systems.catalogChanged()).catch((e: unknown) => console.error('Gaia の星のデータが読めない', e));
  // 人工衛星（ISS など）。サーバーが最新の軌道要素を取ってくる。取れなければ同梱の写し（古くなる）を使う
  const satRecords = await fetch('/api/satellites')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .catch(() => fetch('/data/satellites.json').then((r) => r.json()))
    .then((d: { satellites: SatelliteRecord[] }) => d.satellites)
    .catch((e: unknown) => {
      console.error('人工衛星のデータが読めない', e);
      return [] as SatelliteRecord[];
    });
  const satellites = new SatelliteCatalog(satRecords);
  satellites.update(worldNow(), true);
  const satelliteField = new SatelliteField(satellites);
  // 探査機（ボイジャーなど）と彗星。読めなくても宇宙は見られるようにする
  const spacecraftRecords = await fetchJson<{ spacecraft: SpacecraftRecord[] }>('/data/spacecraft.json', { spacecraft: [] }).then((d) => d.spacecraft);
  registerBodies(spacecraftRecords.map(spacecraftBody));
  const comets = await fetchJson<Parameters<typeof decodeComets>[0]>('/data/comets.json', { comets: [] }).then(decodeComets);
  const cometByCode = new Map<string, Comet>(comets.map((c) => [c.code, c]));
  const cometField = new CometField(comets);

  // 一覧に無い天体：遠くの恒星系の天体、光の点として描いている小さな小惑星（A＋番号）や人工衛星（N＋番号）
  const smallAsteroidCache = new Map<string, BodyInfo | null>();
  setBodyResolver((id) => {
    const exo = systems.findBody(id);
    if (exo) return exo;
    const provisional = provisionalMoons.get(id);
    if (provisional) return provisional;
    const comet = cometByCode.get(id);
    if (comet) return cometBody(comet);
    const sat = /^N([0-9]+)$/.exec(id);
    if (sat) {
      const i = satellites.indexOfId(Number(sat[1]));
      return i >= 0 ? satellites.body(i) : null;
    }
    const m = /^A([0-9]+)$/.exec(id);
    if (!m) return null;
    if (!smallAsteroidCache.has(id)) {
      const a = findAsteroidByNumber(asteroids.chunks, Number(m[1]));
      // データがまだ読み込めていなければ覚えない（あとでもう一度探す）
      if (!a && asteroids.chunks.length === 0) return null;
      smallAsteroidCache.set(id, a ? smallAsteroidBody(a) : null);
    }
    return smallAsteroidCache.get(id) ?? null;
  });
  const extraStars = systems.extraStars();
  starScene.add(createExtraStarfield(extraStars).sprite);
  setAddressNameLookup(({ system, planet, moon }) => {
    if (system === SYSTEM_SOL) {
      const id = moon > 0 ? `S${planet}.${moon}` : planet;
      return findBody(id)?.nameJa ?? null;
    }
    const real = realSystems.get(system);
    if (!real) return null;
    if (planet === '') return real.name;
    const name = real.planets[Number(planet) - 1]?.name;
    if (!name) return null;
    // 恒星の名前と重ならないように、恒星の名前で始まる惑星の名前は後ろだけにする（TRAPPIST-1 e → 惑星 e）
    return name.startsWith(`${real.name} `) ? `惑星 ${name.slice(real.name.length + 1)}` : name;
  });
  const galaxy = new GalaxyView();
  starScene.add(galaxy.group);
  // 星団（Hunt & Reffert 2023）。読めなくても宇宙は見られるようにする
  const clusters = await fetch('/data/clusters.json')
    .then((r) => r.json())
    .then(decodeClusters)
    .catch((e: unknown) => {
      console.error('星団のデータが読めない', e);
      return [] as Cluster[];
    });
  const clusterView = new ClusterView(clusters);
  starScene.add(clusterView.group);
  // 星雲と、天の川銀河の外の銀河。読めなくても宇宙は見られるようにする
  const nebulae: Nebula[] = await fetchJson<Parameters<typeof decodeNebulae>[0]>('/data/nebulae.json', { nebulae: [] }).then(decodeNebulae);
  const nebulaView = new NebulaView(nebulae);
  starScene.add(nebulaView.group);
  const externalGalaxies: Galaxy[] = await fetchJson<Parameters<typeof decodeGalaxies>[0]>('/data/galaxies.json', { galaxies: [] }).then(decodeGalaxies);
  const extragalactic = new ExtragalacticView(externalGalaxies);
  starScene.add(extragalactic.group);
  /** いる場所の恒星系と腕（本物の星・系外惑星のデータの星・自動で作った星のうち、いちばん近い星） */
  const systemAt = (posKm: { x: number; y: number; z: number }) =>
    nearestSystem(posKm, stars.data, STAR_STRIDE, [...galaxy.localStars, ...extraStars]);
  solar.scene.add(asteroids.group);
  solar.scene.add(satelliteField.sprite);
  solar.scene.add(cometField.sprite);
  // 小惑星の光の点は、起動してから裏で読み込む。スマホ（指で操作する端末）は明るいものだけ
  // （?asteroids=bright を付けると、PC でも明るいものだけにする。重さの確かめ用）
  const brightOnly = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).get('asteroids') === 'bright';
  void asteroids
    .load(brightOnly ? asteroidFiles.slice(0, 1) : asteroidFiles)
    .catch((e: unknown) => console.error('小惑星のデータが読めない', e));
  const warpView = new WarpView();
  solar.scene.add(warpView.group);
  const shipView = new ShipView();
  solar.scene.add(shipView.group);
  const link = new SpaceLink();
  const shipSmoother = new ShipSmoother();

  // チャット（要件 F6）。届いたら、送った人の船の上に吹き出しを出し、画面の左下の履歴にも残す
  const bubbles = new ChatBubbles(document.getElementById('ui')!);
  let chatKey = 0;
  link.onChat = ({ from, hue, name, text }) => {
    const mine = from === link.selfId;
    bubbles.show(mine ? SELF_BUBBLE : from, text, hue, performance.now());
    const log = [{ key: ++chatKey, hue, name, text, mine, at: Date.now() }, ...hudStore.get().chatLog].slice(0, CHAT_LOG_SIZE);
    hudStore.set({ chatLog: log });
  };
  let chatSentAt = -Infinity;
  hudActions.sendChat = (text) => {
    // サーバーは間隔の短いものを黙って捨てるので、先にここで知らせる（スタンプを続けて押したときなど）
    if (performance.now() - chatSentAt < CHAT_MIN_INTERVAL_MS) {
      showNotice('少し待ってから送ってください');
      return false;
    }
    if (link.sendChat(text)) {
      chatSentAt = performance.now();
      return true;
    }
    showNotice(link.connected ? '送れない文です' : '宇宙の部屋につながっていないため、チャットを送れません', 4000);
    return false;
  };
  const projected = new THREE.Vector3();

  // ワープホール（要件 F9）。全員で共有する。サーバーにつながらなくても、宇宙は見られるようにする
  let warps: WarpHole[] = [];
  const setWarps = (next: WarpHole[]) => {
    warps = next;
    warpView.setWarps(warps);
  };
  const refreshWarps = async () => setWarps(await warpApi.list());
  /** 自分の宇宙船の設計（要件 F27）。サーバーから読むまでは仮にソーサー */
  let myDesign: ShipDesign = { v: SHIP_DESIGN_VERSION, hull: 'saucer' };
  let online = false;
  try {
    await ensureSession();
    online = true;
    await refreshWarps();
    hudStore.set({ warpsReady: true });
    // 自分の宇宙船の設計（宇宙船はタイトル画面の出発前に選ぶ。まだ無ければ仮のソーサーのまま）
    const saved = await shipApi.get();
    if (saved) myDesign = saved;
  } catch (e) {
    console.error(e);
    hudStore.set({ status: 'Offline: warp holes are unavailable' });
  }

  let observer = startObserver(worldNow());
  const controls = new FlightControls(canvas);

  // 天体の情報とコレクション（要件 F35〜F38）
  const info = new InfoController({
    ui: document.getElementById('ui')!,
    camera,
    systems,
    stars,
    extraStars: [...galaxy.localStars, ...extraStars],
    clusters,
    nebulae,
    galaxies: externalGalaxies,
    face: (rel) => controls.lookAt(rel, controls.up()),
    starName: (system) => starNameJa(starInfo.get(system)),
  });
  controls.onTap = (x, y) => info.tap(x, y, window.innerWidth, window.innerHeight);
  if (online) void info.connect();
  // コレクション（図鑑。要件 F38）：集められる天体のカタログと、詳細の説明。カタログは図鑑を初めて開いたときに作る
  const collection = new CollectionSource({
    systems,
    realSystems,
    starInfo,
    compact: compactObjects,
    clusters,
    nebulae,
    galaxies: externalGalaxies,
    comets,
    constellationsJa: new Map(constellationList.map((c) => [c.id, c.nameJa])),
    largeAsteroidNumbers,
    now: worldNow,
  });
  setCollectionSource(collection);
  hudActions.faceEntry = (key) => {
    const d = worldNow();
    const e = collection.entry(key) ?? collection.extras(hudStore.get().visits).find((x) => x.key === key);
    const p = e ? collection.positionKm(e, d) : info.locate(key, d);
    if (p) controls.lookAt(sub(p, absolutePositionKm(observer, d)), controls.up());
  };
  // 3D のマップの、訪れた場所のいまの位置（要件 F62）
  const updateMapPoints = () => {
    const d = worldNow();
    const points: MapPoint[] = [];
    for (const v of hudStore.get().visits) {
      const positionKm = info.locate(v.key, d);
      if (positionKm) points.push({ key: v.key, name: v.name, kind: v.kind, positionKm });
    }
    hudStore.set({ mapPoints: points, mapSelfKm: absolutePositionKm(observer, d) });
  };
  let lastMapUpdate = 0;

  // 視点（要件 F28）と自分の宇宙船（要件 F27）
  const chase = new ChaseCamera();
  controls.onOrbit = (dx, dy) => {
    if (chase.mode === 'first') return false;
    chase.orbit(dx, dy);
    return true;
  };
  controls.onZoom = (steps) => {
    if (chase.mode !== 'first') chase.zoom(steps);
  };
  controls.onToggleView = () => hudActions.toggleView();
  controls.onToggleStatus = () => hudActions.toggleStatus();
  // 開いている画面（ゲームメニュー・レーダー・マップ・チャット・コレクション・写真）。どれか 1 つだけ。
  // PC では、開くとカーソルを出し、閉じると操縦に戻る（カーソルを消す）。入ったばかりのときは何も開かず、クリックを待つ
  controls.isBlocked = () => hudStore.get().overlay !== null;
  hudActions.setOverlay = (overlay) => {
    const prev = hudStore.get();
    if (overlay === prev.overlay) return;
    // ワープはレーダーから（2026-11-12）。開くたびに、全員のワープホールを取り直す
    if (overlay === 'radar') hudActions.refreshWarps();
    // ワープはレーダーからだけ。レーダーを閉じたら、選んだワープホールのカードも消す
    if (prev.overlay === 'radar' && prev.selectedWarp) hudStore.set({ selectedWarp: null });
    // 3D のマップ（要件 F62）：開くときに、訪れた場所の位置を入れる（開いている間は 1 秒ごとに入れ直す）
    if (overlay === 'map') updateMapPoints();
    if (prev.overlay === 'map' && prev.mapFocus) hudStore.set({ mapFocus: null });
    // 写真の画面を閉じたら、写真はブラウザから消す（保存・共有していなければ残らない）
    if (prev.overlay === 'photo' && prev.photo) {
      URL.revokeObjectURL(prev.photo.url);
      hudStore.set({ photo: null });
    }
    hudStore.set({ overlay });
    if (overlay === null) controls.requestLock();
    else controls.exitLock();
  };
  // ゲームメニューの間は、メニューのボタンのほかは受け付けない（R・M・1〜6 で別の画面に切り替えない）
  const unlessMenu = (f: () => void) => () => {
    if (hudStore.get().overlay !== 'menu') f();
  };
  controls.onToggleRadar = unlessMenu(() => hudActions.toggleOverlay('radar'));
  controls.onToggleMap = unlessMenu(() => hudActions.toggleOverlay('map'));
  controls.onHotbar = (n) =>
    unlessMenu(() => {
      if (n === 1) hudActions.toggleOverlay('collection');
      else if (n === 2) hudActions.cycleStarLimit();
      else if (n === 3) hudActions.toggleConstellations();
      else if (n === 4 && hudStore.get().warpsReady) hudActions.pressWarpButton();
      else if (n === 5) hudActions.takePhoto();
      else if (n === 6) hudActions.toggleOverlay('map');
    })();
  controls.onPhoto = unlessMenu(() => hudActions.takePhoto());
  controls.onEscape = () => hudActions.setOverlay(hudStore.get().overlay === null ? 'menu' : null);
  // Enter・T でチャットの入力欄を開く
  controls.onOpenChat = () => {
    // つながる前は入力欄を使えない
    if (!hudStore.get().chatReady) {
      showNotice('宇宙の部屋につながると、チャットを使えます');
      return;
    }
    hudActions.setOverlay('chat');
  };
  // マウスのカーソルを消して操縦する（PC。要件 F60）。操縦中に Esc でカーソルが戻ったら、ゲームメニューを出す
  controls.onUserUnlock = () => {
    if (hudStore.get().overlay === null) hudStore.set({ overlay: 'menu' });
  };
  controls.onLockState = (locked, pointerLock) => hudStore.set({ locked, pointerLock });
  controls.onLockError = () => {
    // Esc の直後は、ブラウザがしばらくカーソルを消させない。何も開いていない状態で止まらないよう、ゲームメニューに戻す
    if (hudStore.get().overlay === null && controls.usesPointerLock) hudStore.set({ overlay: 'menu' });
    showNotice('操縦に戻れませんでした。少し待ってから、もう一度押してください');
  };
  hudStore.set({ pointerLock: controls.usesPointerLock, locked: false, overlay: null });
  hudActions.setMoveKey = (code, down) => controls.setVirtualKey(code, down);
  // 星の見え方（要件 F34）。選んだものは、この端末に覚えておく
  const setStarLimit = (mode: StarLimitMode) => {
    starLimitMag.value = STAR_LIMITS[mode];
    hudStore.set({ starLimit: mode });
    try {
      localStorage.setItem(STAR_LIMIT_KEY, mode);
    } catch {
      // 覚えられなくても動く
    }
  };
  {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STAR_LIMIT_KEY);
    } catch {
      saved = null;
    }
    setStarLimit(saved && saved in STAR_LIMITS ? (saved as StarLimitMode) : DEFAULT_STAR_LIMIT);
  }
  // 星座の線（要件 F40）。選んだものは、この端末に覚えておく
  const setConstellations = (on: boolean) => {
    constellationView.visible = on;
    hudStore.set({ constellations: on, aimConstellation: on ? hudStore.get().aimConstellation : null });
    try {
      localStorage.setItem(CONSTELLATIONS_KEY, on ? '1' : '0');
    } catch {
      // 覚えられなくても動く
    }
  };
  {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CONSTELLATIONS_KEY);
    } catch {
      saved = null;
    }
    setConstellations(saved === '1');
  }
  hudActions.toggleConstellations = () => {
    setConstellations(!constellationView.visible);
    if (constellationView.visible) showNotice('星座の線を出しました。遠くへ行くと形が崩れます');
  };
  controls.onToggleConstellations = () => hudActions.toggleConstellations();
  hudActions.cycleStarLimit = () => {
    const modes = Object.keys(STAR_LIMITS) as StarLimitMode[];
    const next = modes[(modes.indexOf(hudStore.get().starLimit) + 1) % modes.length];
    setStarLimit(next);
    showNotice(`星の見え方：${STAR_LIMIT_NAMES_JA[next]}（${STAR_LIMITS[next]} 等まで）`);
  };
  hudActions.toggleView = () => {
    const mode = chase.toggle();
    if (mode === 'first') {
      chase.reset();
      controls.dragMode = 'steer';
    }
    hudStore.set({ viewMode: mode, orbitDrag: false });
  };
  hudActions.toggleOrbitDrag = () => {
    controls.dragMode = controls.dragMode === 'orbit' ? 'steer' : 'orbit';
    hudStore.set({ orbitDrag: controls.dragMode === 'orbit' });
  };
  {
    const d = worldNow();
    const earthRel = sub(heliocentricPositionKm('Earth', d), absolutePositionKm(observer, d));
    controls.lookAt(earthRel, { x: 0, y: 0, z: 1 });
  }

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = starCamera.aspect = w / h;
    galaxy.setViewport(h, FOV);
    clusterView.setViewport(h, FOV);
    nebulaView.setViewport(h, FOV);
    extragalactic.setViewport(h, FOV);
    {
      const ppr = h / 2 / Math.tan((FOV * Math.PI) / 360);
      solar.setViewport(h, FOV);
      satelliteField.pxPerRadian = ppr;
      shipView.pxPerRadian = ppr;
    }
    camera.updateProjectionMatrix();
    starCamera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const describeError = (e: unknown) =>
    e instanceof WarpApiError && e.kind === 'limit'
      ? `ワープホールを作れるのは ${MAX_WARPS_PER_PLAYER} 個までです。自分のワープホールまで行って、ワープホールのボタンで消すと、また作れます`
      : 'うまくいきませんでした。少し待ってからもう一度試してください';
  const placeWarp = async () => {
    const placement = planWarpHere(observer, controls.forward(), worldNow(), systemAt);
    try {
      const w = await warpApi.place(placement);
      setWarps([...warps, w]);
      showNotice(`ワープホール ${w.code} を作りました（ワープはレーダーから）`, 4000);
    } catch (e) {
      console.error(e);
      showNotice(describeError(e), 5000);
    }
  };
  /** いる場所で消せる自分のワープホール（1 秒に 10 回、画面の値と一緒に探す） */
  const findWarpHere = (date: Date, abs: Vec3) =>
    removableWarpHere(
      warps.filter((w) => w.mine && findBody(w.anchor) !== null).map((w) => ({ w, mine: true, positionKm: warpPositionKm(w, date) })),
      abs,
    )?.w ?? null;
  /** 消す前の確かめ：もう一度押すと消す（押し間違いで、全員と共有しているワープホールを消さないように。仮） */
  let removeArmed: { id: string; until: number } | null = null;
  const REMOVE_CONFIRM_MS = 3_000;
  hudActions.pressWarpButton = () => {
    const d = worldNow();
    const here = findWarpHere(d, absolutePositionKm(observer, d));
    if (!here) {
      removeArmed = null;
      void placeWarp();
      return;
    }
    const now = performance.now();
    if (removeArmed && removeArmed.id === here.id && now < removeArmed.until) {
      removeArmed = null;
      void removeWarp(here.id);
      return;
    }
    removeArmed = { id: here.id, until: now + REMOVE_CONFIRM_MS };
    showNotice(`もう一度押すと、ワープホール ${here.code} を消します`, REMOVE_CONFIRM_MS);
  };
  hudActions.changeSpeed = (steps) => controls.changeSpeed(steps, true);
  // 写真（要件 F61）：次に描いたすぐあとの画面を、そのまま画像にする（画面の表示・文字は入らない。宇宙だけが写る）。
  // WebGPU・WebGL2 とも、描いた直後の同じ処理の中でないと、画面の中身を読めないため、ループの中で撮る
  let photoRequested = false;
  hudActions.takePhoto = () => {
    photoRequested = true;
  };
  const capturePhoto = (date: Date) => {
    const width = canvas.width;
    const height = canvas.height;
    // 描いた画面は、宇宙の暗いところが透明（アルファ 0）のことがあるので、黒の上に重ねてから画像にする
    // （そのままだと、保存した画像の背景が透け、写真の画面でも後ろのすりガラスが透けて見える。2026-11-12）
    const flat = document.createElement('canvas');
    flat.width = width;
    flat.height = height;
    const fctx = flat.getContext('2d');
    if (fctx) {
      fctx.fillStyle = '#000';
      fctx.fillRect(0, 0, width, height);
      fctx.drawImage(canvas, 0, 0);
    }
    (fctx ? flat : canvas).toBlob((blob) => {
      if (!blob) {
        showNotice('写真を撮れませんでした');
        return;
      }
      const prev = hudStore.get().photo;
      if (prev) URL.revokeObjectURL(prev.url);
      // 名前は世界の時刻（UTC）。例：star-vessel-20261112-123456.png
      const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const photo = { url: URL.createObjectURL(blob), blob, fileName: `star-vessel-${stamp}.png`, width, height };
      hudStore.set({ photo, shutter: hudStore.get().shutter + 1 });
      hudActions.setOverlay('photo');
    }, 'image/png');
  };
  hudActions.refreshWarps = () => {
    refreshWarps().catch((e: unknown) => console.error(e));
  };
  hudActions.warpTo = (id) => {
    const w = warps.find((x) => x.id === id);
    if (!w || findBody(w.anchor) === null) return;
    observer = arriveAt(w);
    lastRoomCheck = -Infinity;
    controls.stop();
    // 輪の正面に出て、輪の方を向く
    controls.lookAt({ x: -w.facing.x, y: -w.facing.y, z: -w.facing.z }, controls.up());
    hudStore.set({ selectedWarp: null });
    showNotice(`${w.code} へワープしました`);
  };
  hudActions.faceWarp = (id) => {
    const w = warps.find((x) => x.id === id);
    if (!w || findBody(w.anchor) === null) return;
    const d = worldNow();
    controls.lookAt(sub(warpPositionKm(w, d), absolutePositionKm(observer, d)), controls.up());
  };
  const removeWarp = async (id: string) => {
    const w = warps.find((x) => x.id === id && x.mine);
    if (!w) return;
    try {
      await warpApi.remove(w.id);
      setWarps(warps.filter((x) => x.id !== w.id));
      if (hudStore.get().selectedWarp === w.id) hudStore.set({ selectedWarp: null });
      showNotice(`ワープホール ${w.code} を消しました`);
    } catch (e) {
      console.error(e);
      showNotice(describeError(e), 5000);
    }
  };

  // 開発サーバーのときだけ：画面の確かめのために、好きな場所へ瞬間移動できる（本番のビルドには入らない）
  if (import.meta.env.DEV) {
    const devTools = {
      /** 動きの滑らかさを測るための入口（描いている物を直接読む） */
      debug: { shipView, cometField, satelliteField, solar, asteroids, starScene, chase },
      /** 太陽中心の EQJ（pc）の場所へ行き、lookAtPc の方を向く */
      teleportPc(p: { x: number; y: number; z: number }, lookAtPc = { x: 0, y: 0, z: 0 }) {
        observer = reanchor({ anchor: 'Sun', offsetKm: { x: p.x * KM_PER_PC, y: p.y * KM_PER_PC, z: p.z * KM_PER_PC } }, worldNow());
        lastRoomCheck = -Infinity;
        controls.stop();
        controls.lookAt({ x: lookAtPc.x - p.x, y: lookAtPc.y - p.y, z: lookAtPc.z - p.z }, { x: 0, y: 0, z: 1 });
      },
      /** 天体（id）のそばへ行き、その天体の方を向く。distanceKm は中心からの距離（省略すると半径の 4 倍） */
      teleportBody(id: string, distanceKm?: number, view: 'day' | 'pole' | 'night' = 'day') {
        const d = worldNow();
        const info = bodyInfo(id);
        const center = heliocentricPositionKm(id, d);
        // day：恒星の光が当たっている側から、pole：北極の上から、night：夜の側から見る
        const toLight = center.x === 0 && center.y === 0 && center.z === 0 ? { x: 1, y: 0, z: 0 } : scale(center, -1 / length(center));
        const dir = view === 'pole' ? mulVec(bodyFixedToEqj(id, d), { x: 0, y: 0, z: 1 }) : view === 'night' ? scale(toLight, -1) : toLight;
        const p = add(center, scale(dir, distanceKm ?? info.radiusKm * 4));
        observer = reanchor({ anchor: 'Sun', offsetKm: p }, d);
        lastRoomCheck = -Infinity;
        controls.stop();
        controls.lookAt(sub(center, p), { x: 0, y: 0, z: 1 });
      },
      /** 恒星系（例：H70666、E1WHADEK）の恒星の近くへ行く。distanceAu は恒星からの距離 */
      teleportSystem(system: string, distanceAu = 1) {
        const host = systems.hostOf(system);
        if (!host) throw new Error(`恒星系が見つからない: ${system}`);
        const center = scale(host.positionPc, KM_PER_PC);
        const p = add(center, scale(normalize(scale(host.positionPc, -1)), distanceAu * KM_PER_AU));
        observer = reanchor({ anchor: 'Sun', offsetKm: p }, worldNow());
        controls.lookAt(sub(center, p), { x: 0, y: 0, z: 1 });
        controls.stop();
        lastRoomCheck = -Infinity;
      },
      /** 銀河中心の座標（kpc）で瞬間移動する */
      teleportGalacto(g: { x: number; y: number; z: number }, lookAtG = { x: 0, y: 0, z: 0 }) {
        devTools.teleportPc(galactoToEqjPc(g), galactoToEqjPc(lookAtG));
      },
    };
    (window as unknown as { __sv: typeof devTools }).__sv = devTools;
  }

  let last = performance.now();
  let lastHud = 0;
  let lastSend = 0;
  let lastRoomCheck = -Infinity;
  /** いま球として一覧に入れている、小さな小惑星の id */
  const shownSmallAsteroids = new Set<string>();
  /** いま模型として一覧に入れている、人工衛星の id */
  const shownSatellites = new Set<string>();
  /** いま天体の一覧に入れている、彗星・仮符号の衛星の id */
  const shownComets = new Set<string>();
  const shownProvisional = new Set<string>();
  let velocityKmS = { x: 0, y: 0, z: 0 };
  hudStore.set({ status: null });

  renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const date = worldNow();

    const delta = controls.update(dt);
    velocityKmS = dt > 0 ? { x: delta.x / dt, y: delta.y / dt, z: delta.z / dt } : velocityKmS;
    observer = reanchor(keepOutsideBodies(moveBy(observer, delta), date), date);
    const abs = absolutePositionKm(observer, date);
    solar.update(date, abs);
    asteroids.update(date, abs);
    satellites.update(date);
    satelliteField.update(sub(heliocentricPositionKm('Earth', date), abs));
    cometField.update(date, abs);
    warpView.update(date, abs, nowMs / 1000);

    // いる恒星系。その恒星系の天体を登録し、宇宙の部屋（他のプレイヤーの宇宙船。要件 F2）も恒星系ごとに分ける
    if (nowMs - lastRoomCheck > ROOM_CHECK_MS) {
      lastRoomCheck = nowMs;
      const system = systemAt(abs).system;
      systems.enter(system);
      // 近くの小さな小惑星（200 万 km 以内の近い順 8 個）を、球の天体として一覧に入れる
      const near =
        system === SYSTEM_SOL && asteroids.chunks.length > 0
          ? findNearbyAsteroids(asteroids.chunks, abs, date, 2e6, 8).filter((a) => !largeAsteroidNumbers.has(a.number))
          : [];
      const nextIds = new Set(near.map((a) => `A${a.number}`));
      // 基準にしている小惑星は外さない（外すと位置が分からなくなる）
      const drop = [...shownSmallAsteroids].filter((id) => !nextIds.has(id) && id !== observer.anchor);
      if (drop.length > 0) unregisterBodies(drop);
      const add = near.filter((a) => !shownSmallAsteroids.has(`A${a.number}`)).map(smallAsteroidBody);
      if (add.length > 0) registerBodies(add);
      drop.forEach((id) => shownSmallAsteroids.delete(id));
      add.forEach((b) => shownSmallAsteroids.add(b.id));
      // 近くの人工衛星（3,000 km 以内の近い順 8 機）も、模型の天体として一覧に入れる
      const fromEarth = sub(abs, heliocentricPositionKm('Earth', date));
      const nearSat = system === SYSTEM_SOL ? satellites.nearby(fromEarth, 3_000, 8) : [];
      const nextSat = new Set(nearSat.map((i) => `N${satellites.records[i].id}`));
      const dropSat = [...shownSatellites].filter((id) => !nextSat.has(id) && id !== observer.anchor);
      if (dropSat.length > 0) unregisterBodies(dropSat);
      const addSat = nearSat.filter((i) => !shownSatellites.has(`N${satellites.records[i].id}`)).map((i) => satellites.body(i));
      if (addSat.length > 0) registerBodies(addSat);
      dropSat.forEach((id) => shownSatellites.delete(id));
      addSat.forEach((b) => shownSatellites.add(b.id));
      // 太陽の近くの彗星（尾が出る）と、自分の近くの彗星
      const nextComets = system === SYSTEM_SOL ? activeComets(comets, date, abs, COMET_NEAR_KM, MAX_ACTIVE_COMETS) : [];
      const nextCometIds = new Set(nextComets.map((c) => c.code));
      const dropComets = [...shownComets].filter((id) => !nextCometIds.has(id) && id !== observer.anchor);
      if (dropComets.length > 0) unregisterBodies(dropComets);
      const addComets = nextComets.filter((c) => !shownComets.has(c.code)).map(cometBody);
      if (addComets.length > 0) registerBodies(addComets);
      dropComets.forEach((id) => shownComets.delete(id));
      addComets.forEach((b) => shownComets.add(b.id));
      // 親の惑星の近くでは、仮符号の衛星も一覧に入れる
      const nextProv = [...provisionalMoons.values()].filter(
        (b) => system === SYSTEM_SOL && b.parent !== null && length(sub(heliocentricPositionKm(b.parent, date), abs)) < PROVISIONAL_MOON_RANGE_KM,
      );
      const nextProvIds = new Set(nextProv.map((b) => b.id));
      const dropProv = [...shownProvisional].filter((id) => !nextProvIds.has(id) && id !== observer.anchor);
      if (dropProv.length > 0) unregisterBodies(dropProv);
      const addProv = nextProv.filter((b) => !shownProvisional.has(b.id));
      if (addProv.length > 0) registerBodies(addProv);
      dropProv.forEach((id) => shownProvisional.delete(id));
      addProv.forEach((b) => shownProvisional.add(b.id));
      if (online) link.setRoom(system);
    }
    if (online) {
      if (nowMs - lastSend > 1000 / SHIP_SEND_HZ) {
        lastSend = nowMs;
        const q = controls.orientation;
        link.send({ ...observer, velocityKmS, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } }, myDesign);
      }
    }
    const others = shipSmoother.update(link.ships, date, dt);
    shipView.update(others, abs);

    const shownHull = myDesign.hull;
    chase.pose(controls.orientation, hullLengthKm(shownHull), camera.position, camera.quaternion);
    const q = controls.orientation;
    shipView.setOwn(chase.mode !== 'first', { v: SHIP_DESIGN_VERSION, hull: shownHull }, link.hue ?? 200, { x: q.x, y: q.y, z: q.z, w: q.w });
    starCamera.quaternion.copy(camera.quaternion);

    // チャットの吹き出しを、船の少し上に置く。自分の船は、一人称のときは画面の下の方に出す
    camera.updateMatrixWorld();
    const w = window.innerWidth;
    const h = window.innerHeight;
    bubbles.update(nowMs, (id) => {
      let rel: { x: number; y: number; z: number };
      let size: number;
      if (id === SELF_BUBBLE) {
        if (chase.mode === 'first') return { x: w / 2, y: h * 0.72 };
        rel = { x: 0, y: 0, z: 0 };
        size = hullLengthKm(shownHull);
      } else {
        const o = others.find((x) => x.id === id);
        if (!o) return null;
        rel = sub(o.positionKm, abs);
        size = hullLengthKm((o.design ?? defaultDesignFor(o.id)).hull);
      }
      const up = new THREE.Vector3(0, size * 0.8, 0).applyQuaternion(camera.quaternion);
      projected.set(rel.x + up.x, rel.y + up.y, rel.z + up.z).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2) return null;
      return { x: ((projected.x + 1) / 2) * w, y: ((1 - projected.y) / 2) * h };
    });
    starCamera.position.set(abs.x / KM_PER_PC, abs.y / KM_PER_PC, abs.z / KM_PER_PC);
    galaxy.update({ x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC });
    clusterView.update({ x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC }, nowMs);
    nebulaView.update({ x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC }, nowMs);
    constellationView.update({ x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC });

    info.updateMarker(w, h, false);

    renderer.clear();
    renderer.render(starScene, starCamera);
    renderer.clearDepth();
    renderer.render(solar.scene, camera);
    if (photoRequested) {
      photoRequested = false;
      capturePhoto(date);
    }

    if (nowMs - lastHud > HUD_INTERVAL_MS) {
      lastHud = nowMs;
      if (hudStore.get().overlay === 'map' && nowMs - lastMapUpdate > 1000) {
        lastMapUpdate = nowMs;
        updateMapPoints();
      }
      {
        // 自分のワープホールのそばでは、下のワープホールのボタンが消すボタンになる
        const here = findWarpHere(date, abs);
        const prev = hudStore.get().warpHere;
        if (prev?.id !== here?.id) hudStore.set({ warpHere: here ? { id: here.id, code: here.code } : null });
      }
      const radarRangeKm = hudStore.get().radarRangeKm;
      const bodies = allBodies();
      const bodyIds = new Set(bodies.map((b) => b.id));
      const targets: RadarTarget[] = [
        // 天体が多いので、半径 200 km 以上か、1,000 万 km（レーダーの範囲が狭ければ、その範囲）より近い天体だけを出す
        // 探査機は小さいが、どこにいても探せるように出す
        ...bodies
          .map((b) => ({
            kind: 'body' as const,
            layer: radarLayerOfBody(b.kind),
            id: b.id,
            label: b.nameJa,
            positionKm: heliocentricPositionKm(b.id, date),
            r: b.radiusKm,
            craft: b.kind === 'spacecraft',
          }))
          .filter((t) => t.craft || t.r >= 200 || length(sub(t.positionKm, abs)) < (t.id.startsWith('N') ? 2_000 : Math.min(1e7, radarRangeKm)))
          .map(({ r: _r, craft: _c, ...t }) => t),
        // 近くのほかの恒星（情報のカードで選べる 8 個。いる恒星系の恒星は、天体として上で出している）
        ...info
          .nearStars()
          .filter((t) => !bodyIds.has(t.key))
          .map((t) => ({ kind: 'star' as const, id: t.key, label: t.name, positionKm: t.positionKm })),
        ...others.map((o) => ({ kind: 'ship' as const, id: o.id, label: '', positionKm: o.positionKm })),
        // レーダーは狭いので、住所の恒星系から後ろだけを出す（例：SOL-3-0-001）
        ...warps.filter((w) => findBody(w.anchor) !== null).map((w) => ({
          kind: 'warp' as const,
          id: w.id,
          label: w.code.split('-').slice(2).join('-'),
          positionKm: warpPositionKm(w, date),
        })),
      ];
      const inCluster = clusterAt(clusters, { x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC });
      {
        const f = new THREE.Vector3();
        camera.getWorldDirection(f);
        info.updateHud(nowMs, abs, date, observer.anchor, inCluster, { x: f.x, y: f.y, z: f.z }, false);
        // 照準の先の星座（線を出しているときだけ）。明るくして、名前を照準の下に出す
        const aimedConstellation = constellationView.aim({ x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC }, { x: f.x, y: f.y, z: f.z });
        const aimName = aimedConstellation?.nameJa ?? null;
        if (hudStore.get().aimConstellation !== aimName) hudStore.set({ aimConstellation: aimName });
      }
      hudStore.set({
        date,
        // 太陽系の外では、太陽ではなく、いる恒星系の恒星からの高さを出す
        ...(() => {
          const ref =
            observer.anchor === 'Sun' && systems.currentSystem !== SYSTEM_SOL ? starBodyId(systems.currentSystem) : observer.anchor;
          const info = findBody(ref) ?? bodyInfo('Sun');
          return {
            anchorName: info.name ?? info.id,
            altitudeKm: length(sub(abs, heliocentricPositionKm(info.id, date))) - info.radiusKm,
          };
        })(),
        speedKmS: controls.speedKmS,
        nearbyShips: online ? (link.connected ? others.length : null) : null,
        chatReady: online && link.connected,
        fromEarthKm: sub(abs, heliocentricPositionKm('Earth', date)),
        region: inCluster ? `${inCluster.kind === 'globular' ? 'Globular cluster' : 'Open cluster'}: ${inCluster.name}` : null,
        radar: radarBlips(abs, controls.orientation, targets, radarRange(radarRangeKm)),
        // 基準の天体が分からないワープホール（読み込み前の星の惑星など）は、まだ出さない
        warps: warps.filter((w) => findBody(w.anchor) !== null).map((w) => ({
          id: w.id,
          code: w.code,
          reading: readAddress(w.code),
          distanceKm: length(sub(warpPositionKm(w, date), abs)),
          mine: w.mine,
        })),
      });
    }
  });
}

main().catch((e: unknown) => {
  console.error(e);
  hudStore.set({ status: `Failed to start: ${e instanceof Error ? e.message : String(e)}` });
});
