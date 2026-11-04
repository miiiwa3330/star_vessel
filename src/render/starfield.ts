/**
 * 恒星を描く。星の位置は pc 単位のまま、星専用の場面（scene）に置く。
 *
 * WebGPU は点を 1 ピクセルの大きさでしか描けないので、点ではなく小さな板（Sprite）を
 * 星の数だけまとめて描く（three.js の PointsNodeMaterial の説明どおりの方法）。
 */
import * as THREE from 'three/webgpu';
import { exp, float, instancedBufferAttribute, uv } from 'three/tsl';
import { bvToRgb, starAppearance, STAR_STRIDE, type StarCatalog } from '../world/stars';

/** 板の大きさは、見せたい大きさの何倍か。ふちに向かってぼかすので、その分大きく取る */
const GLOW_SCALE = 3;

export function createStarfield(catalog: StarCatalog): THREE.Sprite {
  const { count, data } = catalog;
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const o = i * STAR_STRIDE;
    position.set([data[o], data[o + 1], data[o + 2]], i * 3);
    const { sizePx, intensity } = starAppearance(data[o + 3]);
    const [r, g, b] = bvToRgb(data[o + 4]);
    color.set([r * intensity, g * intensity, b * intensity], i * 3);
    size[i] = sizePx * GLOW_SCALE;
  }

  const material = new THREE.PointsNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: false,
  });
  material.positionNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(position, 3), 'vec3');
  material.sizeNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(size, 1), 'float');
  material.colorNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(color, 3), 'vec3');
  // 板の中心から外へ向かって、なめらかに暗くする
  const d = uv().sub(0.5).length().mul(2);
  material.opacityNode = exp(d.mul(d).mul(float(-8)));

  const sprite = new THREE.Sprite(material);
  sprite.count = count;
  sprite.frustumCulled = false;
  return sprite;
}
