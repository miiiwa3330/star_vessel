/**
 * three.js の球と、天体に固定した座標のつなぎ方。
 *
 * three.js の SphereGeometry は、画像の中央（経度 0 度）が +X、北極が +Y、東経 90 度が −Z になる
 * （node_modules/three/src/geometries/SphereGeometry.js で確かめた）。
 * 天体に固定した座標は x：本初子午線・y：東経 90 度・z：北極（src/world/solar-system.ts）。
 */
import { Matrix4 } from 'three/webgpu';
import { mulMat, type Mat3 } from '../world/vec';

/** 球の座標 → 天体に固定した座標 */
export const SPHERE_TO_BODY_FIXED: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];

/** 球の座標 → EQJ の回転行列 */
export const sphereToEqj = (bodyFixedToEqj: Mat3): Mat3 => mulMat(bodyFixedToEqj, SPHERE_TO_BODY_FIXED);

export function toMatrix4(m: Mat3, out = new Matrix4()): Matrix4 {
  return out.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
}
