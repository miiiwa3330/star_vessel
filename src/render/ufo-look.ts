/**
 * タイトル画面の UFO の見せ方（斜め上から見る角度・光）と、その見た目を 1 枚の絵にする仕組み（2026-11-21）。
 * タイトル画面で船を選ぶ列（src/top/ufo-layer.ts）と、ローディング画面の UFO（src/loading-screen.ts）が同じ見た目になるように、ここにまとめた。
 * ローディング画面は three.js を読まずに出すので、ここで描いた絵（PNG の data URL）を使う
 */
import * as THREE from 'three/webgpu';
import { createShipModel, type ShipShape } from './ship-models';

/** 船を斜め上から見る角度（ラジアン） */
export const UFO_TILT = 0.42;
/** 船の向き（縦の軸のまわり。ラジアン） */
export const UFO_YAW = -0.6;

/** タイトル画面の UFO の光（全体を明るく・右上から・左後ろの水色） */
export function addUfoLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 3, 2.5);
  const rim = new THREE.DirectionalLight(0x74e6ff, 1.2);
  rim.position.set(-3, 1, -2);
  scene.add(key, rim);
}

/** 線形の明るさ（0〜1）を、画面の明るさ（sRGB）に */
const toSrgb = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * 船 shape の UFO を、タイトル画面と同じ角度・光で描いて、PNG の data URL にする（背景は透明）。
 * renderer は、そのページで使っている three.js の描画（新しく作らない）。描けなければ null
 */
export async function snapshotUfo(renderer: THREE.WebGPURenderer, shape: ShipShape, width = 480, height = 360): Promise<string | null> {
  const scene = new THREE.Scene();
  addUfoLights(scene);
  const model = createShipModel(shape);
  const pivot = new THREE.Group();
  pivot.rotation.y = UFO_YAW;
  pivot.add(model.group);
  const wrap = new THREE.Group();
  wrap.rotation.x = UFO_TILT;
  wrap.add(pivot);
  // 直径 1 にそろえる
  wrap.scale.setScalar(1 / model.lengthKm);
  scene.add(wrap);
  const fov = 30;
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 40);
  // 船の形（ドームの高さは船ごとに違う）が、絵に収まる距離。真ん中に置く（あとで、描いた船のまわりだけを切り出す）
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  wrap.position.sub(center);
  const size = box.getSize(new THREE.Vector3());
  const halfTan = Math.tan((fov * Math.PI) / 360);
  const fill = 0.8;
  // 手前のふちが近づく分だけ、少し離す（奥行きをそのまま足すと、平たい船が小さくなりすぎる）
  const dist = Math.max(size.y / 2 / fill / halfTan, size.x / 2 / fill / halfTan / camera.aspect) + size.z * 0.12;
  camera.position.set(0, 0, dist);
  const target = new THREE.RenderTarget(width, height, { samples: 4, type: THREE.UnsignedByteType });
  const prevTarget = renderer.getRenderTarget();
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)) as Uint8Array;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(width, height);
    // WebGL は下の行から、WebGPU は上の行から並ぶ
    const bottomUp = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend !== true;
    for (let y = 0; y < height; y++) {
      const src = (bottomUp ? height - 1 - y : y) * width * 4;
      const dst = y * width * 4;
      for (let x = 0; x < width * 4; x += 4) {
        const a = px[src + x + 3] / 255;
        img.data[dst + x + 3] = px[src + x + 3];
        if (a <= 0) continue;
        // 透明な背景の上に描いたので、色は透明度を掛けた値。割り戻してから、画面の明るさにする
        for (let k = 0; k < 3; k++) img.data[dst + x + k] = Math.round(255 * toSrgb(Math.min(1, px[src + x + k] / 255 / a)));
      }
    }
    ctx.putImageData(img, 0, 0);
    // 描いた船のまわりだけを切り出す（船ごとに形が違っても、絵いっぱいに収まるように）
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (img.data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
    const cx = Math.max(0, minX - pad);
    const cy = Math.max(0, minY - pad);
    const cw = Math.min(width, maxX + pad + 1) - cx;
    const ch = Math.min(height, maxY + pad + 1) - cy;
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d')?.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');
  } catch (e) {
    console.warn('UFO の絵を作れなかった', e);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    return null;
  } finally {
    target.dispose();
    model.dispose();
  }
}
