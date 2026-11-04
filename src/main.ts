import * as THREE from 'three/webgpu';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { FlightControls } from './controls/flight';
import { ensureSession } from './net/auth';
import { WarpApiError, warpApi } from './net/warp-repository';
import { SpaceLink } from './net/space-link';
import { createStarfield } from './render/starfield';
import { SolarSystemView } from './render/solar-system-view';
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
import { allBodies, bodyInfo, findBody, heliocentricPositionKm, setBodyResolver } from './world/solar-system';
import { decodeExoplanets } from './world/exoplanet-data';
import { StarSystems } from './world/star-systems';
import { starBodyId } from './world/planets';
import { createExtraStarfield } from './render/starfield';
import { decodeStars, STAR_STRIDE } from './world/stars';
import { nearestSystem, readAddress, setAddressNameLookup, SYSTEM_SOL } from './world/address';
import { KM_PER_AU, KM_PER_PC } from './world/units';
import { add, length, normalize, scale, sub } from './world/vec';
import { arriveAt, planWarpHere, warpPositionKm } from './world/warp';
import { MAX_WARPS_PER_PLAYER, type WarpHole } from './world/warp-schema';

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
  const solar = new SolarSystemView(Object.fromEntries(textures.filter((t) => t !== null)));
  const stars = decodeStars(starsBin);
  starScene.add(createStarfield(stars).sprite);
  // 系外惑星（要件 F22）。いる恒星系の恒星と惑星を、天体の一覧に入れ替えて登録する
  const realSystems = decodeExoplanets(exoplanetsJson);
  const systems = new StarSystems(stars.data, realSystems);
  setBodyResolver((id) => systems.findBody(id));
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
  /** いる場所の恒星系と腕（本物の星・系外惑星のデータの星・自動で作った星のうち、いちばん近い星） */
  const systemAt = (posKm: { x: number; y: number; z: number }) =>
    nearestSystem(posKm, stars.data, STAR_STRIDE, [...galaxy.localStars, ...extraStars]);
  const warpView = new WarpView();
  solar.scene.add(warpView.group);
  const shipView = new ShipView();
  solar.scene.add(shipView.group);
  const link = new SpaceLink();

  // ワープホール（要件 F9）。全員で共有する。サーバーにつながらなくても、宇宙は見られるようにする
  let warps: WarpHole[] = [];
  const setWarps = (next: WarpHole[]) => {
    warps = next;
    warpView.setWarps(warps);
  };
  const refreshWarps = async () => setWarps(await warpApi.list());
  let online = false;
  try {
    await ensureSession();
    online = true;
    await refreshWarps();
    hudStore.set({ warpsReady: true });
  } catch (e) {
    console.error(e);
    hudStore.set({ status: 'サーバーにつながらないため、ワープホールは使えません' });
  }

  let observer = startObserver(worldNow());
  const controls = new FlightControls(canvas);
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
      teleportBody(id: string, distanceKm?: number) {
        const d = worldNow();
        const info = bodyInfo(id);
        const center = heliocentricPositionKm(id, d);
        // 恒星の光が当たっている側から見る
        const toLight = center.x === 0 && center.y === 0 && center.z === 0 ? { x: 1, y: 0, z: 0 } : scale(center, -1 / length(center));
        const p = add(center, scale(toLight, distanceKm ?? info.radiusKm * 4));
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
    warpView.update(date, abs, nowMs / 1000);

    // いる恒星系。その恒星系の天体を登録し、宇宙の部屋（他のプレイヤーの宇宙船。要件 F2）も恒星系ごとに分ける
    if (nowMs - lastRoomCheck > ROOM_CHECK_MS) {
      lastRoomCheck = nowMs;
      const system = systemAt(abs).system;
      systems.enter(system);
      if (online) link.setRoom(system);
    }
    if (online) {
      if (nowMs - lastSend > 1000 / SHIP_SEND_HZ) {
        lastSend = nowMs;
        const q = controls.orientation;
        link.send({ ...observer, velocityKmS, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } });
      }
    }
    const serverNow = link.serverNow();
    const others = link.ships.map((snap) => ({ id: snap.id, hue: snap.hue, state: predictShip(snap, serverNow) }));
    shipView.update(others, date, abs);

    camera.quaternion.copy(controls.orientation);
    starCamera.quaternion.copy(controls.orientation);
    starCamera.position.set(abs.x / KM_PER_PC, abs.y / KM_PER_PC, abs.z / KM_PER_PC);
    galaxy.update({ x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC });

    renderer.clear();
    renderer.render(starScene, starCamera);
    renderer.clearDepth();
    renderer.render(solar.scene, camera);

    if (nowMs - lastHud > HUD_INTERVAL_MS) {
      lastHud = nowMs;
      const targets: RadarTarget[] = [
        ...allBodies().map((b) => ({ kind: 'body' as const, id: b.id, label: b.nameJa, positionKm: heliocentricPositionKm(b.id, date) })),
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
