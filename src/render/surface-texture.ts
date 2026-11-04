/**
 * 自動で描いた模様（src/world/surface.ts）を three.js の画像にする。
 */
import * as THREE from 'three/webgpu';
import { flipRows, paintRing, paintSurface, type Rgb, type RingZone, type SurfaceImage, type SurfaceLook } from '../world/surface';

export function imageToTexture(img: SurfaceImage): THREE.DataTexture {
  // DataTexture は 1 行目が v=0（下）になる
  const t = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export const surfaceTexture = (look: SurfaceLook, seed: number, width = 512, height = 256): THREE.DataTexture =>
  imageToTexture(flipRows(paintSurface(look, seed, width, height)));

/** 環の画像（左が内側のふち、右が外側のふち） */
export function ringTexture(zones: readonly RingZone[], color: Rgb, seed: number): THREE.DataTexture {
  const map = imageToTexture(paintRing(zones, color, seed));
  map.wrapS = THREE.ClampToEdgeWrapping;
  return map;
}

/** 環の板。内側のふちから外側のふちへ、画像の左から右が並ぶように UV を付け直す */
export function createRingMesh(zones: readonly RingZone[], material: THREE.Material): THREE.Mesh {
  const inner = Math.min(...zones.map((z) => z.innerKm));
  const outer = Math.max(...zones.map((z) => z.outerKm));
  const geometry = new THREE.RingGeometry(inner, outer, 256, 1);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  // RingGeometry は XY 面にあるので、球の赤道の面（XZ 面。北極が +Y）に寝かせる
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ring';
  return mesh;
}
