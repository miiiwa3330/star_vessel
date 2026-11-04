import * as THREE from 'three/webgpu';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { FlightControls } from './controls/flight';
import { createStarfield } from './render/starfield';
import { SolarSystemView } from './render/solar-system-view';
import { Hud } from './ui/Hud';
import { hudStore } from './ui/hud-store';
import { worldNow } from './world/clock';
import { absolutePositionKm, moveBy, reanchor, startObserver } from './world/observer';
import { bodyInfo, heliocentricPositionKm } from './world/solar-system';
import { decodeStars } from './world/stars';
import { KM_PER_PC } from './world/units';
import { length, sub } from './world/vec';

const FOV = 60;
const HUD_INTERVAL_MS = 250;

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
  starScene.add(createStarfield(decodeStars(starsBin)));

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

  let last = performance.now();
  let lastHud = 0;
  hudStore.set({ status: null });

  renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const date = worldNow();

    observer = reanchor(moveBy(observer, controls.update(dt)), date);
    const abs = absolutePositionKm(observer, date);
    solar.update(date, abs);

    camera.quaternion.copy(controls.orientation);
    starCamera.quaternion.copy(controls.orientation);
    starCamera.position.set(abs.x / KM_PER_PC, abs.y / KM_PER_PC, abs.z / KM_PER_PC);

    renderer.clear();
    renderer.render(starScene, starCamera);
    renderer.clearDepth();
    renderer.render(solar.scene, camera);

    if (nowMs - lastHud > HUD_INTERVAL_MS) {
      lastHud = nowMs;
      hudStore.set({
        date,
        anchor: observer.anchor,
        altitudeKm: length(observer.offsetKm) - bodyInfo(observer.anchor).radiusKm,
        speedKmS: controls.speedKmS,
      });
    }
  });
}

main().catch((e: unknown) => {
  console.error(e);
  hudStore.set({ status: `起動に失敗しました：${e instanceof Error ? e.message : String(e)}` });
});
