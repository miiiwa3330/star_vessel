/**
 * タイトル画面の背景の地球（要件 F48）。世界の画面と同じ画像（昼・夜の灯り・雲）と同じ向き（IAU の自転）で、
 * いまの時刻の地球を描く。太陽の向きも本物なので、昼と夜の境目は、いまの本物の位置にある。
 * 世界の描画（src/render/solar-system-view.ts）の部品を再利用し、天体の一覧（registry）は使わない。
 */
import * as THREE from 'three/webgpu';
import { dot, max, normalWorld, smoothstep, texture, vec3 } from 'three/tsl';
import { createAtmosphereMesh, createBodyUniforms } from '../render/body-effects';
import { sphereToEqj, toMatrix4 } from '../render/orientation';
import { bodyFixedToEqj, bodyInfo, heliocentricPositionKm } from '../world/solar-system';
import type { EarthShipsSnapshot } from '../world/earth-ships-schema';
import { add, length, normalize, scale, type Vec3 } from '../world/vec';
import { alphaForCenter, cross3, distanceForRadius, dot3, posedView, subjectView } from './earth-camera';
import { ShipLights } from './ship-lights';
import { ShipTracks } from './ship-tracks';

/** 画面の縦の画角（度） */
const FOV = 42;
/** カメラから地球の中心までの距離（km）。地球の半径の約 1.7 倍（高度約 4,600 km） */
const DISTANCE_KM = 11_000;
/** 地球の縁のいちばん高いところの高さ（画面の中心が 0、下の端が −1）。画面の下から約 1/4 */
const LIMB_NDC_Y = -0.42;
/** 船がいないときの見え方：太陽の向きから東へ回す角度の、ゆっくりした揺れ（度）と、その 1 周の秒数。静止画に見えないように、ごくわずかに動かす */
const AZIMUTH_BASE_DEG = 72;
const AZIMUTH_SWING_DEG = 4;
const SWING_PERIOD_S = 160;
const ELEVATION = 0.32;
const NORTH: Vec3 = { x: 0, y: 0, z: 1 };
/**
 * スクロールで、地球の下半分が画面の上に来る見え方へ動かす（下の詳細の画面）。
 * 地球の中心を、画面の上の端のすぐ上（高さ 1.05）に置き、地球の見かけの半径を画面の高さの 0.9 にする
 * （下の縁が、画面の上から約 4 割の高さに来る）。カメラは地球から離れ、見る向きは上へ振る
 */
const DETAIL_CENTER_NDC_Y = 1.05;
const DETAIL_RADIUS_NDC = 0.9;
/** 現れるとき（読み込めてから）、地球が画面の下から上がってくる時間（ms）と、最初に下へずらす量（画面の高さの単位） */
const INTRO_MS = 2800;
const INTRO_SHIFT_NDC = 1.8;
/** 大気の光の強さ（世界の画面に対する割合） */
const ATMOSPHERE_GAIN = 0.45;
/** 船を見せるとき：船を映す高さ（画面の中心が 0、上が +1）と、太陽の当たり方の目標（カメラの位置と太陽の向きの内積）。境目と夜の灯りが見える値 */
const SUBJECT_NDC_Y = 0.12;
const SUN_TARGET = 0.45;
/** カメラが船を追う速さ（時定数・秒）。短すぎると船が画面に止まって見えるので、数秒の遅れを残す */
const AIM_TAU_S = 4;
/** 船が地球からこの距離（km）より遠いときは、カメラの向きを決める船にしない（遠すぎて、地球と一緒に見せられない） */
const SUBJECT_MAX_KM = 150_000;
/** 地球の表面から、これより近い船は、カメラの向きを決める船にしない */
const SUBJECT_MIN_ALT_KM = 300;
/** 船がいないときに、カメラの向きを決める仮の点の、地球の中心からの距離（km）。船がいるときと同じ作り方で見え方をそろえる */
const DEFAULT_AIM_KM = 20_000;

const TEXTURES = { day: '/textures/2k_earth_daymap.jpg', night: '/textures/2k_earth_nightmap.jpg', clouds: '/textures/2k_earth_clouds.jpg' };

export class EarthScene {
  private readonly renderer: THREE.WebGPURenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 100, 4e5);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly uniforms = createBodyUniforms();
  private readonly earth: THREE.Mesh;
  private readonly owned: { dispose(): void }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly tracks = new ShipTracks();
  private readonly lights = new ShipLights();
  private lastFrameMs = 0;
  /** カメラが見ている点（地球の中心から）。船を追うように、ゆっくり動く */
  private aim: Vec3 | null = null;
  private subjectId: string | null = null;
  private phi: number | undefined;
  /** 最初に描いた時刻（地球が下から上がってくる動きの始まり）。まだ描いていなければ 0 */
  private introStartMs = 0;
  /** 描いた最後の日時（同じ時刻なら、向きと太陽を計算し直さない） */
  private lastSecond = -1;
  private disposed = false;

  private constructor(canvas: HTMLCanvasElement, textures: Record<keyof typeof TEXTURES, THREE.Texture>) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
    const radius = bodyInfo('Earth').radiusKm;

    const geometry = new THREE.SphereGeometry(radius, 128, 64);
    const material = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    material.colorNode = texture(textures.day);
    // 夜の側だけ、街の灯りを光らせる（世界の画面と同じ）
    material.emissiveNode = texture(textures.night).xyz.mul(smoothstep(0.12, -0.12, dot(normalWorld, this.uniforms.toStar))).mul(1.4);
    this.earth = new THREE.Mesh(geometry, material);
    this.earth.matrixAutoUpdate = false;

    const cloudGeometry = new THREE.SphereGeometry(radius * 1.002, 96, 48);
    const cloudMaterial = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1, metalness: 0 });
    cloudMaterial.colorNode = vec3(1, 1, 1);
    cloudMaterial.opacityNode = texture(textures.clouds).r.mul(0.9);
    this.earth.add(new THREE.Mesh(cloudGeometry, cloudMaterial));

    const atmosphere = bodyInfo('Earth').atmosphere;
    if (atmosphere) {
      const shell = createAtmosphereMesh(radius, atmosphere, this.uniforms);
      // 世界の画面は背景が不透明なので、加算合成で足りる。ここは背景が透明（後ろに星空がある）なので、
      // 透明度を光の強さ（色のいちばん大きい成分）に合わせて足す。色は、そのまま足す（色 ≤ 透明度になる）。
      // 透明度が 1 のままだと、光の殻の外側（色が 0 のところ）が不透明な黒になり、地球のまわりに黒い帯が出る。
      // 透明度を 0 のままにすると、色が消える（後ろが透明な canvas は、色が透明度を超えられない）
      const mat = shell.material as THREE.MeshBasicNodeMaterial;
      // 世界の画面より弱くする（ここは地球が大きく映るので、世界と同じ強さだと、縁が太い帯に見える）
      const glow = (mat.colorNode as ReturnType<typeof vec3>).mul(ATMOSPHERE_GAIN);
      mat.colorNode = glow;
      mat.opacityNode = max(max(glow.x, glow.y), glow.z);
      // 殻の分割を細かくする（地球が大きく映るので、世界の画面の粗さだと、縁が角ばって見える）
      shell.geometry.dispose();
      shell.geometry = new THREE.SphereGeometry(radius * (1 + atmosphere.thickness), 192, 96);
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendSrcAlpha = THREE.OneFactor;
      mat.blendDstAlpha = THREE.OneFactor;
      this.earth.add(shell);
      this.owned.push(shell.geometry, mat);
    }

    this.scene.add(this.earth, this.sun, new THREE.AmbientLight(0xffffff, 0.04), this.lights.group);
    this.owned.push(geometry, material, cloudGeometry, cloudMaterial, ...Object.values(textures));
  }

  /** 画像を読み、描く準備をする。失敗したら例外（呼んだ側は、いまの背景のままにする） */
  static async create(canvas: HTMLCanvasElement): Promise<EarthScene> {
    const loader = new THREE.TextureLoader();
    const load = async (url: string) => {
      const t = await loader.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const [day, night, clouds] = await Promise.all([load(TEXTURES.day), load(TEXTURES.night), load(TEXTURES.clouds)]);
    const scene = new EarthScene(canvas, { day, night, clouds });
    await scene.renderer.init();
    scene.renderer.setClearColor(0x000000, 0);
    // 描くのに要る処理（シェーダーのコンパイル）を、見せる前に済ませる。済ませないと、現れる最初の動きが引っかかる
    try {
      await scene.renderer.compileAsync(scene.scene, scene.camera);
    } catch (e) {
      console.warn('地球の描画の準備に失敗。そのまま描く', e);
    }
    return scene;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed || width === 0 || height === 0) return;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** 地球のまわりの船の位置が届いたとき（receivedMs はブラウザの時計で受け取った時刻） */
  ingestShips(snapshot: EarthShipsSnapshot, receivedMs: number): void {
    this.tracks.ingest(snapshot, receivedMs);
  }

  /**
   * nowMs（世界の時刻）の地球を描く。motion が false なら、カメラの揺れ・船の追従・現れる動きを止める（「動きを減らす」の設定）。
   * scroll は、スクロールの位置（最初の画面の高さを 1 とする。0 で最初の画面、1 で詳細の画面。1 を超えた分は、地球を画面の外へ送る）
   */
  render(nowMs: number, motion: boolean, scroll = 0): void {
    if (this.disposed) return;
    if (this.introStartMs === 0) this.introStartMs = nowMs;
    const dt = this.lastFrameMs === 0 ? 0 : Math.min(0.25, Math.max(0, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    const date = new Date(nowMs);
    // 地球から太陽への向き：太陽は原点なので、地球の位置の反対向き
    const sunDir = normalize(scale(heliocentricPositionKm('Earth', date), -1));
    const second = Math.floor(nowMs / 1000);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      toMatrix4(sphereToEqj(bodyFixedToEqj('Earth', date)), this.matrix);
      this.earth.matrix.copy(this.matrix);
      this.earth.matrixWorldNeedsUpdate = true;
      this.uniforms.toStar.value.set(sunDir.x, sunDir.y, sunDir.z);
      this.sun.position.set(sunDir.x * 1e5, sunDir.y * 1e5, sunDir.z * 1e5);
    }

    const radius = bodyInfo('Earth').radiusKm;
    const ships = this.tracks.positions(nowMs, dt);
    const subject = this.pickSubject(ships, radius);
    // カメラが見る点：船がいれば、その船。いなければ、太陽に対して決まった向きの仮の点（ゆっくり揺れる）
    const swing = motion ? Math.sin((2 * Math.PI * nowMs) / 1000 / SWING_PERIOD_S) * AZIMUTH_SWING_DEG : 0;
    const target = subject ? subject.position : this.defaultAim(sunDir, AZIMUTH_BASE_DEG + 70 + swing);
    this.aim = this.followAim(this.aim, target, motion ? dt : 1e6);
    const pose = subjectView({
      aim: this.aim,
      sunDir,
      radiusKm: radius,
      distanceKm: DISTANCE_KM,
      fovDeg: FOV,
      limbNdcY: LIMB_NDC_Y,
      subjectNdcY: SUBJECT_NDC_Y,
      sunTarget: SUN_TARGET,
      phiHint: this.phi,
    });
    this.phi = pose.phi;
    // スクロール：距離を離し、地球の中心を画面の上へ送る（なめらかに始まり、なめらかに止まる）
    const p = Math.min(1, Math.max(0, scroll));
    const e = p * p * (3 - 2 * p);
    const detailDistance = distanceForRadius(radius, DETAIL_RADIUS_NDC, FOV);
    const detailAlpha = alphaForCenter(DETAIL_CENTER_NDC_Y, FOV);
    // 現れる動き：地球の中心を、最初は画面の下の外へずらし、ゆっくり元の位置へ上げる
    const introT = motion ? Math.min(1, (nowMs - this.introStartMs) / INTRO_MS) : 1;
    const introAlpha = (1 - introT) ** 3 * Math.atan(INTRO_SHIFT_NDC * Math.tan((FOV * Math.PI) / 360));
    const view = posedView({
      ...pose.basis,
      distanceKm: pose.basis.distanceKm + (detailDistance - pose.basis.distanceKm) * e,
      alpha: pose.basis.alpha + (detailAlpha - pose.basis.alpha) * e + introAlpha,
    });
    this.camera.position.set(view.position.x, view.position.y, view.position.z);
    this.camera.up.set(view.up.x, view.up.y, view.up.z);
    this.camera.lookAt(view.position.x + view.forward.x, view.position.y + view.forward.y, view.position.z + view.forward.z);
    this.lights.update(ships, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  /** カメラの向きを決める船。いまの船が残っていれば続け、いなければ、地球に近い船（ただし近すぎず遠すぎない）にする */
  private pickSubject(ships: readonly { id: string; position: Vec3; fade: number }[], radius: number): { id: string; position: Vec3 } | null {
    const ok = (s: { position: Vec3; fade: number }) => s.fade > 0.2 && length(s.position) <= SUBJECT_MAX_KM && length(s.position) >= radius + SUBJECT_MIN_ALT_KM;
    const current = ships.find((s) => s.id === this.subjectId);
    if (current && ok(current)) return current;
    let best: { id: string; position: Vec3 } | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const s of ships) {
      const d = length(s.position);
      if (ok(s) && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    this.subjectId = best?.id ?? null;
    return best;
  }

  /** 船がいないときの、見る点。太陽の向きを北のまわりに azimuthDeg 回し、少し北へ上げた向きの、DEFAULT_AIM_KM の点 */
  private defaultAim(sunDir: Vec3, azimuthDeg: number): Vec3 {
    const east0 = cross3(NORTH, sunDir);
    const east = length(east0) > 1e-6 ? normalize(east0) : { x: 1, y: 0, z: 0 };
    const az = (azimuthDeg * Math.PI) / 180;
    const dir = normalize(add(add(scale(sunDir, Math.cos(az)), scale(east, Math.sin(az))), scale(NORTH, ELEVATION)));
    return scale(dir, DEFAULT_AIM_KM);
  }

  /**
   * 見る点を、目標へ、時定数 AIM_TAU_S でなめらかに近づける。向き（単位ベクトル）と距離を別々に動かすので、
   * 反対側へ移るときも、地球の中を通らず、まわりを回る
   */
  private followAim(current: Vec3 | null, target: Vec3, dt: number): Vec3 {
    if (!current) return target;
    const k = 1 - Math.exp(-dt / AIM_TAU_S);
    const rc = length(current);
    const rt = length(target);
    const dc = scale(current, 1 / rc);
    const dtg = scale(target, 1 / rt);
    // 向きは、球の上を回して近づける（正反対のときは、北のまわりに回す）
    const cos = Math.max(-1, Math.min(1, dot3(dc, dtg)));
    const angle = Math.acos(cos);
    let dir = dtg;
    if (angle > 1e-6) {
      const axis0 = cross3(dc, dtg);
      const axis = length(axis0) > 1e-6 ? normalize(axis0) : normalize(cross3(dc, NORTH));
      const step = angle * k;
      // ロドリゲスの回転公式
      dir = normalize(add(add(scale(dc, Math.cos(step)), scale(cross3(axis, dc), Math.sin(step))), scale(axis, dot3(axis, dc) * (1 - Math.cos(step)))));
    }
    return scale(dir, rc + (rt - rc) * k);
  }

  dispose(): void {
    this.disposed = true;
    this.lights.dispose();
    this.owned.forEach((o) => o.dispose());
    this.renderer.dispose();
  }
}
