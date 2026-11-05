/**
 * 天体を描く（太陽系の天体と、いる恒星系の系外惑星・衛星）。
 *
 * 自分の船を原点に置き、天体は「自分から見た相対位置（km）」に置く。
 * 位置の引き算は倍精度（JavaScript）で済ませてから GPU に渡すので、遠くでも位置がガタつかない。
 * 天体の一覧（src/world/solar-system.ts）が変わったら、描く物を作り直す。
 * 大気・恒星の光・環の影は src/render/body-effects.ts（要件 F25）。
 */
import * as THREE from 'three/webgpu';
import { dot, exp, float, instancedBufferAttribute, mix, normalView, normalWorld, positionView, smoothstep, texture, uv, vec3 } from 'three/tsl';
import { tailLengthKm } from '../world/comets';
import {
  allBodies,
  bodiesVersion,
  bodyFixedToEqj,
  heliocentricPositionKm,
  type BodyId,
  type BodyInfo,
} from '../world/solar-system';
import { mulVec, normalize, sub, type Vec3 } from '../world/vec';
import { hashInts } from '../world/random';
import { DEFAULT_LOOK, RING_COLOR, SURFACE_LOOKS } from './body-looks';
import {
  createAtmosphereMesh,
  createBodyUniforms,
  createRingMaterial,
  createStarGlow,
  createBlackHole,
  createPulsarBeams,
  createStarMaterial,
  ringShadowedColor,
  STAR_GLOW_RADII,
  type BodyUniforms,
} from './body-effects';
import { sphereToEqj, toMatrix4 } from './orientation';
import { SurfacePainter } from './surface-painter';
import { createRingMesh, ringTexture } from './surface-texture';

export type BodyTextures = Partial<Record<BodyId, THREE.Texture>>;

/** 天体の光の点の数の上限・大きさ（ピクセル） */
const MAX_POINTS = 1024;
const POINT_SIZE_PX = 4;
/** 本物の大きさ（半径）が画面でこれ（ピクセル）より大きくなったら、点を消す */
const POINT_MAX_PX = 1.5;
/** 本物の大きさがこれ（ピクセル）より小さいときは、点も描かない（とても遠く・とても小さい） */
const POINT_MIN_PX = 1e-5;

/** 天体の名前から、模様の種を決める（同じ天体はいつも同じ模様） */
const seedOf = (id: string) => hashInts(...Array.from(id, (c) => c.charCodeAt(0)));

/** 模様ができるまでの仮の画像（灰色 1 ピクセル） */
function placeholderTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

interface Drawn {
  mesh: THREE.Mesh;
  info: BodyInfo;
  uniforms: BodyUniforms;
  glow: THREE.Sprite | null;
  /** パルサーのビーム（自転軸のまわりを回す） */
  beams: THREE.Group | null;
  /** 彗星の尾と、まわりの光（コマ） */
  tail: THREE.Mesh | null;
  coma: THREE.Sprite | null;
  /** この天体のために作った物（作り直すときに捨てる） */
  owned: { dispose(): void }[];
  removed: boolean;
}

export class SolarSystemView {
  readonly scene = new THREE.Scene();
  private readonly drawn = new Map<BodyId, Drawn>();
  /** 恒星の光。いちばん近い恒星（太陽、またはいる恒星系の恒星）に置く */
  private readonly starLight = new THREE.PointLight(0xffffff, 3, 0, 0);
  private readonly tmp = new THREE.Matrix4();
  private readonly painter = new SurfacePainter();
  private readonly axis = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly xAxis = new THREE.Vector3(1, 0, 0);
  private readonly q1 = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly q3 = new THREE.Quaternion();
  private version = -1;
  private earthClouds: THREE.Mesh | null = null;
  private readonly sunward = new THREE.Vector3();
  /** 1 ピクセルの大きさを決める値（画面の高さの半分 ÷ tan(視野の半分)） */
  private pxPerRadian = 700;
  /**
   * 天体の光の点（要件 F33）。本物の大きさが画面で POINT_MAX_PX より小さいときだけ、天体の位置に点を描く。
   * 近づいて大きくなると点は消え、本物の大きさの球（模型）だけになる
   */
  private readonly pointPos = new Float32Array(MAX_POINTS * 3);
  private readonly pointColor = new Float32Array(MAX_POINTS * 3);
  private readonly pointPosAttr = new THREE.InstancedBufferAttribute(this.pointPos, 3);
  private readonly pointColorAttr = new THREE.InstancedBufferAttribute(this.pointColor, 3);
  private readonly points: THREE.Sprite;

  constructor(private readonly textures: BodyTextures) {
    this.scene.add(this.starLight, new THREE.AmbientLight(0xffffff, 0.03));
    this.pointPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.pointColorAttr.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    m.positionNode = instancedBufferAttribute(this.pointPosAttr, 'vec3');
    m.colorNode = instancedBufferAttribute<'vec3'>(this.pointColorAttr, 'vec3');
    m.sizeNode = float(POINT_SIZE_PX);
    const d = uv().sub(0.5).length().mul(2);
    m.opacityNode = exp(d.mul(d).mul(-12));
    this.points = new THREE.Sprite(m);
    this.points.count = 0;
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.pxPerRadian = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
  }

  private create(info: BodyInfo): Drawn {
    const owned: { dispose(): void }[] = [];
    const uniforms = createBodyUniforms();
    const big = info.radiusKm > 1_000;
    const geometry = new THREE.SphereGeometry(info.radiusKm, big ? 96 : 32, big ? 48 : 16);
    owned.push(geometry);
    const d: Drawn = { mesh: null as unknown as THREE.Mesh, info, uniforms, glow: null, beams: null, tail: null, coma: null, owned, removed: false };

    let material: THREE.Material;
    if (info.compact?.kind === 'black-hole') {
      const bh = createBlackHole(info.radiusKm, !!info.compact.disk);
      owned.push(...bh.owned);
      d.mesh = bh.mesh;
      material = bh.mesh.material as THREE.Material;
      if (info.compact.disk) {
        // 遠くからも見えるよう、降着円盤の光の広がり
        d.glow = createStarGlow([1, 0.7, 0.4]);
        d.glow.scale.setScalar(info.radiusKm * (info.compact.glowRadii ?? 400));
        owned.push(d.glow.material);
        this.scene.add(d.glow);
      }
    } else if (info.kind === 'satellite' || info.kind === 'spacecraft') {
      // 人工衛星：箱の本体と、左右の太陽電池の板（見た目のための簡単な模型）
      const s = info.radiusKm * 2;
      const bodyGeo = new THREE.BoxGeometry(s * 0.25, s * 0.25, s * 0.4);
      const panelGeo = new THREE.BoxGeometry(s * 0.35, s * 0.02, s * 0.25);
      const bodyMat = new THREE.MeshStandardNodeMaterial({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.6 });
      const panelMat = new THREE.MeshStandardNodeMaterial({ color: 0x1c2a5a, roughness: 0.3, metalness: 0.4, side: THREE.DoubleSide });
      owned.push(bodyGeo, panelGeo, bodyMat, panelMat);
      d.mesh = new THREE.Mesh(bodyGeo, bodyMat);
      for (const x of [-1, 1]) {
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(x * s * 0.32, 0, 0);
        d.mesh.add(panel);
      }
      material = bodyMat;
    } else if (info.glow) {
      material = createStarMaterial(info.glow);
      d.glow = createStarGlow(info.glow);
      d.glow.scale.setScalar(info.radiusKm * STAR_GLOW_RADII * 2);
      owned.push(d.glow.material);
      this.scene.add(d.glow);
    } else {
      const given = this.textures[info.id];
      const mapNode = texture(given ?? placeholderTexture());
      const standard = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
      standard.colorNode = mapNode;
      if (!given) {
        // 模様は Worker で描き、できたら差し替える（恒星系に入ったときに画面が止まらないように）
        const look = info.surface?.look ?? SURFACE_LOOKS[info.id] ?? DEFAULT_LOOK;
        const seed = info.surface?.seed ?? seedOf(info.id);
        const size = big && info.kind !== 'exoplanet' ? [512, 256] : info.radiusKm > 300 ? [256, 128] : [128, 64];
        owned.push(mapNode.value as THREE.Texture);
        void this.painter.paint(look, seed, size[0], size[1]).then((t) => {
          if (d.removed) {
            t.dispose();
            return;
          }
          mapNode.value = t;
          owned.push(t);
        });
      }
      if (info.rings) {
        const ringMap = ringTexture(info.rings, info.ringColor ?? RING_COLOR, seedOf(info.id));
        owned.push(ringMap);
        const inner = Math.min(...info.rings.map((z) => z.innerKm));
        const outer = Math.max(...info.rings.map((z) => z.outerKm));
        standard.colorNode = ringShadowedColor(mapNode, ringMap, inner, outer, uniforms);
        const ringMaterial = createRingMaterial(ringMap, info.radiusKm, uniforms);
        owned.push(ringMaterial);
        d.mesh = new THREE.Mesh(geometry, standard);
        const ring = createRingMesh(info.rings, ringMaterial);
        owned.push(ring.geometry);
        d.mesh.add(ring);
      }
      if (info.id === 'Earth') this.decorateEarth(d, standard, owned);
      if (info.kind === 'comet') this.addCometTail(d, owned);
      material = standard;
    }
    owned.push(material);
    if (!d.mesh) d.mesh = new THREE.Mesh(geometry, material);
    const mesh = d.mesh;
    mesh.name = info.id;
    if (info.id === 'Earth' && this.earthClouds) mesh.add(this.earthClouds);
    mesh.matrixAutoUpdate = false;
    if (info.compact?.kind === 'neutron-star') {
      d.beams = createPulsarBeams(info.radiusKm);
      d.beams.traverse((o) => {
        if (o instanceof THREE.Mesh) owned.push(o.geometry, o.material as THREE.Material);
      });
      this.scene.add(d.beams);
    }
    if (info.atmosphere) {
      const atm = createAtmosphereMesh(info.radiusKm, info.atmosphere, uniforms);
      owned.push(atm.geometry, atm.material as THREE.Material);
      mesh.add(atm);
    }
    this.scene.add(mesh);
    return d;
  }

  /**
   * 地球の夜の灯りと雲（Solar System Scope の画像。NASA の観測から作られたもの）。夜の側だけ灯りを光らせる。
   * 雲はいまの天気ではなく、ある時の雲の画像を地表と一緒に回しているだけ（docs/tech/world-model.md）
   */
  private decorateEarth(d: Drawn, standard: THREE.MeshStandardNodeMaterial, owned: { dispose(): void }[]): void {
    const night = this.textures.EarthNight;
    const clouds = this.textures.EarthClouds;
    if (night) {
      const dark = smoothstep(0.12, -0.12, dot(normalWorld, d.uniforms.toStar));
      standard.emissiveNode = texture(night).xyz.mul(dark).mul(1.4);
    }
    if (clouds) {
      const geo = new THREE.SphereGeometry(d.info.radiusKm * 1.002, 96, 48);
      const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1, metalness: 0 });
      mat.colorNode = vec3(1, 1, 1);
      mat.opacityNode = texture(clouds).r.mul(0.9);
      owned.push(geo, mat);
      this.earthClouds = new THREE.Mesh(geo, mat);
      this.earthClouds.name = 'clouds';
    }
  }

  /** 彗星の尾。太陽と反対の向きに伸びる、先が細い円すい。見た目のための形（本物は塵の尾と青いイオンの尾に分かれる） */
  private addCometTail(d: Drawn, owned: { dispose(): void }[]): void {
    const geo = new THREE.ConeGeometry(0.035, 1, 24, 1, true);
    // 頂点（核のある側）を原点に、底を −Y に置く。太陽の向きを +Y にして使う
    geo.translate(0, -0.5, 0);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const viewDir = positionView.negate().normalize();
    const soft = dot(normalView, viewDir).abs().pow(2);
    const along = uv().y; // 1：核のそば、0：尾の先
    const color = mix(vec3(0.55, 0.75, 1), vec3(0.9, 0.95, 1), along);
    mat.colorNode = color.mul(soft).mul(along.pow(2.2)).mul(0.55);
    owned.push(geo, mat);
    d.tail = new THREE.Mesh(geo, mat);
    d.tail.frustumCulled = false;
    d.tail.visible = false;
    this.scene.add(d.tail);
    d.coma = createStarGlow([0.6, 0.85, 1]);
    d.coma.visible = false;
    owned.push(d.coma.material);
    this.scene.add(d.coma);
  }

  /** 天体の一覧が変わっていたら、描く物を合わせる */
  private sync(): void {
    if (this.version === bodiesVersion()) return;
    this.version = bodiesVersion();
    const now = new Map(allBodies().map((b) => [b.id, b]));
    for (const [id, d] of this.drawn) {
      if (now.get(id) === d.info) continue;
      this.scene.remove(d.mesh);
      if (d.glow) this.scene.remove(d.glow);
      if (d.beams) this.scene.remove(d.beams);
      if (d.tail) this.scene.remove(d.tail);
      if (d.coma) this.scene.remove(d.coma);
      d.removed = true;
      d.owned.forEach((o) => o.dispose());
      this.drawn.delete(id);
    }
    for (const [id, info] of now) {
      if (!this.drawn.has(id)) this.drawn.set(id, this.create(info));
    }
  }

  /** 天体の光の点を置く。恒星・ブラックホール（自分の光の広がりがある）と人工衛星（別に点で描く）は除く */
  private updatePoints(rels: Map<BodyId, Vec3>): void {
    let n = 0;
    for (const [id, d] of this.drawn) {
      if (n >= MAX_POINTS) break;
      const k = d.info.kind;
      if (k === 'star' || k === 'blackhole' || k === 'satellite') continue;
      // 彗星は光の点の群れの方で描く（src/render/comet-field.ts）
      if (k === 'comet') continue;
      const rel = rels.get(id)!;
      const dist = Math.hypot(rel.x, rel.y, rel.z);
      const px = (d.info.radiusKm / Math.max(dist, 1e-9)) * this.pxPerRadian;
      // 探査機はとても小さいが、探しに行けるよう遠くても点を残す
      if (px > POINT_MAX_PX || (px < POINT_MIN_PX && k !== 'spacecraft')) continue;
      // 小さく遠いほど暗く（1/1000 ピクセルで 0.25、1 ピクセルで 1）。近づいて球が見え始めるところで消えていく
      const b = Math.min(1, 0.25 + 0.25 * Math.max(0, Math.log10(px * 1000))) * Math.min(1, (POINT_MAX_PX - px) / 0.5);
      this.pointPos.set([rel.x, rel.y, rel.z], n * 3);
      this.pointColor.set([0.95 * b, 0.92 * b, 0.85 * b], n * 3);
      n++;
    }
    this.points.count = n;
    for (const a of [this.pointPosAttr, this.pointColorAttr]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 3);
      a.needsUpdate = true;
    }
  }

  /** date の時刻の天体を、observerKm（太陽中心・EQJ）から見た位置に置く */
  update(date: Date, observerKm: Vec3): void {
    this.sync();
    let nearestStar: Vec3 | null = null;
    let nearestGlow: readonly [number, number, number] = [1, 1, 1];
    let nearestD = Number.POSITIVE_INFINITY;
    const rels = new Map<BodyId, Vec3>();
    for (const [id, d] of this.drawn) {
      const rel = sub(heliocentricPositionKm(id, date), observerKm);
      rels.set(id, rel);
      const orient = bodyFixedToEqj(id, date);
      toMatrix4(sphereToEqj(orient), this.tmp);
      this.tmp.setPosition(rel.x, rel.y, rel.z);
      d.mesh.matrix.copy(this.tmp);
      d.mesh.matrixWorldNeedsUpdate = true;
      d.glow?.position.set(rel.x, rel.y, rel.z);
      if (d.beams && d.info.compact?.beamPeriodS) {
        // ビームは自転軸から 30 度傾いた磁極の向きに出て、自転軸のまわりを回る（見た目では 1 秒より速くしない）
        const s = d.info.spin;
        const pole = s.type === 'steady' ? s.pole : { x: 0, y: 0, z: 1 };
        this.axis.set(pole.x, pole.y, pole.z).normalize();
        this.q1.setFromUnitVectors(this.yAxis, this.axis);
        const angle = ((date.getTime() / 1000) % d.info.compact.beamPeriodS) / d.info.compact.beamPeriodS * Math.PI * 2;
        this.q2.setFromAxisAngle(this.axis, angle);
        this.q3.setFromAxisAngle(this.xAxis, Math.PI / 6);
        d.beams.quaternion.copy(this.q2).multiply(this.q1).multiply(this.q3);
        d.beams.position.set(rel.x, rel.y, rel.z);
      }
      if (d.tail && d.coma && d.info.comet) {
        const abs = heliocentricPositionKm(id, date);
        const r = Math.hypot(abs.x, abs.y, abs.z);
        const len = tailLengthKm(d.info.comet, r);
        d.tail.visible = len > 0;
        d.coma.visible = len > 0;
        if (len > 0) {
          this.sunward.set(-abs.x / r, -abs.y / r, -abs.z / r);
          this.q1.setFromUnitVectors(this.yAxis, this.sunward);
          d.tail.quaternion.copy(this.q1);
          d.tail.scale.setScalar(len);
          d.tail.position.set(rel.x, rel.y, rel.z);
          d.coma.position.set(rel.x, rel.y, rel.z);
          d.coma.scale.setScalar(len * 0.05);
        }
      }
      d.uniforms.center.value.set(rel.x, rel.y, rel.z);
      const pole = mulVec(orient, { x: 0, y: 0, z: 1 });
      d.uniforms.pole.value.set(pole.x, pole.y, pole.z);
      if (d.info.kind === 'star') {
        const dist = Math.hypot(rel.x, rel.y, rel.z);
        if (dist < nearestD) {
          nearestD = dist;
          nearestStar = rel;
          nearestGlow = d.info.glow ?? nearestGlow;
        }
      }
    }
    this.updatePoints(rels);
    if (nearestStar) {
      this.starLight.position.set(nearestStar.x, nearestStar.y, nearestStar.z);
      // 光の色は恒星の色（太陽は白に近い）。いちばん明るい成分を 1 にそろえる
      const m = Math.max(...nearestGlow);
      this.starLight.color.setRGB(nearestGlow[0] / m, nearestGlow[1] / m, nearestGlow[2] / m);
      // 大気・環の影に使う、天体から恒星への向き
      for (const [id, d] of this.drawn) {
        if (d.info.kind === 'star') continue;
        const rel = rels.get(id)!;
        const to = normalize(sub(nearestStar, rel));
        d.uniforms.toStar.value.set(to.x, to.y, to.z);
      }
    }
  }
}
