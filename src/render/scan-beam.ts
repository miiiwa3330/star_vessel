/**
 * スキャンの光（2026-11-22）：UFO から緑のレーザーが出て、天体の表面を上から下へなぞる。
 * 同じ日（オーナーの指示）に、デジタル感を出す形に作り直した。はじめは 8bit（3 px のマス・ディザ・1 行ずつ飛ぶ線）にしたが、
 * 「やりすぎ。32bit に」とのことで、細かく・なめらかにした（画面の 1 px の格子にそろえた、細かいデジタルの質感）：
 * - 扇：UFO から表面の横の弧（src/world/scan.ts の scanArc）へ広がる光。なめらかな濃淡に、1 px おきの細い走査線。
 *   UFO から天体へ、データが流れるように明るい縞がなめらかに進む
 * - 線：表面をなぞる明るい芯と、そのまわりのやわらかい光（上下へ薄れる）。芯は 2 px のマスの境目を少し暗くして、細かい LED の粒に。
 *   動きはほぼなめらか（3 秒で 90 段＝ 30 コマ／秒）
 * - 読み取った所：線が通ったあと（見えている面の上から線まで）に、2 px 間隔の細かいドットの格子を残す。線に近いほど明るく、古いほど暗い（なめらかに）
 * - 火花：線が表面に当たる所に、小さな四角い光。UFO の出口にも光る
 * 場面の座標は、自分（船）が原点の km（ほかの描画と同じ）。自分の画面だけに描く
 */
import * as THREE from 'three/webgpu';
import { floor, fract, instancedBufferAttribute, max, mod, screenCoordinate, smoothstep, step, time, uniform, vec3, vertexColor } from 'three/tsl';
import { scanArc } from '../world/scan';
import { length, sub, type Vec3 } from '../world/vec';

/** 弧の点の数 */
const ARC_POINTS = 64;
/** 読み取った所の行の数 */
const CAP_ROWS = 24;
/** 線が上から下へ進む段の数（3 秒で 90 段。ほぼなめらかだが、少しだけデジタルに刻む） */
const SCAN_STEPS = 90;
/** 画素の格子の大きさ（CSS の px）。走査線・ドット・LED の粒の細かさ */
const CELL_CSS_PX = 1;
/** 線の芯の太さ（画面で上下に何 px ずつ）と、まわりの光の太さ */
const CORE_HALF_PX = 1.5;
const GLOW_HALF_PX = 7;
/** 火花の数と大きさ（CSS の px） */
const SPARKS = 12;
const SPARK_PX = 2.5;
/** 光の緑（加算なので、赤・青を少なくして、明るい面の上でも白っぽくならないように） */
const GREEN = { r: 0.08, g: 1, b: 0.24 };

/** 決まった乱数（火花の位置） */
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class ScanBeam {
  readonly group = new THREE.Group();
  /** 端末の画素の比（main.ts が入れる。格子の大きさを CSS の px にそろえる） */
  pixelRatio = 1;
  private readonly cell = uniform(CELL_CSS_PX);
  private readonly sparkSize = uniform(SPARK_PX);
  private readonly flicker = uniform(1);
  private readonly fan: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly cap: THREE.Mesh;
  private readonly sparks: THREE.Sprite;
  private readonly fanPos = new Float32Array((ARC_POINTS + 1) * 3);
  private readonly corePos = new Float32Array(2 * ARC_POINTS * 3);
  private readonly glowPos = new Float32Array(3 * ARC_POINTS * 3);
  private readonly capPos = new Float32Array(CAP_ROWS * ARC_POINTS * 3);
  private readonly capColor = new Float32Array(CAP_ROWS * ARC_POINTS * 3);
  private readonly sparkPos = new Float32Array((SPARKS + 1) * 3);
  private readonly sparkPosAttr = new THREE.InstancedBufferAttribute(this.sparkPos, 3);
  private readonly materials: THREE.Material[] = [];

  constructor() {
    const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
    // 画面の画素の格子（マス）
    const c = floor(screenCoordinate.xy.div(this.cell));
    const scanline = mod(c.y, 2).mul(0.35).add(0.65);
    const green = vec3(GREEN.r, GREEN.g, GREEN.b);

    // 扇：頂点の色の r が明るさ（UFO のそばは淡い）、g が UFO からの割合（0〜1。流れる縞に使う）
    const fanGeo = new THREE.BufferGeometry();
    fanGeo.setAttribute('position', new THREE.BufferAttribute(this.fanPos, 3).setUsage(THREE.DynamicDrawUsage));
    const fanColor = new Float32Array((ARC_POINTS + 1) * 3);
    fanColor.set([0.07, 0, 0], 0);
    for (let k = 1; k <= ARC_POINTS; k++) fanColor.set([0.5, 1, 0], k * 3);
    fanGeo.setAttribute('color', new THREE.BufferAttribute(fanColor, 3));
    const fanIndex: number[] = [];
    for (let k = 1; k < ARC_POINTS; k++) fanIndex.push(0, k, k + 1);
    fanGeo.setIndex(fanIndex);
    const fanMat = new THREE.MeshBasicNodeMaterial({ ...common });
    {
      const vc = vertexColor();
      // UFO から天体へ流れる、やわらかい縞
      const f = fract(vc.y.mul(4).sub(time.mul(1.6)));
      const pulse = smoothstep(0.6, 0.85, f).mul(smoothstep(1, 0.88, f));
      fanMat.colorNode = green.mul(vc.x.add(pulse.mul(vc.x).mul(0.9))).mul(scanline).mul(this.flicker);
    }
    this.fan = new THREE.Mesh(fanGeo, fanMat);

    // 線の芯：上の弧と下の弧をつなぐ帯。2 px のマスの境目を少し暗くして、細かい LED の粒に
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(this.corePos, 3).setUsage(THREE.DynamicDrawUsage));
    coreGeo.setIndex(ladder(1, ARC_POINTS));
    const coreMat = new THREE.MeshBasicNodeMaterial({ ...common });
    {
      const led = floor(screenCoordinate.x.div(this.cell.mul(2)));
      const gap = step(1, mod(screenCoordinate.x.div(this.cell), 2));
      coreMat.colorNode = vec3(0.4, 1.7, 0.55).mul(gap.mul(0.25).add(0.75)).mul(mod(led, 7).equal(0).select(1.25, 1)).mul(this.flicker);
    }
    this.core = new THREE.Mesh(coreGeo, coreMat);

    // 線のまわりの光：3 本の弧（上の端・芯・下の端）。頂点の色の r で、芯から上下へ薄れる
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    const glowColor = new Float32Array(3 * ARC_POINTS * 3);
    for (let k = 0; k < ARC_POINTS; k++) glowColor.set([1, 0, 0], (ARC_POINTS + k) * 3);
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowColor, 3));
    glowGeo.setIndex(ladder(2, ARC_POINTS, true));
    const glowMat = new THREE.MeshBasicNodeMaterial({ ...common });
    glowMat.colorNode = green.mul(vertexColor().x.pow(1.6)).mul(0.45).mul(this.flicker);
    this.glow = new THREE.Mesh(glowGeo, glowMat);

    // 読み取った所：行ごとの明るさ（頂点の色の r）で、2 px 間隔の細かいドット
    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.BufferAttribute(this.capPos, 3).setUsage(THREE.DynamicDrawUsage));
    capGeo.setAttribute('color', new THREE.BufferAttribute(this.capColor, 3).setUsage(THREE.DynamicDrawUsage));
    capGeo.setIndex(ladder(CAP_ROWS - 1, ARC_POINTS, true));
    const capMat = new THREE.MeshBasicNodeMaterial({ ...common });
    {
      const dot = step(mod(c.x, 2), 0.5).mul(step(mod(c.y, 2), 0.5));
      capMat.colorNode = green.mul(dot.mul(0.8).add(0.06)).mul(max(vertexColor().x, 0)).mul(0.55).mul(this.flicker);
    }
    this.cap = new THREE.Mesh(capGeo, capMat);

    // 火花：小さな四角い光。0 番は UFO の出口
    this.sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
    const sparkMat = new THREE.PointsNodeMaterial({ ...common, sizeAttenuation: false });
    sparkMat.positionNode = instancedBufferAttribute(this.sparkPosAttr, 'vec3');
    sparkMat.colorNode = vec3(0.6, 1.5, 0.7).mul(this.flicker);
    sparkMat.sizeNode = this.sparkSize;
    this.sparks = new THREE.Sprite(sparkMat);
    this.sparks.count = SPARKS + 1;

    this.materials.push(fanMat, coreMat, glowMat, capMat, sparkMat);
    for (const m of [this.cap, this.fan, this.glow, this.core, this.sparks]) {
      m.frustumCulled = false;
      m.renderOrder = 10;
      this.group.add(m);
    }
    this.group.visible = false;
    this.group.name = 'scan-beam';
  }

  /** 隠す（スキャンしていないとき） */
  hide(): void {
    this.group.visible = false;
  }

  /**
   * 毎フレーム：origin は UFO の位置、center は天体の中心（どちらも場面の座標）、up は上の向き（スキャンを始めたときの画面の上）、
   * progress は 0（上の端）〜1（下の端）、nowMs はちらつきと火花のため、pxPerRad は画面の 1 ラジアンの画素の数（CSS の px）
   */
  show(origin: Vec3, center: Vec3, radiusKm: number, up: Vec3, progress: number, nowMs: number, pxPerRad: number): void {
    // 少しだけ刻む（30 コマ／秒）
    const step = Math.min(SCAN_STEPS - 1, Math.floor(progress * SCAN_STEPS));
    const p = (step + 0.5) / SCAN_STEPS;
    const arc = scanArc(origin, center, radiusKm, up, p, ARC_POINTS);
    if (arc.length === 0) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.cell.value = CELL_CSS_PX * this.pixelRatio;
    this.sparkSize.value = SPARK_PX * this.pixelRatio;

    // 扇
    this.fanPos.set([origin.x, origin.y, origin.z], 0);
    arc.forEach((q, k) => this.fanPos.set([q.x, q.y, q.z], (k + 1) * 3));
    this.fan.geometry.attributes.position.needsUpdate = true;

    // 線の太さは画面の px で決める（遠くても細くなりすぎず、近くても太くなりすぎない）。進み具合の 1 は、見えている円の高さ（約 2R）
    const kmPerPx = length(sub(center, origin)) / Math.max(pxPerRad, 1);
    const toP = (px: number) => (px * kmPerPx) / (2 * radiusKm);
    const at = (q: number) => {
      const a = scanArc(origin, center, radiusKm, up, Math.min(1, Math.max(0, q)), ARC_POINTS);
      return a.length === ARC_POINTS ? a : arc;
    };
    const coreHalf = Math.max(0.002, toP(CORE_HALF_PX));
    const glowHalf = Math.max(0.008, toP(GLOW_HALF_PX));
    const coreTop = at(p - coreHalf);
    const coreBottom = at(p + coreHalf);
    for (let k = 0; k < ARC_POINTS; k++) {
      this.corePos.set([coreTop[k].x, coreTop[k].y, coreTop[k].z], k * 6);
      this.corePos.set([coreBottom[k].x, coreBottom[k].y, coreBottom[k].z], k * 6 + 3);
    }
    this.core.geometry.attributes.position.needsUpdate = true;
    const rows = [at(p - glowHalf), arc, at(p + glowHalf)];
    rows.forEach((r, row) => r.forEach((q, k) => this.glowPos.set([q.x, q.y, q.z], (row * ARC_POINTS + k) * 3)));
    this.glow.geometry.attributes.position.needsUpdate = true;

    // 読み取った所：見えている面の上の端から、線のまわりの光の上の端まで
    const capEnd = Math.max(0, p - glowHalf * 0.5);
    for (let row = 0; row < CAP_ROWS; row++) {
      const t = row / (CAP_ROWS - 1);
      const pts = at(capEnd * t);
      // 線に近い行ほど明るい（残光）
      const g = 0.12 + 0.88 * t * t * t;
      for (let k = 0; k < ARC_POINTS; k++) {
        const i = (row * ARC_POINTS + k) * 3;
        this.capPos.set([pts[k].x, pts[k].y, pts[k].z], i);
        this.capColor.set([g, 0, 0], i);
      }
    }
    this.cap.geometry.attributes.position.needsUpdate = true;
    this.cap.geometry.attributes.color.needsUpdate = true;

    // 火花：線の上の別々の場所に、短い間隔で入れ替わる（ときどき消えて、またたく）
    this.sparkPos.set([origin.x, origin.y, origin.z], 0);
    const blink = Math.floor(nowMs / 50);
    for (let s = 1; s <= SPARKS; s++) {
      const k = Math.floor(hash(blink * 31 + s * 7) * ARC_POINTS);
      const off = hash(blink * 13 + s) < 0.3;
      const q = arc[Math.min(ARC_POINTS - 1, k)];
      // 消す火花は、UFO の出口に重ねる（数を変えずに済む）
      this.sparkPos.set(off ? [origin.x, origin.y, origin.z] : [q.x, q.y, q.z], s * 3);
    }
    this.sparkPosAttr.needsUpdate = true;

    // ちらつきは、なめらかに少しだけ
    this.flicker.value = 0.9 + 0.1 * Math.sin(nowMs / 41) * Math.sin(nowMs / 97);
  }

  dispose(): void {
    for (const m of [this.fan, this.core, this.glow, this.cap]) m.geometry.dispose();
    this.materials.forEach((m) => m.dispose());
  }
}

/** はしご（2 本の弧をつなぐ帯）の三角形。rows 本の帯を縦に重ねる。capRows：頂点が行ごとに並んでいる */
function ladder(rows: number, n: number, capRows = false): number[] {
  const out: number[] = [];
  if (!capRows) {
    // 頂点は (上 k, 下 k) の順に交互
    for (let k = 0; k < n - 1; k++) {
      const a = k * 2;
      out.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return out;
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < n - 1; k++) {
      const a = r * n + k;
      const b = a + n;
      out.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return out;
}
