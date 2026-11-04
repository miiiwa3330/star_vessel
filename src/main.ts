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
import { defaultDesignFor, HULLS, SHIP_DESIGN_VERSION, type ShipDesign } from './world/ship-design';
import { StampBubbles } from './ui/stamp-bubbles';
import { STAMP_LOG_SIZE, stampText } from './world/stamps';
import { AsteroidField, type AsteroidFile } from './render/asteroid-field';
import { REQUIRED_TEXTURES, TEXTURE_FILES } from './render/body-looks';
import { WarpView } from './render/warp-view';
import { ShipView } from './render/ship-view';
import { GalaxyView } from './render/galaxy-view';
import { galactoToEqjPc } from './world/galaxy';
import { Hud } from './ui/Hud';
import { hudActions, hudStore, showNotice } from './ui/hud-store';
import { worldNow } from './world/clock';
import { keepOutsideBodies } from './world/collision';
import { absolutePositionKm, moveBy, reanchor, startObserver } from './world/observer';
import { radarBlips, type RadarTarget } from './world/radar';
import { SHIP_SEND_HZ } from './world/ship-schema';
import { predictShip, shipPositionKm } from './world/ships';
import { allBodies, bodyFixedToEqj, bodyInfo, findBody, majorGmKm3s2, registerBodies, unregisterBodies, type BodyInfo, heliocentricPositionKm, setBodyResolver } from './world/solar-system';
import { decodeExoplanets } from './world/exoplanet-data';
import { largeAsteroidBodies, moonBodies, smallAsteroidBody, type LargeAsteroid, type MoonRecord } from './world/small-bodies';
import { findAsteroidByNumber, findNearbyAsteroids } from './world/asteroid-search';
import { SatelliteCatalog, type SatelliteRecord } from './world/satellites';
import { SatelliteField } from './render/satellite-field';
import { ClusterView } from './render/cluster-view';
import { decodeCompact, type CompactObject } from './world/compact-objects';
import { clusterAt, clusterLabel, decodeClusters, type Cluster } from './world/clusters';
import { StarSystems } from './world/star-systems';
import { starBodyId } from './world/planets';
import { createExtraStarfield } from './render/starfield';
import { decodeStars, STAR_STRIDE } from './world/stars';
import { nearestSystem, readAddress, setAddressNameLookup, SYSTEM_SOL } from './world/address';
import { KM_PER_AU, KM_PER_PC } from './world/units';
import { add, length, mulVec, normalize, scale, sub } from './world/vec';
import { arriveAt, planWarpHere, warpPositionKm } from './world/warp';
import { MAX_WARPS_PER_PLAYER, type WarpHole } from './world/warp-schema';

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
  const starCamera = new THREE.PerspectiveCamera(FOV, 1, 1e-6, 1e7);
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
  const [textures, starsBin, exoplanetsJson] = await Promise.all([
    Promise.all(textureEntries),
    fetch('/data/stars.bin').then((r) => {
      if (!r.ok) throw new Error('星のデータ（/data/stars.bin）が読めない。npm run stars で作る');
      return r.arrayBuffer();
    }),
    fetch('/data/exoplanets.json').then((r) => {
      if (!r.ok) throw new Error('系外惑星のデータ（/data/exoplanets.json）が読めない。npm run exoplanets で作る');
      return r.json();
    }),
  ]);
  // 太陽系の衛星と、大きな小惑星・準惑星（要件 F20・F21）。読めなくても宇宙は見られるようにする
  let asteroidFiles: AsteroidFile[] = [];
  const largeAsteroidNumbers = new Set<number>();
  await Promise.all([
    fetch('/data/moons.json')
      .then((r) => r.json())
      .then((d: { moons: MoonRecord[] }) => registerBodies(moonBodies(d.moons, { gm: majorGmKm3s2 }))),
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
  starScene.add(createStarfield(stars).sprite);
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
  const systems = new StarSystems(stars.data, realSystems, compactObjects);
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

  // 一覧に無い天体：遠くの恒星系の天体、光の点として描いている小さな小惑星（A＋番号）や人工衛星（N＋番号）
  const smallAsteroidCache = new Map<string, BodyInfo | null>();
  setBodyResolver((id) => {
    const exo = systems.findBody(id);
    if (exo) return exo;
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
  /** いる場所の恒星系と腕（本物の星・系外惑星のデータの星・自動で作った星のうち、いちばん近い星） */
  const systemAt = (posKm: { x: number; y: number; z: number }) =>
    nearestSystem(posKm, stars.data, STAR_STRIDE, [...galaxy.localStars, ...extraStars]);
  solar.scene.add(asteroids.group);
  solar.scene.add(satelliteField.sprite);
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

  // スタンプ（要件 F6）。届いたら、送った人の船の上に吹き出しを出し、画面の隅の履歴にも残す
  const bubbles = new StampBubbles(document.getElementById('ui')!);
  let stampKey = 0;
  link.onStamp = ({ from, hue, k }) => {
    const mine = from === link.selfId;
    const text = stampText(k);
    bubbles.show(mine ? SELF_BUBBLE : from, text, hue, performance.now());
    const log = [{ key: ++stampKey, hue, text, mine }, ...hudStore.get().stampLog].slice(0, STAMP_LOG_SIZE);
    hudStore.set({ stampLog: log });
  };
  hudActions.sendStamp = (id) => {
    if (!link.sendStamp(id)) showNotice('宇宙の部屋につながっていないため、スタンプを送れません', 4000);
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
    // 自分の宇宙船の設計。まだ決めていなければ、作る画面を出す
    const saved = await shipApi.get();
    hudStore.set({ shipReady: true });
    if (saved) myDesign = saved;
    else hudStore.set({ shipBuilder: { hull: myDesign.hull, firstTime: true, saving: false } });
  } catch (e) {
    console.error(e);
    hudStore.set({ status: 'サーバーにつながらないため、ワープホールは使えません' });
  }

  let observer = startObserver(worldNow());
  const controls = new FlightControls(canvas);

  // 視点（要件 F28）と自分の宇宙船（要件 F27）
  const chase = new ChaseCamera();
  /** 宇宙船を作る画面を開いている間に、船を見せるためのカメラ（ゆっくり回る） */
  const previewCam = new ChaseCamera();
  previewCam.mode = 'third';
  previewCam.pitch = 0.2;
  previewCam.distanceFactor = 2.4;
  previewCam.aimBelow = 0.35;
  controls.onOrbit = (dx, dy) => {
    if (chase.mode === 'third') chase.orbit(dx, dy);
  };
  controls.onZoom = (steps) => {
    if (chase.mode === 'third') chase.zoom(steps);
  };
  controls.onToggleView = () => hudActions.toggleView();
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
  hudActions.openShipBuilder = () => {
    hudStore.set({ shipBuilder: { hull: myDesign.hull, firstTime: false, saving: false } });
  };
  hudActions.previewHull = (hull) => {
    const b = hudStore.get().shipBuilder;
    if (b) hudStore.set({ shipBuilder: { ...b, hull } });
  };
  const saveDesign = async (design: ShipDesign, notice: boolean) => {
    const b = hudStore.get().shipBuilder;
    if (b) hudStore.set({ shipBuilder: { ...b, saving: true } });
    try {
      await shipApi.save(design);
      myDesign = design;
      hudStore.set({ shipBuilder: null });
      if (notice) showNotice(`宇宙船を ${HULLS[design.hull].nameJa} にしました`);
    } catch (e) {
      console.error(e);
      if (b) hudStore.set({ shipBuilder: { ...b, saving: false } });
      showNotice('宇宙船を保存できませんでした。少し待ってからもう一度試してください', 5000);
    }
  };
  hudActions.saveShip = () => {
    const b = hudStore.get().shipBuilder;
    if (b) void saveDesign({ v: SHIP_DESIGN_VERSION, hull: b.hull }, true);
  };
  hudActions.closeShipBuilder = () => {
    const b = hudStore.get().shipBuilder;
    // 初めての画面を閉じたら、いまの船（自動で決めた船）を保存して、次から聞かない
    if (b?.firstTime) void saveDesign(myDesign, false);
    else hudStore.set({ shipBuilder: null });
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
    camera.updateProjectionMatrix();
    starCamera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const describeError = (e: unknown) =>
    e instanceof WarpApiError && e.kind === 'limit'
      ? `ワープホールを置けるのは ${MAX_WARPS_PER_PLAYER} 個までです。一覧で自分のものを消すと、また置けます`
      : 'うまくいきませんでした。少し待ってからもう一度試してください';
  hudActions.placeWarp = async () => {
    const placement = planWarpHere(observer, controls.forward(), worldNow(), systemAt);
    try {
      const w = await warpApi.place(placement);
      setWarps([...warps, w]);
      showNotice(`ワープホール ${w.code} を置きました`, 4000);
    } catch (e) {
      console.error(e);
      showNotice(describeError(e), 5000);
    }
  };
  hudActions.changeSpeed = (steps) => controls.changeSpeed(steps, true);
  hudActions.refreshWarps = () => {
    refreshWarps().catch((e: unknown) => console.error(e));
  };
  hudActions.warpTo = (id) => {
    const w = warps.find((x) => x.id === id);
    if (!w) return;
    observer = arriveAt(w);
    lastRoomCheck = -Infinity;
    // 輪の正面に出て、輪の方を向く
    controls.lookAt({ x: -w.facing.x, y: -w.facing.y, z: -w.facing.z }, controls.up());
    showNotice(`${w.code} へワープしました`);
  };
  hudActions.removeWarp = async (id) => {
    const w = warps.find((x) => x.id === id && x.mine);
    if (!w) return;
    try {
      await warpApi.remove(w.id);
      setWarps(warps.filter((x) => x.id !== w.id));
      showNotice(`ワープホール ${w.code} を消しました`);
    } catch (e) {
      console.error(e);
      showNotice(describeError(e), 5000);
    }
  };

  // 開発サーバーのときだけ：画面の確かめのために、好きな場所へ瞬間移動できる（本番のビルドには入らない）
  if (import.meta.env.DEV) {
    const devTools = {
      /** 太陽中心の EQJ（pc）の場所へ行き、lookAtPc の方を向く */
      teleportPc(p: { x: number; y: number; z: number }, lookAtPc = { x: 0, y: 0, z: 0 }) {
        observer = reanchor({ anchor: 'Sun', offsetKm: { x: p.x * KM_PER_PC, y: p.y * KM_PER_PC, z: p.z * KM_PER_PC } }, worldNow());
        lastRoomCheck = -Infinity;
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
      if (online) link.setRoom(system);
    }
    if (online) {
      if (nowMs - lastSend > 1000 / SHIP_SEND_HZ) {
        lastSend = nowMs;
        const q = controls.orientation;
        link.send({ ...observer, velocityKmS, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } }, myDesign);
      }
    }
    const serverNow = link.serverNow();
    const others = link.ships.map((snap) => ({ id: snap.id, hue: snap.hue, state: predictShip(snap, serverNow), design: snap.d }));
    shipView.update(others, date, abs);

    // 視点：宇宙船を作る画面を開いている間は、選んでいる船をゆっくり回して見せる
    const builder = hudStore.get().shipBuilder;
    const shownHull = builder?.hull ?? myDesign.hull;
    const cam = builder ? previewCam : chase;
    if (builder) previewCam.yaw += dt * 0.5;
    cam.pose(controls.orientation, hullLengthKm(shownHull), camera.position, camera.quaternion);
    const q = controls.orientation;
    shipView.setOwn(cam.mode === 'third', { v: SHIP_DESIGN_VERSION, hull: shownHull }, link.hue ?? 200, { x: q.x, y: q.y, z: q.z, w: q.w });
    starCamera.quaternion.copy(camera.quaternion);

    // スタンプの吹き出しを、船の少し上に置く。自分の船は、一人称のときは画面の下の方に出す
    camera.updateMatrixWorld();
    const w = window.innerWidth;
    const h = window.innerHeight;
    bubbles.update(nowMs, (id) => {
      let rel: { x: number; y: number; z: number };
      let size: number;
      if (id === SELF_BUBBLE) {
        if (cam.mode === 'first') return { x: w / 2, y: h * 0.72 };
        rel = { x: 0, y: 0, z: 0 };
        size = hullLengthKm(shownHull);
      } else {
        const o = others.find((x) => x.id === id);
        if (!o) return null;
        rel = sub(shipPositionKm(o.state, date), abs);
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

    renderer.clear();
    renderer.render(starScene, starCamera);
    renderer.clearDepth();
    renderer.render(solar.scene, camera);

    if (nowMs - lastHud > HUD_INTERVAL_MS) {
      lastHud = nowMs;
      const targets: RadarTarget[] = [
        // 天体が多いので、半径 200 km 以上か、1,000 万 km より近い天体だけを出す
        ...allBodies()
          .map((b) => ({ kind: 'body' as const, id: b.id, label: b.nameJa, positionKm: heliocentricPositionKm(b.id, date), r: b.radiusKm }))
          .filter((t) => t.r >= 200 || length(sub(t.positionKm, abs)) < (t.id.startsWith('N') ? 2_000 : 1e7))
          .map(({ r: _r, ...t }) => t),
        ...others.map((o) => ({ kind: 'ship' as const, id: o.id, label: '', positionKm: shipPositionKm(o.state, date) })),
        // レーダーは狭いので、住所の恒星系から後ろだけを出す（例：SOL-3-0-001）
        ...warps.map((w) => ({
          kind: 'warp' as const,
          id: w.id,
          label: w.code.split('-').slice(2).join('-'),
          positionKm: warpPositionKm(w, date),
        })),
      ];
      hudStore.set({
        date,
        // 太陽系の外では、太陽ではなく、いる恒星系の恒星からの高さを出す
        ...(() => {
          const ref =
            observer.anchor === 'Sun' && systems.currentSystem !== SYSTEM_SOL ? starBodyId(systems.currentSystem) : observer.anchor;
          const info = findBody(ref) ?? bodyInfo('Sun');
          return {
            anchorName: info.nameJa,
            altitudeKm: length(sub(abs, heliocentricPositionKm(info.id, date))) - info.radiusKm,
          };
        })(),
        speedKmS: controls.speedKmS,
        nearbyShips: online ? (link.connected ? others.length : null) : null,
        stampReady: online && link.connected,
        region: (() => {
          const c = clusterAt(clusters, { x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC });
          return c ? `${c.kind === 'globular' ? '球状星団' : '散開星団'}：${clusterLabel(c)}` : null;
        })(),
        radar: radarBlips(abs, controls.orientation, targets),
        warps: warps.map((w) => ({
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
  hudStore.set({ status: `起動に失敗しました：${e instanceof Error ? e.message : String(e)}` });
});
