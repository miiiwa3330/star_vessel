import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three/webgpu';
import { ChaseCamera, HEIGHT_RATIO } from './chase-camera';

describe('三人称のカメラ', () => {
  const ship = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // 船の前（−Z）が −X を向く
  const pos = new Vector3();
  const q = new Quaternion();

  it('最初は三人称（後ろから）', () => {
    expect(new ChaseCamera().mode).toBe('third');
  });

  it('一人称ではカメラは船そのもの', () => {
    const c = new ChaseCamera();
    c.mode = 'first';
    c.pose(ship, 0.04, pos, q);
    expect(pos.length()).toBe(0);
    expect(q.angleTo(ship)).toBeCloseTo(0, 9);
  });

  it('三人称では船の後ろの上にいて、船と同じ向きを見る（照準は船の上あたり）', () => {
    const c = new ChaseCamera();
    c.pose(ship, 0.04, pos, q);
    const back = new Vector3(0, 0, 1).applyQuaternion(ship);
    // 後ろへ 船の長さ × 4.5、上へ その HEIGHT_RATIO 倍
    expect(pos.dot(back)).toBeCloseTo(0.04 * 4.5, 9);
    expect(pos.y).toBeCloseTo(0.04 * 4.5 * HEIGHT_RATIO, 9);
    // 向きは船と同じ（照準の先へまっすぐ進む）
    expect(q.angleTo(ship)).toBeCloseTo(0, 9);
    // 船（原点）は、画面の真ん中より下に映る
    const toShip = pos.clone().negate().applyQuaternion(q.clone().invert());
    expect(toShip.z).toBeLessThan(0);
    expect(toShip.y).toBeLessThan(0);
    expect(toShip.x).toBeCloseTo(0, 9);
  });

  it('切り替えは 後ろから → 前から → 一人称 → 後ろから。前からは船の前にいて、船の方を向く', () => {
    const c = new ChaseCamera();
    expect([c.toggle(), c.toggle(), c.toggle()]).toEqual(['front', 'first', 'third']);
    c.toggle();
    c.pose(ship, 0.04, pos, q);
    const front = new Vector3(0, 0, -1).applyQuaternion(ship);
    expect(pos.clone().normalize().dot(front)).toBeGreaterThan(0.9);
    const look = new Vector3(0, 0, -1).applyQuaternion(q);
    expect(look.dot(front)).toBeCloseTo(-1, 9);
  });

  it('回り込むと横から見る。距離は上限と下限の間', () => {
    const c = new ChaseCamera();
    c.orbit(-Math.PI / 2 / 0.006, 0);
    c.pose(new Quaternion(), 0.04, pos, q);
    expect(pos.x).toBeGreaterThan(0.1);
    for (let i = 0; i < 100; i++) c.zoom(1);
    c.pose(new Quaternion(), 0.04, pos, q);
    expect(pos.length()).toBeCloseTo(0.04 * 1.5 * Math.hypot(1, HEIGHT_RATIO), 6);
  });
});
