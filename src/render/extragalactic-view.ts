/**
 * 天の川銀河の外の銀河を描く（docs/tech/galaxies.md）。星を描く場面（pc 単位）に置く。
 * 1 つの銀河を、たくさんの小さな光の点の集まりで描く（本物の大きさ・向き。星の並びは種類に合わせて作ったもの）。
 * 明るさは、銀河の絶対等級と距離からの見かけの等級で決める。星の見え方（要件 F34）の限界より暗い銀河は見えない。
 */
import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, exp, float, instancedBufferAttribute, log, max, min, smoothstep, uniform, uv } from 'three/tsl';
import { galaxyPointCount, galaxyPoints, type Galaxy } from '../world/galaxies';
import { bvToRgb } from '../world/stars';
import { starLimitMag } from './star-sprites';

const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const POINT_SCALE = COARSE ? 0.3 : 1;

export class ExtragalacticView {
  readonly group = new THREE.Group();
  private readonly pxPerRadian = uniform(700);

  constructor(galaxies: readonly Galaxy[]) {
    const counts = galaxies.map((g) => galaxyPointCount(g, POINT_SCALE));
    const total = counts.reduce((a, b) => a + b, 0);
    const pos = new Float32Array(total * 3);
    const color = new Float32Array(total * 3);
    const absMag = new Float32Array(total);
    const radius = new Float32Array(total);
    const n = new Float32Array(total);
    let o = 0;
    galaxies.forEach((g, gi) => {
      const p = galaxyPoints(g, counts[gi]);
      pos.set(p.positions, o * 3);
      for (let i = 0; i < p.count; i++) {
        color.set(bvToRgb(p.colorIndex[i]), (o + i) * 3);
      }
      absMag.fill(g.absB, o, o + p.count);
      radius.fill(g.radiusPc, o, o + p.count);
      n.fill(p.count, o, o + p.count);
      o += p.count;
    });
    const position = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(pos, 3), 'vec3');
    const M = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(absMag, 1), 'float');
    const rPc = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(radius, 1), 'float');
    const count = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(n, 1), 'float');
    const dist = max(position.sub(cameraPosition).length(), float(1));
    // 銀河全体の見かけの等級
    const mag = M.add(log(dist.div(10)).mul(5 / Math.LN10));
    // 銀河の見かけの面積（ピクセル。1 ピクセルより小さくしない）に対して、点が足りない分は点を明るく、余る分は暗くする
    const rPx = rPc.div(dist).mul(this.pxPerRadian);
    const area = max(rPx.mul(rPx).mul(3.14), float(1));
    const surface = clamp(exp(mag.sub(4).mul(-0.4 * 0.45 * Math.LN10)), 0.02, 1);
    const k = min(area.div(count).mul(surface).mul(0.1), float(0.4));
    const fade = float(1).sub(smoothstep(starLimitMag.sub(1.5), starLimitMag, mag));
    const m = new THREE.PointsNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    m.positionNode = position;
    m.sizeNode = float(3.5);
    m.colorNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(color, 3), 'vec3').mul(k).mul(fade);
    const d = uv().sub(0.5).length().mul(2);
    m.opacityNode = exp(d.mul(d).mul(-14));
    const s = new THREE.Sprite(m);
    s.count = total;
    s.frustumCulled = false;
    this.group.add(s);
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.pxPerRadian.value = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
  }
}
