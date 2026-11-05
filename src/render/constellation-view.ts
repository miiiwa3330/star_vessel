/**
 * 星座の線を描く（要件 F40）。星を描く場面（pc 単位）に置く。線の両端は本物の星の位置なので、
 * 地球のそばからは星座の形に、遠くからは崩れた形に見える。
 * 線は GPU のふつうの線（WebGPU では太さ 1 ピクセルに決まっている）。
 * 2026-11-05：太さを選べる three.js の LineSegments2 を先に試したが、この場面の手前の面がとても近い（1e-6 pc）ためか、
 * 線が画面を横切る太い帯になり、離れると消えたのでやめた。
 * 太陽からとても遠いところでは線が 1 点に固まって見えるだけなので、消す。
 */
import * as THREE from 'three/webgpu';
import { constellationAt, type Constellation, type ConstellationSegments } from '../world/constellations';
import type { Vec3 } from '../world/vec';

/** 線の色と明るさ */
const LINE = { color: 0x7fa8ff, opacity: 0.55 };
const HILITE = { color: 0xd8e6ff, opacity: 1 };
/** 太陽からこの距離（pc）を超えると薄くし、遠い方の距離で消す */
const FADE_PC = { start: 2_000, end: 6_000 };

const material = (o: { color: number; opacity: number }) =>
  new THREE.LineBasicNodeMaterial({
    color: o.color,
    transparent: true,
    opacity: o.opacity,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

const makeLines = (positions: Float32Array, m: THREE.Material): THREE.LineSegments => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const l = new THREE.LineSegments(g, m);
  l.frustumCulled = false;
  return l;
};

export class ConstellationView {
  readonly group = new THREE.Group();
  private readonly baseMaterial = material(LINE);
  private readonly hiliteMaterial = material(HILITE);
  private hilite: THREE.LineSegments | null = null;
  private shown: Constellation | null = null;

  constructor(private readonly seg: ConstellationSegments) {
    this.group.add(makeLines(seg.positions, this.baseMaterial));
    this.group.visible = false;
  }

  get visible(): boolean {
    return this.group.visible;
  }
  set visible(v: boolean) {
    this.group.visible = v;
  }

  /** 毎フレーム：遠くでは薄くする */
  update(cameraPc: Vec3): void {
    if (!this.group.visible) return;
    const d = Math.hypot(cameraPc.x, cameraPc.y, cameraPc.z);
    const k = 1 - Math.min(1, Math.max(0, (d - FADE_PC.start) / (FADE_PC.end - FADE_PC.start)));
    this.baseMaterial.opacity = LINE.opacity * k;
    this.hiliteMaterial.opacity = HILITE.opacity * k;
    this.group.children.forEach((c) => {
      c.visible = k > 0;
    });
  }

  /** 見ている向きの先の星座を明るくして、その星座を返す。消しているときは null */
  aim(cameraPc: Vec3, forward: Vec3): Constellation | null {
    if (!this.group.visible || this.baseMaterial.opacity <= 0) {
      this.setHilite(null);
      return null;
    }
    const c = constellationAt(this.seg, cameraPc, forward);
    this.setHilite(c);
    return c;
  }

  private setHilite(c: Constellation | null): void {
    if (c === this.shown) return;
    this.shown = c;
    if (this.hilite) {
      this.group.remove(this.hilite);
      this.hilite.geometry.dispose();
      this.hilite = null;
    }
    if (!c) return;
    const r = this.seg.ranges.find((x) => x.constellation === c);
    if (!r || r.count === 0) return;
    this.hilite = makeLines(this.seg.positions.slice(r.start * 6, (r.start + r.count) * 6), this.hiliteMaterial);
    this.group.add(this.hilite);
  }
}
