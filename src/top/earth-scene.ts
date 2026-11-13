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
import { add, length, normalize, scale, sub, type Vec3 } from '../world/vec';
import { alphaForCenter, cross3, distanceForRadius, dot3, forwardLeg, legEndCenter, limbAlpha, posedView, subjectView, type EarthCameraPose, type ViewBasis } from './earth-camera';
import { ShipLights } from './ship-lights';
import { ShipTracks } from './ship-tracks';
import type { StageView, TopStage } from './top-stage';
import { UfoLayer } from './ufo-layer';

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

/**
 * 月・火星へ飛ぶ。月は SIGN IN・SIGN UP の箱、火星はサインイン中のユーザー名の箱（2026-11-06）。
 *
 * **「月ー地球ー火星」**：3 つの天体は、いまのカメラが見ている向きの 1 本の線に並ぶ（見た目のための配置。本物の位置・向きは使わない。
 * 本物の位置を使うと、月と火星で、空に出る向きも距離も違い、動きがばらばらになるため）。移動は、いつも「前へ飛ぶ」：
 * カメラは、向きを変えず、見ている向きへ、まっすぐ進む（earth-camera.ts の forwardLeg）。いまの天体は画面の下へ消え、
 * 次の天体は、視線の先の遠くにあるので、画面の真ん中に小さな点として現れて大きくなり、最後に、遠近法だけで、
 * 地球のときと同じ構図（縁が画面の下に弧）に落ち着く。地球 → 月・火星も、月・火星 → 地球も、同じ式
 * （戻るときも前へ飛ぶので、時間を逆に再生するのではない。行き先の天体は、地球の手前の側に置き直す）。
 * 行き先の自転の向きは本物、太陽の向きは地球と同じ。
 */
/** カメラが進む距離（km。見た目のための距離で、月も火星も同じ）。遠いほど、出てくるときの点が小さい（地球が 0.2 度・月が 0.05 度ほど） */
const STAGE_DISTANCE_KM = 2_000_000;
const FLIGHT_S = 2.2;
/** 船を選ぶ画面と月の準備を始めるまでの待ち（ms。地球が現れる動きが終わってから）。火星は、押されたときに読む（ログインしている人だけが行くため） */
const PREPARE_UFO_DELAY_MS = 3600;
const PREPARE_MOON_DELAY_MS = 5200;
/** サインインしている人は、火星へ行くので、月のあとに火星も読んでおく（押してから読むと、動き出すのが遅れ、読み込みで動きが引っかかる） */
const PREPARE_MARS_DELAY_MS = 7000;
/** 行き先の天体（StageView の地球以外）。id は天体の一覧のもの */
const DESTINATIONS: Record<Exclude<StageView, 'earth'>, { id: string; texture: string }> = {
  moon: { id: 'Moon', texture: '/textures/2k_moon.jpg' },
  mars: { id: 'Mars', texture: '/textures/2k_mars.jpg' },
};
type Destination = keyof typeof DESTINATIONS;
/** 奥行きの範囲（km）。2 つの天体の間（200 万 km）と、そのさらに先まで見える。手前の近さは、天体までの距離に合わせて変える（updateDepthRange） */
const NEAR_KM = 100;
const FAR_KM = 1e7;


const TEXTURES = { day: '/textures/2k_earth_daymap.jpg', night: '/textures/2k_earth_nightmap.jpg', clouds: '/textures/2k_earth_clouds.jpg' };

export class EarthScene {
  private readonly renderer: THREE.WebGPURenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, NEAR_KM, FAR_KM);
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
  /** 行き先に着いているあいだの、スクロールの進み（0〜1。マイページの下へスクロールしたとき） */
  private destScrollE = 0;
  /** 最初に描いた時刻（地球が下から上がってくる動きの始まり）。まだ描いていなければ 0 */
  private introStartMs = 0;
  /** 描いた最後の日時（同じ時刻なら、向きと太陽を計算し直さない） */
  private lastSecond = -1;
  private disposed = false;
  /** 月・火星（準備ができるまで無い）。prepareBody で作る */
  private readonly bodies: Partial<Record<Destination, THREE.Mesh>> = {};
  private readonly bodyPreparing: Partial<Record<Destination, Promise<void>>> = {};
  private readonly bodyFailed = new Set<Destination>();
  /** 天体の自転の向き（1 秒ごとに計算し直す）。位置は、毎フレーム、見た目の配置で決める */
  private readonly bodyRotation: Partial<Record<Destination, THREE.Matrix4>> = {};
  private readonly bodyMatrix = new THREE.Matrix4();
  /** いま飛んでいる（または着いている）行き先。地球にいる間に、次の行き先へ替わる */
  private dest: Destination = 'moon';
  /** 移動の段階。earth：地球にいる、out：地球から行き先へ飛んでいる、dest：行き先にいる、back：行き先から地球へ飛んでいる */
  private phase: 'earth' | 'out' | 'dest' | 'back' = 'earth';
  /** いま飛んでいる 1 回分の進み具合（0〜1）。時間に比例 */
  private legT = 0;
  private ufo: UfoLayer | null = null;
  private ufoPreparing: Promise<void> | null = null;
  private ufoReady = false;
  private ufoHue = Number.NaN;
  private width = 1;
  private height = 1;
  private readonly timers: number[] = [];

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
    // 地球が現れる動きが終わってから、船を選ぶ画面と、月の準備を進める（先にやると、現れる動きが引っかかる）
    scene.timers.push(window.setTimeout(() => void scene.prepareUfo(), PREPARE_UFO_DELAY_MS));
    scene.timers.push(window.setTimeout(() => void scene.prepareBody('moon'), PREPARE_MOON_DELAY_MS));
    return scene;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed || width === 0 || height === 0) return;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.width = width;
    this.height = height;
    this.ufo?.setSize(width, height);
  }

  /** 船を選ぶ画面（UFO）の準備。1 回だけ。作って、シェーダーのコンパイルまで済ませる */
  prepareUfo(): Promise<void> {
    if (!this.ufoPreparing) {
      this.ufoPreparing = (async () => {
        const layer = new UfoLayer(Number.isFinite(this.ufoHue) ? this.ufoHue : 200);
        layer.setSize(this.width, this.height);
        await layer.compile(this.renderer);
        if (this.disposed) {
          layer.dispose();
          return;
        }
        this.ufo = layer;
        this.ufoReady = true;
      })().catch((e: unknown) => {
        console.warn('宇宙船の選択を 3D で描けない', e);
      });
    }
    return this.ufoPreparing;
  }

  /** 月・火星の準備。天体ごとに 1 回だけ。画像を読み、球を作り、シェーダーのコンパイルまで済ませる。失敗したら、そこへは飛ばない */
  prepareBody(which: Destination): Promise<void> {
    let work = this.bodyPreparing[which];
    if (!work) {
      const { id, texture: url } = DESTINATIONS[which];
      work = (async () => {
        const t = await new THREE.TextureLoader().loadAsync(url);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        if (this.disposed) {
          t.dispose();
          return;
        }
        const geometry = new THREE.SphereGeometry(bodyInfo(id).radiusKm, 128, 64);
        const material = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
        material.colorNode = texture(t);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        // コンパイルの間だけ、描かれない遠くに置いて見える状態にする（見えない物は、コンパイルされないことがあるため）。済んだら隠す
        mesh.matrix.makeTranslation(1e9, 0, 0);
        this.scene.add(mesh);
        this.owned.push(geometry, material, t);
        try {
          await this.renderer.compileAsync(this.scene, this.camera);
        } catch (e) {
          console.warn(`${id} の描画の準備に失敗。そのまま描く`, e);
        }
        mesh.visible = false;
        this.bodies[which] = mesh;
        this.lastSecond = -1; // 自転の向きを、次のフレームで置く
      })().catch((e: unknown) => {
        console.warn(`${id} を描けない。そこへは飛ばない`, e);
        this.bodyFailed.add(which);
      });
      this.bodyPreparing[which] = work;
    }
    return work;
  }

  /** 地球のまわりの船の位置が届いたとき（receivedMs はブラウザの時計で受け取った時刻） */
  ingestShips(snapshot: EarthShipsSnapshot, receivedMs: number): void {
    this.tracks.ingest(snapshot, receivedMs);
  }

  /**
   * nowMs（世界の時刻）の地球を描く。motion が false なら、カメラの揺れ・船の追従・現れる動き・月への飛行の途中経過・UFO の滑りを止める
   * （「動きを減らす」の設定）。scroll は、スクロールの位置（最初の画面の高さを 1 とする。0 で最初の画面、1 で詳細の画面。
   * 1 を超えた分は、地球を画面の外へ送る）。stage は、画面の部品と共有する状態（行き先のカメラ・船を選ぶ列）
   */
  render(nowMs: number, motion: boolean, scroll: number, stage: TopStage): void {
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
      for (const which of Object.keys(this.bodies) as Destination[]) {
        const rot = (this.bodyRotation[which] ??= new THREE.Matrix4());
        toMatrix4(sphereToEqj(bodyFixedToEqj(DESTINATIONS[which].id, date)), rot);
      }
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
    const earthBasis: ViewBasis = {
      ...pose.basis,
      distanceKm: pose.basis.distanceKm + (detailDistance - pose.basis.distanceKm) * e,
      alpha: pose.basis.alpha + (detailAlpha - pose.basis.alpha) * e + introAlpha,
    };

    const view = this.flightPose(earthBasis, dt, motion, stage, e);
    this.updateDepthRange(view.position);
    this.camera.position.set(view.position.x, view.position.y, view.position.z);
    this.camera.up.set(view.up.x, view.up.y, view.up.z);
    this.camera.lookAt(view.position.x + view.forward.x, view.position.y + view.forward.y, view.position.z + view.forward.z);
    this.lights.update(ships, this.camera);

    // 1 枚目：地球（と月）。2 枚目：船を選ぶ列（地球の上に重ねる）
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (stage.hue !== this.ufoHue) {
      this.ufoHue = stage.hue;
      this.ufo?.setHue(stage.hue);
    }
    if (stage.ufoShown && !this.ufoPreparing) void this.prepareUfo();
    if (stage.preloadMars && !this.bodyPreparing.mars && nowMs - this.introStartMs > PREPARE_MARS_DELAY_MS) void this.prepareBody('mars');
    if (this.ufoReady && this.ufo) {
      this.ufo.update(stage, nowMs, dt, motion);
      if (this.ufo.active) {
        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.ufo.scene, this.ufo.camera);
        this.renderer.autoClear = true;
      }
    }
  }

  /**
   * 移動を進め、いまのカメラを返す。stage.view が月・火星なら地球から行き先へ、地球なら行き先から地球へ、前へ飛ぶ。
   * 行き先は、地球にいる間にだけ替わる。準備ができていなければ、飛ばない。使えないと分かったら、飛ばずに「着いた」ことにする
   * （画面の部品が先へ進めるように）。飛んでいる途中で、行き先が戻る向きに変わったら、いったん着いてから戻る。
   *
   * 3 つの天体は、地球のカメラの「前」の向きの線に並ぶ（地球の中心が原点。前は earthBasis.u、上は earthBasis.dir）。
   * 行き先へ飛ぶ間と着いたあとは、行き先を線の前（+）に、戻る間は、地球が前に来るよう、行き先を後ろ（−）に置く。
   * どちらも、行き先から見た構図は同じで、地球は、画面の外（後ろか、上の遠く）にあるので、置き直しは見えない。
   */
  private flightPose(earthBasis: ViewBasis, dt: number, motion: boolean, stage: TopStage, scrollE: number): EarthCameraPose {
    const away = stage.view !== 'earth';
    if (this.phase === 'earth' && away) {
      this.dest = stage.view as Destination;
      if (!this.bodies[this.dest] && !this.bodyFailed.has(this.dest)) void this.prepareBody(this.dest);
      if (this.bodies[this.dest]) {
        this.phase = 'out';
        this.legT = 0;
      }
    } else if (this.phase === 'dest' && !away) {
      this.phase = 'back';
      this.legT = 0;
    }
    if (this.phase === 'out' || this.phase === 'back') {
      this.legT = motion ? Math.min(1, this.legT + dt / FLIGHT_S) : 1;
      if (this.legT >= 1) {
        this.phase = this.phase === 'out' ? 'dest' : 'earth';
        this.legT = 0;
      }
    }

    const f = this.legT;
    // 飛んでいる速さ（真ん中で 1）。星空の流れに使う
    stage.warp = this.phase === 'out' || this.phase === 'back' ? 16 * f * f * (1 - f) * (1 - f) : 0;
    if (away && this.bodyFailed.has(this.dest) && this.phase === 'earth') stage.setArrival('there');
    else stage.setArrival(this.phase === 'dest' ? 'there' : this.phase === 'earth' ? 'earth' : 'flying');

    // 行き先の天体は、地球にいる間は隠す
    for (const [which, mesh] of Object.entries(this.bodies) as [Destination, THREE.Mesh][]) mesh.visible = this.phase !== 'earth' && which === this.dest;
    if (this.phase === 'earth') return posedView(earthBasis);

    const up = earthBasis.dir;
    const forward = earthBasis.u;
    const { id } = DESTINATIONS[this.dest];
    const radiusKm = bodyInfo(id).radiusKm;
    // 行き先から見たカメラの距離は、地球のときと同じ構図（縁の見え方）になるよう、半径に比例させる
    const rDest = (radiusKm * DISTANCE_KM) / bodyInfo('Earth').radiusKm;
    const alphaDest = limbAlpha(radiusKm, rDest, FOV, LIMB_NDC_Y);
    // 着いているあいだのスクロール（マイページの下のコレクション。2026-11-13）：タイトル画面の地球と同じく、
    // 天体から離れ、天体の中心を画面の上へ送る。戻るときは、離れて見ていた所から飛び立つ
    if (this.phase === 'dest') this.destScrollE = scrollE;
    const de = this.phase === 'out' ? 0 : this.destScrollE;
    const rHere = rDest + (distanceForRadius(radiusKm, DETAIL_RADIUS_NDC, FOV) - rDest) * de;
    const alphaHere = alphaDest + (alphaForCenter(DETAIL_CENTER_NDC_Y, FOV) - alphaDest) * de;
    const toDest = { up, forward, rFrom: earthBasis.distanceKm, alphaFrom: earthBasis.alpha, rTo: rDest, alphaTo: alphaDest, stageKm: STAGE_DISTANCE_KM };
    const toEarth = { up, forward, rFrom: rHere, alphaFrom: alphaHere, rTo: earthBasis.distanceKm, alphaTo: earthBasis.alpha, stageKm: STAGE_DISTANCE_KM };
    // 行き先の天体の中心（地球の中心が原点）。行くときと着いているあいだは、視線の先。戻るときは、地球が視線の先に来るよう、手前の側
    const center = this.phase === 'back' ? scale(legEndCenter(toEarth), -1) : legEndCenter(toDest);
    const mesh = this.bodies[this.dest];
    const rot = this.bodyRotation[this.dest];
    if (mesh && rot) {
      this.bodyMatrix.copy(rot).setPosition(center.x, center.y, center.z);
      mesh.matrix.copy(this.bodyMatrix);
      mesh.matrixWorldNeedsUpdate = true;
    }

    if (this.phase === 'out') return forwardLeg({ ...toDest, f });
    if (this.phase === 'dest') {
      const pose = posedView({ dir: up, u: forward, distanceKm: rHere, alpha: alphaHere });
      return { ...pose, position: add(pose.position, center) };
    }
    // back：行き先の中心から、前へ
    const leg = forwardLeg({ ...toEarth, f });
    return { ...leg, position: add(leg.position, center) };
  }

  /**
   * 手前の面（near）を、いちばん近い天体の表面までの距離に合わせる。遠くの小さな地球や月で、重なった面
   * （地球の表面・雲・大気は、約 10 km しか離れていない）が、ちらつかないようにするため（奥行きの精度は、手前の面が遠いほどよい）。
   * 近いとき（地球の高度 4,600 km）は、これまでどおり 100〜200 km
   */
  private updateDepthRange(cam: Vec3): void {
    let nearest = length(cam) - bodyInfo('Earth').radiusKm;
    for (const [which, mesh] of Object.entries(this.bodies) as [Destination, THREE.Mesh][]) {
      if (!mesh.visible) continue;
      const e = mesh.matrix.elements;
      const c = { x: e[12], y: e[13], z: e[14] };
      nearest = Math.min(nearest, length(sub(cam, c)) - bodyInfo(DESTINATIONS[which].id).radiusKm);
    }
    const near = Math.min(1e7, Math.max(NEAR_KM, nearest * 0.05));
    if (Math.abs(near - this.camera.near) > this.camera.near * 0.02) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
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
    this.timers.forEach((t) => clearTimeout(t));
    this.ufo?.dispose();
    this.lights.dispose();
    this.owned.forEach((o) => o.dispose());
    this.renderer.dispose();
  }
}
