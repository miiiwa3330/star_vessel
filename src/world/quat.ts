/** 回転を表す四元数。three.js の Quaternion と同じ並び（x, y, z, w） */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

import type { Vec3 } from './vec';

/** q の回転を逆向きにかける（世界の向き → q で回した物から見た向き） */
export function rotateByInverse(q: Quat, v: Vec3): Vec3 {
  // 共役 q* で回す：v' = q* v q
  const x = -q.x;
  const y = -q.y;
  const z = -q.z;
  const w = q.w;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}
