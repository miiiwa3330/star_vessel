import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { createShipModel } from '../render/ship-models';
import { HULLS, type HullType } from '../world/ship-design';

/**
 * 選んでいる宇宙船を、ゆっくり回して見せる（要件 F27・F48）。世界の画面と同じ形（createShipModel）を使う。
 * three.js を読み込むので、準備画面を開いたときに、遅れて読み込む（ReadyScreen の lazy）。
 * 描けない環境（WebGPU も WebGL2 も使えない）では何も出さない。船の名前と説明は、選ぶボタンに出ている
 */
export default function ShipPreview({ hull, hue }: { hull: HullType; hue: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 描く入れ物は 1 回だけ作り、船体と色が変わったら、中の船だけ入れ替える
  const stateRef = useRef<{ setShip: (hull: HullType, hue: number) => void } | null>(null);
  const latest = useRef({ hull, hue });
  latest.current = { hull, hue };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;
    let current: ReturnType<typeof createShipModel> | null = null;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.75, 3.2);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 3, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x74e6ff, 1.2);
    rim.position.set(-3, 1, -2);
    scene.add(rim);
    const pivot = new THREE.Group();
    scene.add(pivot);

    const setShip = (h: HullType, hu: number) => {
      if (current) {
        pivot.remove(current.group);
        current.dispose();
      }
      current = createShipModel(h, hu);
      // モデルは km の単位で、直径が 0.03 km ほど。見やすい大きさ（直径 1.6）に拡大する
      current.group.scale.setScalar(1.6 / HULLS[h].lengthKm);
      pivot.add(current.group);
    };
    stateRef.current = { setShip };

    const resize = () => {
      if (!renderer) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    (async () => {
      try {
        const r = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
        await r.init();
        if (disposed) {
          r.dispose();
          return;
        }
        renderer = r;
        r.setClearColor(0x000000, 0);
        resize();
        setShip(latest.current.hull, latest.current.hue);
        let last = performance.now();
        r.setAnimationLoop((now: number) => {
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          if (!reduce.matches) pivot.rotation.y += dt * 0.5;
          r.render(scene, camera);
        });
        pivot.rotation.set(0.25, -0.6, 0);
      } catch (e) {
        console.warn('宇宙船のプレビューを描けない', e);
      }
    })();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      disposed = true;
      ro.disconnect();
      stateRef.current = null;
      renderer?.setAnimationLoop(null);
      current?.dispose();
      renderer?.dispose();
    };
  }, []);

  useEffect(() => {
    stateRef.current?.setShip(hull, hue);
  }, [hull, hue]);

  return <canvas ref={canvasRef} className="top-ship-canvas" aria-hidden="true" />;
}
