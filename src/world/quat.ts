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

/** a から b へ、割合 t だけ回す（短い向きに回る）。毎フレーム少しずつ回すのに使う */
export function nlerp(a: Quat, b: Quat, t: number): Quat {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = a.x + (b.x * sign - a.x) * t;
  const y = a.y + (b.y * sign - a.y) * t;
  const z = a.z + (b.z * sign - a.z) * t;
  const w = a.w + (b.w * sign - a.w) * t;
  const l = Math.hypot(x, y, z, w) || 1;
  return { x: x / l, y: y / l, z: z / l, w: w / l };
}
