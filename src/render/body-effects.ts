/**
 * 天体の見た目を良くする描き方（要件 F25）。
 *
 * - 大気：天体より少し大きい殻を、ふちだけ光らせて足し合わせる（昼の側だけ明るい）
 * - 恒星：表面は、ふちが暗くなる（周辺減光）のと、ゆっくり動く粒の模様（粒状斑）。まわりに光の広がり
 * - 環の影：本体の表面から恒星へ向かう線が環の面を通るなら、環の濃さの分だけ暗くする。
 *   環の上の点から恒星へ向かう線が本体を通るなら、環を暗くする
 *
 * どれも見た目のための近似（光の散乱や影の計算を本物どおりにはしていない）。
 * 位置はすべて「自分を原点にした EQJ（km）」で、毎フレーム uniform で渡す。
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  dot,
  exp,
  float,
  max,
  mx_noise_float,
  normalView,
  normalWorld,
  positionLocal,
  positionView,
  positionWorld,
  select,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Atmosphere } from '../world/solar-system';
import type UniformNode from 'three/src/nodes/core/UniformNode.js';

/** 天体ごとに毎フレーム入れ直す値 */
export interface BodyUniforms {
  /** 天体の中心（自分を原点にした EQJ・km） */
  center: UniformNode<'vec3', THREE.Vector3>;
  /** 天体から恒星への向き（単位ベクトル） */
  toStar: UniformNode<'vec3', THREE.Vector3>;
  /** 天体の北極の向き（環の面の向き） */
  pole: UniformNode<'vec3', THREE.Vector3>;
}

export const createBodyUniforms = (): BodyUniforms => ({
  center: uniform(new THREE.Vector3()) as UniformNode<'vec3', THREE.Vector3>,
  toStar: uniform(new THREE.Vector3(1, 0, 0)) as UniformNode<'vec3', THREE.Vector3>,
  pole: uniform(new THREE.Vector3(0, 0, 1)) as UniformNode<'vec3', THREE.Vector3>,
});

/** 大気の殻。天体の球と同じ向き・位置に置く（天体の mesh の子にする） */
export function createAtmosphereMesh(radiusKm: number, atm: Atmosphere, u: BodyUniforms): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radiusKm * (1 + atm.thickness), 64, 32);
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const viewDir = positionView.negate().normalize();
  const ndv = max(dot(normalView, viewDir), float(0));
  // 殻のいちばん外（ndv=0）は 0 にして、少し内側（天体のふちのあたり）を明るくする
  const rim = smoothstep(0, 0.12, ndv).mul(float(1).sub(ndv).pow(4));
  // 昼の側だけ。明け方・夕方の側（境目の少し向こう）まで薄く残す
  const day = smoothstep(-0.25, 0.5, dot(normalWorld, u.toStar));
  material.colorNode = vec3(...atm.color).mul(rim.mul(day).mul(atm.strength * 1.6));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'atmosphere';
  return mesh;
}

/** 恒星の表面の材質。ふちが暗く、粒の模様がゆっくり動く */
export function createStarMaterial(color: readonly [number, number, number]): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const viewDir = positionView.negate().normalize();
  const mu = max(dot(normalView, viewDir), float(0));
  // 周辺減光（太陽の可視光でおおよそ I(μ)/I(1) = 0.4 + 0.6μ）
  const limb = float(0.4).add(mu.mul(0.6));
  const p = positionLocal.normalize();
  const granules = mx_noise_float(p.mul(60).add(vec3(time.mul(0.02), 0, 0))).mul(0.12).add(1);
  const spots = smoothstep(0.55, 0.75, mx_noise_float(p.mul(4).add(vec3(0, time.mul(0.002), 0)))).mul(0.25);
  material.colorNode = vec3(...color).mul(limb).mul(granules).mul(float(1).sub(spots)).mul(1.15);
  return material;
}

/** 恒星のまわりの光の広がり（カメラの方を向く板）。大きさは半径の SIZE_RADII 倍 */
export const STAR_GLOW_RADII = 6;
export function createStarGlow(color: readonly [number, number, number]): THREE.Sprite {
  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const d = uv().sub(0.5).length().mul(2);
  // 中心の強い光と、遠くまで届く弱い光を重ねる
  const glow = exp(d.mul(d).mul(-40)).mul(0.6).add(exp(d.mul(-7)).mul(0.15)).mul(float(1).sub(smoothstep(0.8, 1, d)));
  material.colorNode = vec3(...color).mul(glow);
  const sprite = new THREE.Sprite(material);
  sprite.name = 'star-glow';
  return sprite;
}

/**
 * 環の影を落とす、天体の表面の材質の色。map は天体の画像（あとで入れ替えられるように texture の node で持つ）
 */
export function ringShadowedColor(
  mapNode: ReturnType<typeof texture>,
  ringMap: THREE.Texture,
  inner: number,
  outer: number,
  u: BodyUniforms,
) {
  const rel = positionWorld.sub(u.center);
  const denomRaw = dot(u.toStar, u.pole);
  const denom = select(abs(denomRaw).lessThan(1e-4), float(1e-4), denomRaw);
  // 表面の点から恒星へ進んで、環の面に当たるまでの長さ
  const t = dot(rel, u.pole).negate().div(denom);
  const hit = rel.add(u.toStar.mul(t));
  const ru = hit.length().sub(inner).div(outer - inner);
  const inside = step(0, ru).mul(step(ru, 1)).mul(step(0, t));
  const ringAlpha = texture(ringMap, vec2(ru.clamp(0, 1), 0.5)).a;
  const shade = float(1).sub(ringAlpha.mul(inside).mul(0.85));
  return vec4((mapNode as unknown as ReturnType<typeof vec4>).xyz.mul(shade), 1);
}

/**
 * 環の材質。本体の影に入るところを暗くする。
 * 明るさは自前で計算する：光が環の面にほぼ真横から当たると、ふつうの照明（ランバート）ではほぼ真っ暗になり、
 * 環が見えなくなるため。光の当たる角度の平方根で弱め、最低でも 0.25 は残す（見た目のための近似）
 */
export function createRingMaterial(ringMap: THREE.Texture, radiusKm: number, u: BodyUniforms): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const tex = texture(ringMap) as unknown as ReturnType<typeof vec4>;
  const v = u.center.sub(positionWorld);
  const tca = dot(v, u.toStar);
  const d2 = dot(v, v).sub(tca.mul(tca));
  const inShadow = step(0, tca).mul(step(d2, float(radiusKm * radiusKm)));
  const lit = float(0.25).add(abs(dot(u.pole, u.toStar)).sqrt().mul(0.75));
  material.colorNode = vec4(tex.xyz.mul(lit).mul(float(1).sub(inShadow.mul(0.92))), 1);
  material.opacityNode = tex.w;
  return material;
}
