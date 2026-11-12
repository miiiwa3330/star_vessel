import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three/webgpu';
import { ChaseCamera } from './chase-camera';

describe('三人称のカメラ', () => {
  const ship = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // 船の前（−Z）が −X を向く
  const pos = new Vector3();
  const q = new Quaternion();

  it('一人称ではカメラは船そのもの', () => {
    const c = new ChaseCamera();
    c.pose(ship, 0.04, pos, q);
    expect(pos.length()).toBe(0);
    expect(q.angleTo(ship)).toBeCloseTo(0, 9);
  });

  it('三人称では船の後ろの少し上にいて、船の方を向く', () => {
    const c = new ChaseCamera();
    c.toggle();
    c.pose(ship, 0.04, pos, q);
    const back = new Vector3(0, 0, 1).applyQuaternion(ship);
    expect(pos.clone().normalize().dot(back)).toBeGreaterThan(0.9);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.length()).toBeCloseTo(0.12, 6);
    const look = new Vector3(0, 0, -1).applyQuaternion(q);
    expect(look.dot(pos.clone().negate().normalize())).toBeCloseTo(1, 6);
  });

  it('切り替えは 一人称 → 後ろから → 前から → 一人称。前からは船の前にいて、船の方を向く', () => {
    const c = new ChaseCamera();
    expect([c.toggle(), c.toggle(), c.toggle()]).toEqual(['third', 'front', 'first']);
    c.toggle();
    c.toggle();
    c.pose(ship, 0.04, pos, q);
    const front = new Vector3(0, 0, -1).applyQuaternion(ship);
    expect(pos.clone().normalize().dot(front)).toBeGreaterThan(0.9);
    const look = new Vector3(0, 0, -1).applyQuaternion(q);
    expect(look.dot(pos.clone().negate().normalize())).toBeCloseTo(1, 6);
  });

  it('回り込むと横から見る。距離は上限と下限の間', () => {
    const c = new ChaseCamera();
    c.toggle();
    c.orbit(-Math.PI / 2 / 0.006, 0);
    c.pose(new Quaternion(), 0.04, pos, q);
    expect(pos.x).toBeGreaterThan(0.1);
    for (let i = 0; i < 100; i++) c.zoom(1);
    c.pose(new Quaternion(), 0.04, pos, q);
    expect(pos.length()).toBeCloseTo(0.04 * 1.5, 6);
  });
});
