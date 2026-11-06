/**
 * タイトル画面の地球の見え方（カメラの位置と向き）。純粋な計算にして、テストする（earth-camera.test.ts）。
 * 座標は EQJ（地球の中心が原点・km）。
 *
 * 地球の縁（水平線）が画面の下に弧を描き、その上に見せたい船（または、船がいないときは仮の点）が浮かぶように、
 * カメラの位置と向きを決める。太陽の光は斜めから当たるようにして、昼と夜の境目と、縁の大気の光が見えるようにする。
 */
import type { Vec3 } from '../world/vec';
import { add, length, scale, sub } from '../world/vec';

export interface EarthCameraPose {
  /** カメラの位置（km） */
  position: Vec3;
  /** カメラが向く向き（単位ベクトル） */
  forward: Vec3;
  /** カメラの上の向き（単位ベクトル。forward とは平行でない） */
  up: Vec3;
}

const DEG = Math.PI / 180;
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => scale(a, 1 / length(a));

export interface SubjectViewOptions {
  /** 見せたい船の位置（地球の中心から・km） */
  aim: Vec3;
  sunDir: Vec3;
  radiusKm: number;
  distanceKm: number;
  fovDeg: number;
  /** 地球の縁の高さ（limbView と同じ） */
  limbNdcY: number;
  /** 見せたい船を映す高さ（画面の中心が 0、上の端が +1）。縁より上にする */
  subjectNdcY: number;
  /** カメラの位置の、太陽の向きとの内積の目標。1 なら真昼の側、0 なら昼夜の境目の上。境目と、夜の灯りが見える 0.45 あたりがよい */
  sunTarget: number;
  /** 前に使った、船のまわりの回る角（ラジアン）。近い角を選んで、カメラが急に反対側へ飛ばないようにする */
  phiHint?: number;
}

/**
 * 見せたい船が、地球の縁の上に見えるカメラの位置と向き。
 * カメラは地球の中心から distanceKm の球の上にあり、船・地球の中心・カメラは 1 つの平面にある。
 * 画面の真ん中の縦の線の上に、下から順に、地球の縁・船が並ぶ。船のまわりをどちら側から見るか（phi）は、
 * 太陽の当たり方（sunTarget）と、前の phi への近さで選ぶ。
 * 船が地球に近すぎて、望んだ高さに映せないときは、いちばん近く映せる位置にする（縁より下には隠れない）。
 */
export function subjectView(o: SubjectViewOptions): EarthCameraPose & { phi: number; subjectNdcY: number; basis: ViewBasis } {
  const r = length(o.aim);
  const p = scale(o.aim, 1 / r);
  const half = Math.tan((o.fovDeg * DEG) / 2);
  const D = o.distanceKm;
  const alpha = limbAlpha(o.radiusKm, D, o.fovDeg, o.limbNdcY);
  // 船と地球の中心が、カメラから見てなす角（地球の中心の向きから測る）
  const beta = alpha + Math.atan(o.subjectNdcY * half);

  // カメラが船の向きから θ 回った位置にあるとき、カメラから見た「地球の中心」と「船」のなす角
  const angleAt = (theta: number): number => {
    const c = Math.cos(theta);
    return Math.acos(Math.max(-1, Math.min(1, (D - r * c) / Math.sqrt(r * r + D * D - 2 * r * D * c))));
  };
  // カメラと船を結ぶ線が、地球に隠されないか（線分と地球の中心の最短距離が、半径より大きいか）
  const clear = (theta: number): boolean => {
    const cx = D * Math.cos(theta);
    const cy = D * Math.sin(theta);
    const px = r;
    const dx = px - cx;
    const dy = -cy;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, -(cx * dx + cy * dy) / len2));
    return Math.hypot(cx + t * dx, cy + t * dy) >= o.radiusKm * 1.02;
  };
  let theta = Math.PI / 2;
  let best = Number.POSITIVE_INFINITY;
  for (let d = 1; d <= 179; d += 0.5) {
    const t = d * DEG;
    if (!clear(t)) continue;
    const e = Math.abs(angleAt(t) - beta);
    if (e < best) {
      best = e;
      theta = t;
    }
  }

  // 船の向きに垂直な 2 つの向き。phi はその回りの角
  const any = Math.abs(p.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const e1 = unit(cross3(p, any));
  const e2 = cross3(p, e1);
  const dirAt = (phi: number): Vec3 => add(scale(p, Math.cos(theta)), scale(add(scale(e1, Math.cos(phi)), scale(e2, Math.sin(phi))), Math.sin(theta)));
  let phi = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < 72; k++) {
    const ph = (k / 72) * 2 * Math.PI;
    let score = -Math.abs(dot3(dirAt(ph), o.sunDir) - o.sunTarget);
    if (o.phiHint !== undefined) {
      const diff = Math.abs(((ph - o.phiHint + Math.PI * 3) % (2 * Math.PI)) - Math.PI);
      score -= 0.35 * (diff / Math.PI);
    }
    if (score > bestScore) {
      bestScore = score;
      phi = ph;
    }
  }
  const dir = dirAt(phi);
  // カメラの中心の向きからの、船の側（平面の中で、dir に垂直で、船に近づく向き）
  const u = unit(sub(p, scale(dir, dot3(p, dir))));
  const forward = unit(add(scale(dir, -Math.cos(alpha)), scale(u, Math.sin(alpha))));
  const up = unit(add(scale(dir, Math.sin(alpha)), scale(u, Math.cos(alpha))));
  // 実際に映る高さ（望んだ高さに映せないときの確認用）
  const subjectAngle = angleAt(theta) - alpha;
  return { position: scale(dir, D), forward, up, phi, subjectNdcY: Math.tan(subjectAngle) / half, basis: { dir, u, distanceKm: D, alpha } };
}

/**
 * カメラの位置と向きを決める 4 つの値。dir は地球の中心からカメラへの向き、u は、カメラと地球の中心を結ぶ線に垂直な「上」の向き、
 * distanceKm はカメラから地球の中心までの距離、alpha は、地球の中心が、画面の真ん中から下へ何ラジアンずれて見えるか
 * （負なら、地球の中心が画面の真ん中より上に見える）
 */
export interface ViewBasis {
  dir: Vec3;
  u: Vec3;
  distanceKm: number;
  alpha: number;
}

/** basis の距離と alpha を変えたときの、カメラの位置と向き（見る向き dir・u はそのまま） */
export function posedView(b: ViewBasis): EarthCameraPose {
  const forward = unit(add(scale(b.dir, -Math.cos(b.alpha)), scale(b.u, Math.sin(b.alpha))));
  const up = unit(add(scale(b.dir, Math.sin(b.alpha)), scale(b.u, Math.cos(b.alpha))));
  return { position: scale(b.dir, b.distanceKm), forward, up };
}

/** 地球の中心を、画面の高さ centerNdcY（中心が 0、上の端が +1）に映すための alpha */
export const alphaForCenter = (centerNdcY: number, fovDeg: number): number => -Math.atan(centerNdcY * Math.tan((fovDeg * DEG) / 2));

/** 地球の見かけの半径が、画面の高さの radiusNdc（中心が 0、上の端が +1 の単位）になる、カメラと地球の中心の距離（km） */
export function distanceForRadius(radiusKm: number, radiusNdc: number, fovDeg: number): number {
  const rho = Math.atan(radiusNdc * Math.tan((fovDeg * DEG) / 2));
  return radiusKm / Math.sin(rho);
}

/**
 * 天体の縁が画面の高さ limbNdcY（下が負）に見えるときの、alpha（天体の中心が、画面の真ん中から下へ何ラジアンずれて見えるか）。
 * 天体の中心から distanceKm の位置で、中心の向きから縁までが asin(半径 / 距離)、縁から画面の真ん中までが atan(|limbNdcY| × tan(画角 / 2))
 */
export function limbAlpha(radiusKm: number, distanceKm: number, fovDeg: number, limbNdcY: number): number {
  return Math.asin(radiusKm / distanceKm) + Math.atan(Math.abs(limbNdcY) * Math.tan((fovDeg * DEG) / 2));
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth01 = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export interface LegOptions {
  /** 地平線の上の向き（出発の天体の中心から、カメラへ）と、前（奥）の向き。たがいに垂直な単位ベクトル。出発のカメラの dir・u と同じ */
  up: Vec3;
  forward: Vec3;
  /** 出発のカメラ：天体の中心からの距離と alpha */
  rFrom: number;
  alphaFrom: number;
  /** 着くカメラ：行き先の天体の中心からの距離と alpha */
  rTo: number;
  alphaTo: number;
  /** カメラが進む距離（km）。見た目のための距離で、出発の天体も行き先も同じ */
  stageKm: number;
  /** 進み具合（0：出発、1：着いた） */
  f: number;
}

/** 出発のカメラの、見る向き（まっすぐ進む向き） */
function legDirection(o: LegOptions): Vec3 {
  return posedView({ dir: o.up, u: o.forward, distanceKm: 1, alpha: o.alphaFrom }).forward;
}

/**
 * 行き先の天体の中心（出発の天体の中心が原点）。着いたカメラが、出発のカメラから、見る向きへ stageKm まっすぐ進んだ点で、
 * 着いたカメラは、行き先の中心から、上の向きへ rTo の点にある。つまり、行き先は、出発のカメラの視線の先の、ずっと遠くにある
 * （出発のカメラからは、画面の真ん中に、小さく見える）。
 */
export function legEndCenter(o: Omit<LegOptions, 'f'>): Vec3 {
  const dir = legDirection({ ...o, f: 0 });
  const start = scale(o.up, o.rFrom);
  return sub(add(start, scale(dir, o.stageKm)), scale(o.up, o.rTo));
}

/**
 * 「月ー地球ー火星」の移動の、1 回分。**カメラは、向きを変えず、見ている向きへ、まっすぐ進む**。返すカメラの位置は、出発の天体の中心が原点。
 *
 * 行き先の天体は、視線の先のずっと遠く（legEndCenter）にあるので、最初は、画面の真ん中に小さな点として見え、近づくほど大きくなる。
 * 着く直前、行き先の中心は、遠近法だけで、画面の真ん中から下へ動き、出発のときと同じ構図（縁が画面の下に弧）に落ち着く（向きを回す必要がない）。
 * 出発の天体は、出発の構図で画面の下にあり、カメラが前へ進むので、そのまま画面の下へ消える。
 *
 * 前へ進む距離は、出発の距離から指数で伸ばし（前半）、着くときの距離へ指数で縮める（後半）。
 * 動き出しの数コマで進む距離を小さくして、出発の天体が一瞬で消えないようにするため（始まりと終わりはゆるやかに）。
 * alpha が出発と着くときで違うとき（地球の現れる動きの間など）だけ、向きを、なめらかに合わせる。
 * 行き先から地球へ戻る移動も、同じ式で、行き先の中心を出発点にして、前へ進む。
 */
export function forwardLeg(o: LegOptions): EarthCameraPose {
  const S = o.stageKm;
  const f = clamp01(o.f);
  const p = f * f * f * (f * (6 * f - 15) + 10);
  const u = Math.min(1, 2 * p);
  const w = Math.max(0, 2 * p - 1);
  const k1 = Math.log(S / (2 * o.rFrom));
  const k2 = Math.log(S / (2 * o.rTo));
  const along = p < 0.5 ? ((S / 2) * Math.expm1(k1 * u)) / Math.expm1(k1) : S - ((S / 2) * Math.expm1(k2 * (1 - w))) / Math.expm1(k2);
  const dir = legDirection({ ...o, f: 0 });
  const alpha = o.alphaFrom + (o.alphaTo - o.alphaFrom) * smooth01(f);
  const look = posedView({ dir: o.up, u: o.forward, distanceKm: 1, alpha });
  return { position: add(scale(o.up, o.rFrom), scale(dir, along)), forward: look.forward, up: look.up };
}
