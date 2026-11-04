import * as THREE from 'three/webgpu';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { FlightControls } from './controls/flight';
import { ensureSession } from './net/auth';
import { WarpApiError, warpApi } from './net/warp-repository';
import { createStarfield } from './render/starfield';
import { SolarSystemView } from './render/solar-system-view';
import { WarpView } from './render/warp-view';
import { Hud } from './ui/Hud';
import { hudActions, hudStore, showNotice } from './ui/hud-store';
import { worldNow } from './world/clock';
import { keepOutsideBodies } from './world/collision';
import { absolutePositionKm, moveBy, reanchor, startObserver } from './world/observer';
import { radarBlips, type RadarTarget } from './world/radar';
import { BODIES, bodyInfo, heliocentricPositionKm } from './world/solar-system';
import { decodeStars, STAR_STRIDE } from './world/stars';
import { nearestSystem, readAddress } from './world/address';
import { KM_PER_PC } from './world/units';
import { length, sub } from './world/vec';
import { arriveAt, planWarpHere, warpPositionKm } from './world/warp';
import { MAX_WARPS_PER_PLAYER, type WarpHole } from './world/warp-schema';

const FOV = 60;
const HUD_INTERVAL_MS = 100;

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

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1e11);
  const starCamera = new THREE.PerspectiveCamera(FOV, 1, 1e-6, 1e7);
  const starScene = new THREE.Scene();

  const loader = new THREE.TextureLoader();
  const loadTexture = async (url: string) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const [earthMap, moonMap, starsBin] = await Promise.all([
    loadTexture('/textures/2k_earth_daymap.jpg'),
    loadTexture('/textures/2k_moon.jpg'),
    fetch('/data/stars.bin').then((r) => {
      if (!r.ok) throw new Error('星のデータ（/data/stars.bin）が読めない。npm run stars で作る');
      return r.arrayBuffer();
    }),
  ]);
  const solar = new SolarSystemView({ Earth: earthMap, Moon: moonMap });
  const stars = decodeStars(starsBin);
  starScene.add(createStarfield(stars));
  const warpView = new WarpView();
  solar.scene.add(warpView.group);

  // ワープホール（要件 F9）。全員で共有する。サーバーにつながらなくても、宇宙は見られるようにする
  let warps: WarpHole[] = [];
  const setWarps = (next: WarpHole[]) => {
    warps = next;
    warpView.setWarps(warps);
  };
  const refreshWarps = async () => setWarps(await warpApi.list());
  try {
    await ensureSession();
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
    const placement = planWarpHere(observer, controls.forward(), worldNow(), (pos) =>
      nearestSystem(pos, stars.data, STAR_STRIDE),
    );
    try {
      const w = await warpApi.place(placement);
      setWarps([...warps, w]);
      showNotice(`ワープホール ${w.code} を置きました`, 4000);
    } catch (e) {
      console.error(e);
      showNotice(describeError(e), 5000);
    }
  };
  hudActions.refreshWarps = () => {
    refreshWarps().catch((e: unknown) => console.error(e));
  };
  hudActions.warpTo = (id) => {
    const w = warps.find((x) => x.id === id);
    if (!w) return;
    observer = arriveAt(w);
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

  let last = performance.now();
  let lastHud = 0;
  hudStore.set({ status: null });

  renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const date = worldNow();

    observer = reanchor(keepOutsideBodies(moveBy(observer, controls.update(dt)), date), date);
    const abs = absolutePositionKm(observer, date);
    solar.update(date, abs);
    warpView.update(date, abs, nowMs / 1000);

    camera.quaternion.copy(controls.orientation);
    starCamera.quaternion.copy(controls.orientation);
    starCamera.position.set(abs.x / KM_PER_PC, abs.y / KM_PER_PC, abs.z / KM_PER_PC);

    renderer.clear();
    renderer.render(starScene, starCamera);
    renderer.clearDepth();
    renderer.render(solar.scene, camera);

    if (nowMs - lastHud > HUD_INTERVAL_MS) {
      lastHud = nowMs;
      const targets: RadarTarget[] = [
        ...BODIES.map((b) => ({ kind: 'body' as const, id: b.id, label: b.nameJa, positionKm: heliocentricPositionKm(b.id, date) })),
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
        anchor: observer.anchor,
        altitudeKm: length(observer.offsetKm) - bodyInfo(observer.anchor).radiusKm,
        speedKmS: controls.speedKmS,
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
