/**
 * 宇宙船のベイパー（進んだ軌道に沿って残り、徐々に消える光の雲の跡。2026-11-22 作り直し・形状別対応＋高速光跡）。
 *
 * - **自分の近く・低中速**：船の長さ（`hullLengthKm`）基準の仮想軌道ノードとして記録し、どの速度域でも画面に収まる
 *   長さのまま、旋回・傾きに沿って 3D でカーブした跡が空間に残り、停止後も約 4.2 秒かけて消える。
 * - **船の形・色ごとの見た目**（`vaporProfileOf`）：初期 3 種（ソーサー／ベル／リング）およびブロックで作った
 *   マイ UFO の横幅・高さ・端の位置・発光ブロックの色を読み取って、4 本の筒（外側の霧・推進芯・左右の翼端ベイパー）を出し分ける。
 * - **他のプレイヤーの高速光跡**：他機が大きく移動したときは実空間座標（`worldDisplacementKm`）へノードを残し、
 *   カメラからの距離に応じた最低太さと遠方圧縮（`D_MAX`）を加えることで、時速 1 万光年のような超高速でも
 *   星々を横切る長い光の線（流れ星・航跡）として遠くから見え、部屋から飛び去ったあとも徐々に消えるまで空間に残る。
 *
 * 宇宙には空気が無いので本物の現象ではない。見た目のための演出（要件 F63）。
 */
import * as THREE from 'three/webgpu';
import { abs, dot, mx_noise_float, normalView, positionView, time, uv, vec3, vertexColor } from 'three/tsl';
import type { Quat } from '../world/quat';
import { CELL_M, GRID, PALETTE, blockCells, type Block } from '../world/ship-blocks';
import type { ShipShape } from '../world/ship-presets';
import type { Vec3 } from '../world/vec';

/** ベイパーの跡が完全に消えるまでの時間（秒） */
export const TRAIL_LIFETIME_S = 4.2;
/** 軌道に沿って覚える節の最大数 */
export const MAX_TRAIL_NODES = 96;
/** 全速（strength = 1）のとき 1 秒間に後ろへ流れる船の長さ */
const FLOW_SPEED_HULLS_PER_S = 4.2;
/** 吹き出しの向きに沿って後ろへじわっと流れる速さ（船が止まったあとの余韻） */
const EXHAUST_DRIFT_HULLS_PER_S = 0.45;
/** 新しい節を打つ最小の間隔（船の長さ・秒） */
const MIN_NODE_SPACING_HULLS = 0.16;
const MAX_NODE_INTERVAL_S = 0.045;
/** 他機の高速光跡を camera.far（1e11 km）の内側へ滑らかに圧縮する基準距離（km） */
const FAR_COMPRESS_KM = 4e10;

const RADIALS = [8, 6, 4, 4] as const;
const VERTS_PER_SLICE = RADIALS.reduce((sum, r) => sum + r + 1, 0); // 9 + 7 + 5 + 5 = 26

const TRIG = RADIALS.map((r) => {
  const cos = new Float32Array(r + 1);
  const sin = new Float32Array(r + 1);
  for (let j = 0; j <= r; j++) {
    const a = (j / r) * Math.PI * 2;
    cos[j] = Math.cos(a);
    sin[j] = Math.sin(a);
  }
  return { cos, sin };
});

/** 4 本の筒それぞれの放出位置・広がり・色 */
export interface TubeEmitter {
  xRatio: number;
  convergeXRatio: number;
  yRatio: number;
  convergeYRatio: number;
  backRatio: number;
  baseRadiusRatio: number;
  expandRadiusRatio: number;
  aspectX: number;
  aspectY: number;
  colorHead: readonly [number, number, number];
  colorTail: readonly [number, number, number];
  opacity: number;
  fadePower: number;
  fadeScale: number;
}

export interface VaporProfile {
  kind: 'saucer' | 'bell' | 'ring' | 'custom';
  tubes: readonly [TubeEmitter, TubeEmitter, TubeEmitter, TubeEmitter];
  streakColor: readonly [number, number, number];
}

const SAUCER_PROFILE: VaporProfile = {
  kind: 'saucer',
  tubes: [
    {
      xRatio: 0,
      convergeXRatio: 0,
      yRatio: -0.022,
      convergeYRatio: 0,
      backRatio: 0.15,
      baseRadiusRatio: 0.095,
      expandRadiusRatio: 0.25,
      aspectX: 1.28,
      aspectY: 0.82,
      colorHead: [0.54, 0.82, 1.0],
      colorTail: [0.42, 0.70, 1.0],
      opacity: 0.62,
      fadePower: 1,
      fadeScale: 0,
    },
    {
      xRatio: 0,
      convergeXRatio: 0,
      yRatio: -0.022,
      convergeYRatio: 0,
      backRatio: 0.15,
      baseRadiusRatio: 0.048,
      expandRadiusRatio: -0.032,
      aspectX: 1.15,
      aspectY: 0.78,
      colorHead: [0.90, 0.98, 1.0],
      colorTail: [0.65, 0.90, 1.0],
      opacity: 0.92,
      fadePower: 1.45,
      fadeScale: 1.05,
    },
    {
      xRatio: -0.43,
      convergeXRatio: 0.06,
      yRatio: -0.012,
      convergeYRatio: 0,
      backRatio: 0.08,
      baseRadiusRatio: 0.014,
      expandRadiusRatio: 0.018,
      aspectX: 1,
      aspectY: 1,
      colorHead: [0.70, 0.92, 1.0],
      colorTail: [0.50, 0.80, 1.0],
      opacity: 0.78,
      fadePower: 1.25,
      fadeScale: 1.0,
    },
    {
      xRatio: 0.43,
      convergeXRatio: -0.06,
      yRatio: -0.012,
      convergeYRatio: 0,
      backRatio: 0.08,
      baseRadiusRatio: 0.014,
      expandRadiusRatio: 0.018,
      aspectX: 1,
      aspectY: 1,
      colorHead: [0.70, 0.92, 1.0],
      colorTail: [0.50, 0.80, 1.0],
      opacity: 0.78,
      fadePower: 1.25,
      fadeScale: 1.0,
    },
  ],
  streakColor: [0.65, 0.92, 1.0],
};

const BELL_PROFILE: VaporProfile = {
  kind: 'bell',
  tubes: [
    {
      xRatio: 0,
      convergeXRatio: 0,
      yRatio: -0.18,
      convergeYRatio: 0,
      backRatio: 0.12,
      baseRadiusRatio: 0.11,
      expandRadiusRatio: 0.24,
      aspectX: 1.02,
      aspectY: 1.05,
      colorHead: [1.0, 0.78, 0.42],
      colorTail: [0.92, 0.45, 0.20],
      opacity: 0.60,
      fadePower: 1,
      fadeScale: 0,
    },
    {
      xRatio: 0,
      convergeXRatio: 0,
      yRatio: -0.24,
      convergeYRatio: 0,
      backRatio: 0.16,
      baseRadiusRatio: 0.038,
      expandRadiusRatio: -0.018,
      aspectX: 1,
      aspectY: 1,
      colorHead: [1.0, 0.96, 0.78],
      colorTail: [1.0, 0.68, 0.28],
      opacity: 0.92,
      fadePower: 1.35,
      fadeScale: 1.02,
    },
    {
      xRatio: -0.22,
      convergeXRatio: 0.05,
      yRatio: -0.18,
      convergeYRatio: -0.02,
      backRatio: 0.10,
      baseRadiusRatio: 0.032,
      expandRadiusRatio: -0.012,
      aspectX: 1,
      aspectY: 1,
      colorHead: [1.0, 0.90, 0.60],
      colorTail: [0.96, 0.55, 0.22],
      opacity: 0.88,
      fadePower: 1.25,
      fadeScale: 1.0,
    },
    {
      xRatio: 0.22,
      convergeXRatio: -0.05,
      yRatio: -0.18,
      convergeYRatio: -0.02,
      backRatio: 0.10,
      baseRadiusRatio: 0.032,
      expandRadiusRatio: -0.012,
      aspectX: 1,
      aspectY: 1,
      colorHead: [1.0, 0.90, 0.60],
      colorTail: [0.96, 0.55, 0.22],
      opacity: 0.88,
      fadePower: 1.25,
      fadeScale: 1.0,
    },
  ],
  streakColor: [1.0, 0.80, 0.45],
};

const RING_PROFILE: VaporProfile = {
  kind: 'ring',
  tubes: [
    {
      xRatio: 0,
      convergeXRatio: 0,
      yRatio: 0,
      convergeYRatio: 0,
      backRatio: 0.12,
      baseRadiusRatio: 0.16,
      expandRadiusRatio: 0.30,
      aspectX: 1.35,
      aspectY: 0.95,
      colorHead: [0.72, 0.52, 1.0],
      colorTail: [0.25, 0.86, 0.84],
      opacity: 0.58,
      fadePower: 1,
      fadeScale: 0,
    },
    {
      xRatio: 0,
      convergeXRatio: 0,
      yRatio: 0,
      convergeYRatio: 0,
      backRatio: 0.10,
      baseRadiusRatio: 0.066,
      expandRadiusRatio: -0.038,
      aspectX: 1.05,
      aspectY: 1.05,
      colorHead: [0.86, 0.99, 1.0],
      colorTail: [0.40, 0.92, 0.95],
      opacity: 0.95,
      fadePower: 1.35,
      fadeScale: 1.02,
    },
    {
      xRatio: -0.47,
      convergeXRatio: 0.04,
      yRatio: 0,
      convergeYRatio: 0,
      backRatio: 0.06,
      baseRadiusRatio: 0.024,
      expandRadiusRatio: 0.022,
      aspectX: 1,
      aspectY: 1,
      colorHead: [0.84, 0.58, 1.0],
      colorTail: [0.30, 0.90, 0.86],
      opacity: 0.84,
      fadePower: 1.2,
      fadeScale: 1.0,
    },
    {
      xRatio: 0.47,
      convergeXRatio: -0.04,
      yRatio: 0,
      convergeYRatio: 0,
      backRatio: 0.06,
      baseRadiusRatio: 0.024,
      expandRadiusRatio: 0.022,
      aspectX: 1,
      aspectY: 1,
      colorHead: [0.84, 0.58, 1.0],
      colorTail: [0.30, 0.90, 0.86],
      opacity: 0.84,
      fadePower: 1.2,
      fadeScale: 1.0,
    },
  ],
  streakColor: [0.76, 0.64, 1.0],
};

function paletteRgb(colorIndex: number): [number, number, number] {
  const hex = PALETTE[colorIndex]?.hex ?? 0x7ad8ff;
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function normalizeColor(rgb: readonly [number, number, number]): [number, number, number] {
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  return [rgb[0] / m, rgb[1] / m, rgb[2] / m];
}

function buildCustomProfile(blocks: readonly Block[]): VaporProfile {
  if (blocks.length === 0) return { ...SAUCER_PROFILE, kind: 'custom' };
  let loX = GRID;
  let loY = GRID;
  let loZ = GRID;
  let hiX = 0;
  let hiY = 0;
  let hiZ = 0;
  for (const b of blocks) {
    const n = blockCells(b);
    loX = Math.min(loX, b.x);
    loY = Math.min(loY, b.y);
    loZ = Math.min(loZ, b.z);
    hiX = Math.max(hiX, b.x + n);
    hiY = Math.max(hiY, b.y + n);
    hiZ = Math.max(hiZ, b.z + n);
  }
  const midX = (loX + hiX) / 2;
  const midY = (loY + hiY) / 2;
  const midZ = (loZ + hiZ) / 2;
  const spanX = Math.max(1, hiX - loX);
  const spanZ = Math.max(1, hiZ - loZ);
  const sizeX = spanX * CELL_M;
  const sizeY = (hiY - loY) * CELL_M;
  const sizeZ = spanZ * CELL_M;
  const L = Math.max(1, sizeX, sizeZ);
  const widthRatio = Math.max(0.28, sizeX / L);
  const heightRatio = Math.max(0.28, sizeY / L);

  let leftSumY = 0;
  let leftW = 0;
  let rightSumY = 0;
  let rightW = 0;
  let rearSumY = 0;
  let rearW = 0;
  let glowR = 0;
  let glowG = 0;
  let glowB = 0;
  let glowW = 0;
  let vividR = 0;
  let vividG = 0;
  let vividB = 0;
  let vividW = 0;

  for (const b of blocks) {
    const n = blockCells(b);
    const bx = b.x + n / 2;
    const by = b.y + n / 2;
    const bz = b.z + n / 2;
    const yRatio = ((by - midY) * CELL_M) / L;
    const mass = n * n;
    if (bx - loX <= spanX * 0.25) {
      leftSumY += yRatio * mass;
      leftW += mass;
    }
    if (hiX - bx <= spanX * 0.25) {
      rightSumY += yRatio * mass;
      rightW += mass;
    }
    if (Math.abs(bx - midX) <= spanX * 0.35 && bz >= midZ - spanZ * 0.1) {
      rearSumY += yRatio * mass;
      rearW += mass;
    }
    const rgb = paletteRgb(b.c);
    const isGlow = PALETTE[b.c]?.glow === true;
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    if (isGlow) {
      const rearBoost = bz >= midZ ? 2 : 1;
      const w = (1 + chroma * 2) * mass * rearBoost;
      glowR += rgb[0] * w;
      glowG += rgb[1] * w;
      glowB += rgb[2] * w;
      glowW += w;
    } else if (chroma > 0.12) {
      const w = chroma * mass;
      vividR += rgb[0] * w;
      vividG += rgb[1] * w;
      vividB += rgb[2] * w;
      vividW += w;
    }
  }

  let base: [number, number, number] = [0.55, 0.85, 1.0];
  if (glowW > 0) {
    base = normalizeColor([glowR / glowW, glowG / glowW, glowB / glowW]);
    const glowChroma = Math.max(...base) - Math.min(...base);
    if (glowChroma < 0.15 && vividW > 0) {
      const v = normalizeColor([vividR / vividW, vividG / vividW, vividB / vividW]);
      base = normalizeColor([base[0] * 0.45 + v[0] * 0.55, base[1] * 0.45 + v[1] * 0.55, base[2] * 0.45 + v[2] * 0.55]);
    }
  } else if (vividW > 0) {
    base = normalizeColor([vividR / vividW, vividG / vividW, vividB / vividW]);
  }

  const boostColor = (mixWhite: number, satScale: number): [number, number, number] => {
    const m = Math.max(base[0], base[1], base[2]);
    return [
      Math.min(1, (base[0] === m ? 1 : base[0] * satScale) * (1 - mixWhite) + mixWhite),
      Math.min(1, (base[1] === m ? 1 : base[1] * satScale) * (1 - mixWhite) + mixWhite),
      Math.min(1, (base[2] === m ? 1 : base[2] * satScale) * (1 - mixWhite) + mixWhite),
    ];
  };

  const mistHead = boostColor(0.08, 0.92);
  const mistTail = boostColor(0, 0.78);
  const coreHead = boostColor(0.55, 0.9);
  const coreTail = boostColor(0.05, 0.85);
  const rimHead = boostColor(0.22, 0.92);
  const rimTail = boostColor(0, 0.82);

  const leftXRatio = Math.min(-0.04, (((loX - midX) * CELL_M) / L) * 0.92);
  const rightXRatio = Math.max(0.04, (((hiX - midX) * CELL_M) / L) * 0.92);
  const leftY = leftW > 0 ? leftSumY / leftW : 0;
  const rightY = rightW > 0 ? rightSumY / rightW : 0;
  const coreY = rearW > 0 ? rearSumY / rearW : -0.02 * heightRatio;
  const backRatio = Math.max(0.08, Math.min(0.26, ((hiZ - midZ) * CELL_M) / L * 0.34));
  const rimR = 0.011 + 0.008 * widthRatio;

  return {
    kind: 'custom',
    tubes: [
      {
        xRatio: 0,
        convergeXRatio: 0,
        yRatio: coreY,
        convergeYRatio: 0,
        backRatio,
        baseRadiusRatio: 0.065 + 0.055 * Math.min(widthRatio, heightRatio),
        expandRadiusRatio: 0.16 + 0.10 * widthRatio,
        aspectX: 0.9 + 0.45 * widthRatio,
        aspectY: 0.72 + 0.45 * heightRatio,
        colorHead: mistHead,
        colorTail: mistTail,
        opacity: 0.62,
        fadePower: 1,
        fadeScale: 0,
      },
      {
        xRatio: 0,
        convergeXRatio: 0,
        yRatio: coreY,
        convergeYRatio: 0,
        backRatio,
        baseRadiusRatio: 0.032 + 0.022 * Math.min(widthRatio, heightRatio),
        expandRadiusRatio: -(0.02 + 0.015 * Math.min(widthRatio, heightRatio)),
        aspectX: 0.9 + 0.3 * widthRatio,
        aspectY: 0.75 + 0.3 * heightRatio,
        colorHead: coreHead,
        colorTail: coreTail,
        opacity: 0.92,
        fadePower: 1.4,
        fadeScale: 1.04,
      },
      {
        xRatio: leftXRatio,
        convergeXRatio: -leftXRatio * 0.14,
        yRatio: leftY,
        convergeYRatio: 0,
        backRatio: backRatio * 0.6,
        baseRadiusRatio: rimR,
        expandRadiusRatio: rimR * 1.1,
        aspectX: 1,
        aspectY: 1,
        colorHead: rimHead,
        colorTail: rimTail,
        opacity: 0.78,
        fadePower: 1.25,
        fadeScale: 1.0,
      },
      {
        xRatio: rightXRatio,
        convergeXRatio: -rightXRatio * 0.14,
        yRatio: rightY,
        convergeYRatio: 0,
        backRatio: backRatio * 0.6,
        baseRadiusRatio: rimR,
        expandRadiusRatio: rimR * 1.1,
        aspectX: 1,
        aspectY: 1,
        colorHead: rimHead,
        colorTail: rimTail,
        opacity: 0.78,
        fadePower: 1.25,
        fadeScale: 1.0,
      },
    ],
    streakColor: mistHead,
  };
}

const PROFILE_CACHE_SIZE = 64;
const profileCache = new Map<string, VaporProfile>();

/** 船の形（preset とマイ UFO）に合わせたベイパーの出し方と色を返す */
export function vaporProfileOf(shape: ShipShape): VaporProfile {
  const cached = profileCache.get(shape.key);
  if (cached) return cached;
  let profile: VaporProfile;
  if (shape.key === 'preset:bell') profile = BELL_PROFILE;
  else if (shape.key === 'preset:ring') profile = RING_PROFILE;
  else if (shape.key === 'preset:saucer') profile = SAUCER_PROFILE;
  else profile = buildCustomProfile(shape.blocks);
  profileCache.set(shape.key, profile);
  if (profileCache.size > PROFILE_CACHE_SIZE) profileCache.delete(profileCache.keys().next().value as string);
  return profile;
}

/** 速さの割合（0〜）から、尾の強さ（0〜1.25）。ダッシュ（1 を超える速さ）で少し伸びる */
export const trailStrength = (speedKmS: number, fullSpeedKmS: number): number =>
  fullSpeedKmS > 0 && speedKmS > 0 ? Math.min(1.25, speedKmS / fullSpeedKmS) : 0;

export interface TrailNode {
  /** 現在の船の位置からの相対位置（km・EQJ） */
  pos: Vec3;
  /** 放出時の船の右・上・進行逆向き（単位ベクトル・EQJ） */
  right: Vec3;
  up: Vec3;
  back: Vec3;
  /** 放出からの経過時間（秒） */
  age: number;
  /** 放出時の強さ（0 は移動の区切りを表す切れ目ノード） */
  strength: number;
  /** 放出時点の累積移動距離（船の長さ単位。ノイズ模様を空間に固定するため） */
  distanceHulls: number;
}

export interface TrailState {
  /** 新しい順（0 が現在の船首／先頭、末尾がいちばん古い） */
  nodes: TrailNode[];
  emitStrength: number;
  emitting: boolean;
  totalDistanceHulls: number;
  lastRight: Vec3;
  lastUp: Vec3;
  lastBack: Vec3;
}

export function createTrailState(): TrailState {
  return {
    nodes: [],
    emitStrength: 0,
    emitting: false,
    totalDistanceHulls: 0,
    lastRight: { x: 1, y: 0, z: 0 },
    lastUp: { x: 0, y: 1, z: 0 },
    lastBack: { x: 0, y: 0, z: 1 },
  };
}

/** 経過時間と強さから節の濃さ（0〜1）を返す */
export function nodeOpacity(node: TrailNode): number {
  if (node.strength <= 0.01 || node.age >= TRAIL_LIFETIME_S) return 0;
  const s = Math.pow(Math.min(1, node.strength), 0.6);
  return s * Math.pow(Math.max(0, 1 - node.age / TRAIL_LIFETIME_S), 1.35);
}

function rotateByQuat(q: Quat, v: Vec3): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w - iw * q.x - iy * q.z + iz * q.y,
    y: iy * q.w - iw * q.y - iz * q.x + ix * q.z,
    z: iz * q.w - iw * q.z - ix * q.y + iy * q.x,
  };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function norm3(v: Vec3, fallback: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-8 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { ...fallback };
}

function orthogonalBasis(back: Vec3, candRight: Vec3, candUp: Vec3): { right: Vec3; up: Vec3 } {
  const uDot = dot3(candUp, back);
  const uProj = { x: candUp.x - back.x * uDot, y: candUp.y - back.y * uDot, z: candUp.z - back.z * uDot };
  if (Math.hypot(uProj.x, uProj.y, uProj.z) > 1e-4) {
    const up = norm3(uProj, { x: 0, y: 1, z: 0 });
    const right = norm3(cross3(up, back), { x: 1, y: 0, z: 0 });
    return { right, up };
  }
  const rDot = dot3(candRight, back);
  const rProj = { x: candRight.x - back.x * rDot, y: candRight.y - back.y * rDot, z: candRight.z - back.z * rDot };
  if (Math.hypot(rProj.x, rProj.y, rProj.z) > 1e-4) {
    const right = norm3(rProj, { x: 1, y: 0, z: 0 });
    const up = norm3(cross3(back, right), { x: 0, y: 1, z: 0 });
    return { right, up };
  }
  const anyAxis = Math.abs(back.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const right = norm3(cross3(anyAxis, back), { x: 1, y: 0, z: 0 });
  const up = norm3(cross3(back, right), { x: 0, y: 1, z: 0 });
  return { right, up };
}

function cloneNode(n: TrailNode): TrailNode {
  return {
    pos: { ...n.pos },
    right: { ...n.right },
    up: { ...n.up },
    back: { ...n.back },
    age: n.age,
    strength: n.strength,
    distanceHulls: n.distanceHulls,
  };
}

/**
 * 1 ステップぶん軌道ノードを進める。描画や three.js から独立した純粋な計算。
 * `worldDisplacementKm` が渡され、船体長基準の移動より大きい場合は実空間の移動量をそのまま記録して
 * 他機が超高速で飛んだときの光の航跡を残す
 */
export function stepTrail(
  state: TrailState,
  velocityKmS: Vec3,
  strength: number,
  hullLengthKm: number,
  dt: number,
  orientation?: Quat,
  worldDisplacementKm?: Vec3,
): void {
  const stepDt = Math.min(Math.max(dt, 0), 0.1);
  if (stepDt <= 0 || hullLengthKm <= 0) return;

  const speed = Math.hypot(velocityKmS.x, velocityKmS.y, velocityKmS.z);
  const moving = speed > 0 && strength > 0.005;

  if (moving) {
    const wantBack = { x: -velocityKmS.x / speed, y: -velocityKmS.y / speed, z: -velocityKmS.z / speed };
    if (!state.emitting || state.nodes.length === 0) {
      state.lastBack = wantBack;
    } else {
      const k = 1 - Math.exp(-20 * stepDt);
      state.lastBack = norm3(
        {
          x: state.lastBack.x + (wantBack.x - state.lastBack.x) * k,
          y: state.lastBack.y + (wantBack.y - state.lastBack.y) * k,
          z: state.lastBack.z + (wantBack.z - state.lastBack.z) * k,
        },
        wantBack,
      );
    }
    const candRight = orientation ? rotateByQuat(orientation, { x: 1, y: 0, z: 0 }) : state.lastRight;
    const candUp = orientation ? rotateByQuat(orientation, { x: 0, y: 1, z: 0 }) : state.lastUp;
    const basis = orthogonalBasis(state.lastBack, candRight, candUp);
    state.lastRight = basis.right;
    state.lastUp = basis.up;
  }

  const travelHulls = (moving ? strength : 0) * FLOW_SPEED_HULLS_PER_S * stepDt;
  const travelKm = travelHulls * hullLengthKm;
  const worldLen = worldDisplacementKm ? Math.hypot(worldDisplacementKm.x, worldDisplacementKm.y, worldDisplacementKm.z) : 0;
  const useWorld = !!worldDisplacementKm && worldLen > travelKm && (speed > 0 || worldLen <= hullLengthKm * 10);

  let shiftX: number;
  let shiftY: number;
  let shiftZ: number;
  if (useWorld && worldDisplacementKm) {
    shiftX = -worldDisplacementKm.x;
    shiftY = -worldDisplacementKm.y;
    shiftZ = -worldDisplacementKm.z;
  } else {
    const dirBack = moving ? { x: -velocityKmS.x / speed, y: -velocityKmS.y / speed, z: -velocityKmS.z / speed } : state.lastBack;
    shiftX = dirBack.x * travelKm;
    shiftY = dirBack.y * travelKm;
    shiftZ = dirBack.z * travelKm;
  }

  for (let i = 0; i < state.nodes.length; i++) {
    const node = state.nodes[i];
    const pinnedHead = state.emitting && i === 0 && strength > 0.01;
    if (!pinnedHead) node.age += stepDt;
    const exhaust = node.strength * EXHAUST_DRIFT_HULLS_PER_S * hullLengthKm * Math.exp(-node.age * 0.7) * stepDt;
    node.pos.x += shiftX + node.back.x * exhaust;
    node.pos.y += shiftY + node.back.y * exhaust;
    node.pos.z += shiftZ + node.back.z * exhaust;
  }

  while (state.nodes.length > 0 && state.nodes[state.nodes.length - 1].age >= TRAIL_LIFETIME_S) {
    state.nodes.pop();
  }
  while (state.nodes.length > 0 && state.nodes[state.nodes.length - 1].strength === 0) {
    state.nodes.pop();
  }

  const rate = strength >= state.emitStrength ? 16 : 5;
  state.emitStrength += (strength - state.emitStrength) * (1 - Math.exp(-rate * stepDt));

  const activeEmit = speed > 0 && (strength > 0.01 || state.emitStrength > 0.02);
  if (activeEmit) {
    // GPU の UV (float32) 精度が落ちないようノイズ用の距離増分は抑える
    const distInc = useWorld ? Math.min(worldLen / hullLengthKm, 80 * stepDt) : travelHulls;
    state.totalDistanceHulls = (state.totalDistanceHulls + distInc + state.emitStrength * EXHAUST_DRIFT_HULLS_PER_S * stepDt) % 1024;
    if (!state.emitting) {
      if (state.nodes.length > 0) {
        const oldFront = state.nodes[0];
        const breakOld = cloneNode(oldFront);
        breakOld.strength = 0;
        const breakNew: TrailNode = {
          pos: { x: 0, y: 0, z: 0 },
          right: { ...state.lastRight },
          up: { ...state.lastUp },
          back: { ...state.lastBack },
          age: 0,
          strength: 0,
          distanceHulls: state.totalDistanceHulls,
        };
        state.nodes.unshift(breakNew, breakOld);
      }
      const head: TrailNode = {
        pos: { x: 0, y: 0, z: 0 },
        right: { ...state.lastRight },
        up: { ...state.lastUp },
        back: { ...state.lastBack },
        age: 0,
        strength: state.emitStrength,
        distanceHulls: state.totalDistanceHulls,
      };
      state.nodes.unshift(head, cloneNode(head));
      state.emitting = true;
    } else {
      const head = state.nodes[0];
      head.pos.x = 0;
      head.pos.y = 0;
      head.pos.z = 0;
      head.age = 0;
      head.strength = state.emitStrength;
      head.right = { ...state.lastRight };
      head.up = { ...state.lastUp };
      head.back = { ...state.lastBack };
      head.distanceHulls = state.totalDistanceHulls;

      const prev = state.nodes[1];
      if (!prev || Math.hypot(prev.pos.x, prev.pos.y, prev.pos.z) >= MIN_NODE_SPACING_HULLS * hullLengthKm || prev.age >= MAX_NODE_INTERVAL_S) {
        state.nodes.splice(1, 0, cloneNode(head));
      }
    }
    while (state.nodes.length > MAX_TRAIL_NODES) state.nodes.pop();
  } else {
    state.emitting = false;
    state.emitStrength = 0;
  }
}

function curveTangent(nodes: readonly TrailNode[], i: number): Vec3 {
  const n = nodes.length;
  const cur = nodes[i];
  const prev = i > 0 && nodes[i - 1].strength > 0 ? nodes[i - 1] : null;
  const next = i + 1 < n && nodes[i + 1].strength > 0 ? nodes[i + 1] : null;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  if (prev && next) {
    dx = next.pos.x - prev.pos.x;
    dy = next.pos.y - prev.pos.y;
    dz = next.pos.z - prev.pos.z;
  } else if (next) {
    dx = next.pos.x - cur.pos.x;
    dy = next.pos.y - cur.pos.y;
    dz = next.pos.z - cur.pos.z;
  } else if (prev) {
    dx = cur.pos.x - prev.pos.x;
    dy = cur.pos.y - prev.pos.y;
    dz = cur.pos.z - prev.pos.z;
  }
  const len = Math.hypot(dx, dy, dz);
  return len > 1e-9 ? { x: dx / len, y: dy / len, z: dz / len } : cur.back;
}

function buildStaticIndices(): Uint16Array {
  let quadCount = 0;
  for (const r of RADIALS) quadCount += (MAX_TRAIL_NODES - 1) * r;
  const indices = new Uint16Array(quadCount * 6);
  let p = 0;
  for (let i = 0; i < MAX_TRAIL_NODES - 1; i++) {
    let tubeOffset = 0;
    for (const r of RADIALS) {
      const baseA = i * VERTS_PER_SLICE + tubeOffset;
      const baseB = (i + 1) * VERTS_PER_SLICE + tubeOffset;
      for (let j = 0; j < r; j++) {
        const a = baseA + j;
        const b = baseA + j + 1;
        const c = baseB + j;
        const d = baseB + j + 1;
        indices[p++] = a;
        indices[p++] = c;
        indices[p++] = b;
        indices[p++] = b;
        indices[p++] = c;
        indices[p++] = d;
      }
      tubeOffset += r + 1;
    }
  }
  return indices;
}

const STATIC_INDICES = buildStaticIndices();

export interface VaporUpdateOptions {
  /** 他機の実空間でのフレーム間移動量（km・EQJ） */
  worldDisplacementKm?: Vec3;
  /** 他機の描画か（遠方でも細い光跡が見えるよう画面幅最低サイズと遠方圧縮を有効にする） */
  isOtherShip?: boolean;
  /** 現在の画面の高さ ÷ 2 ÷ tan(FOV/2) */
  pxPerRadian?: number;
}

export class VaporTrail {
  readonly mesh: THREE.Mesh;
  readonly state = createTrailState();
  private profile: VaporProfile = SAUCER_PROFILE;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicNodeMaterial;
  private readonly positions = new Float32Array(MAX_TRAIL_NODES * VERTS_PER_SLICE * 3);
  private readonly normals = new Float32Array(MAX_TRAIL_NODES * VERTS_PER_SLICE * 3);
  private readonly colors = new Float32Array(MAX_TRAIL_NODES * VERTS_PER_SLICE * 3);
  private readonly uvs = new Float32Array(MAX_TRAIL_NODES * VERTS_PER_SLICE * 2);
  private readonly posAttr = new THREE.BufferAttribute(this.positions, 3);
  private readonly normAttr = new THREE.BufferAttribute(this.normals, 3);
  private readonly colorAttr = new THREE.BufferAttribute(this.colors, 3);
  private readonly uvAttr = new THREE.BufferAttribute(this.uvs, 2);

  constructor() {
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.normAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.uvAttr.setUsage(THREE.DynamicDrawUsage);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', this.posAttr);
    g.setAttribute('normal', this.normAttr);
    g.setAttribute('color', this.colorAttr);
    g.setAttribute('uv', this.uvAttr);
    g.setIndex(new THREE.BufferAttribute(STATIC_INDICES, 1));
    this.geometry = g;

    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    const soft = abs(dot(normalView, positionView.negate().normalize())).pow(1.45);
    const u = uv();
    const wisps = mx_noise_float(vec3(u.x.mul(1.7), u.y.mul(3.8).sub(time.mul(0.65)), u.x.mul(0.85).add(time.mul(0.35))))
      .mul(0.45)
      .add(0.78)
      .max(0.2);
    m.colorNode = vertexColor().mul(soft).mul(wisps);
    this.material = m;

    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'vapor-trail';
  }

  /** 船の形に応じたベイパーの設定を切り替える */
  setProfile(profile: VaporProfile): void {
    this.profile = profile;
  }

  /**
   * 毎フレーム呼ぶ。position は船の位置（描く場面の座標）、velocity は船の速度、strength は trailStrength の値
   */
  update(
    position: Vec3,
    velocity: Vec3,
    strength: number,
    hullLengthKm: number,
    dt: number,
    orientation?: Quat,
    options?: VaporUpdateOptions,
  ): void {
    stepTrail(this.state, velocity, strength, hullLengthKm, dt, orientation, options?.worldDisplacementKm);
    const nodes = this.state.nodes;
    if (nodes.length < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const isOther = options?.isOtherShip === true;
    // 他機の高速光跡では倍精度の圧縮計算をそのまま GPU に渡すため mesh 原点をカメラ原点 (0,0,0) に置く
    if (isOther) this.mesh.position.set(0, 0, 0);
    else this.mesh.position.set(position.x, position.y, position.z);
    this.rebuildGeometry(nodes, hullLengthKm, position, isOther, options?.pxPerRadian ?? 700);
  }

  private rebuildGeometry(
    nodes: readonly TrailNode[],
    L: number,
    shipRelKm: Vec3,
    isOther: boolean,
    pxPerRadian: number,
  ): void {
    const activeCount = Math.min(nodes.length, MAX_TRAIL_NODES);
    const tubes = this.profile.tubes;
    const streakCol = this.profile.streakColor;
    let tailX = 0;
    let tailY = 0;
    let tailZ = 0;

    for (let i = 0; i < activeCount; i++) {
      const node = nodes[i];
      const ageRatio = Math.min(1, Math.max(0, node.age / TRAIL_LIFETIME_S));
      const distFromHeadHulls = Math.hypot(node.pos.x, node.pos.y, node.pos.z) / Math.max(L, 1e-9);
      const isTailCap = i === activeCount - 1 || node.strength <= 0.01;
      const headRamp = this.state.emitting && i === 0 ? 0.28 : Math.min(1, 0.28 + 0.72 * (distFromHeadHulls / 0.35));
      const baseAlpha = nodeOpacity(node);
      const alpha = isTailCap ? 0 : baseAlpha * headRamp;
      const scale = isTailCap ? 0 : Math.max(0.25, Math.min(1.15, 0.45 + 0.55 * node.strength));

      // 描画用の基準位置（他機は観測者からの実位置へ変換し、極めて遠い点だけ far 面内へ圧縮する）
      let baseX = node.pos.x;
      let baseY = node.pos.y;
      let baseZ = node.pos.z;
      let r1px = 0;
      let distantView = false;
      let viewX = 0;
      let viewY = 0;
      let viewZ = -1;

      if (isOther) {
        const wx = shipRelKm.x + node.pos.x;
        const wy = shipRelKm.y + node.pos.y;
        const wz = shipRelKm.z + node.pos.z;
        const dTrue = Math.hypot(wx, wy, wz);
        let dRender = dTrue;
        if (dTrue > 1e6) {
          dRender = (dTrue * FAR_COMPRESS_KM) / (dTrue + FAR_COMPRESS_KM);
          const ratio = dRender / dTrue;
          baseX = wx * ratio;
          baseY = wy * ratio;
          baseZ = wz * ratio;
        } else {
          baseX = wx;
          baseY = wy;
          baseZ = wz;
        }
        r1px = dRender / Math.max(pxPerRadian, 100);
        distantView = r1px > L * 0.2;
        if (dRender > 1e-9) {
          viewX = baseX / dRender;
          viewY = baseY / dRender;
          viewZ = baseZ / dRender;
        }
      }

      const tan = curveTangent(nodes, i);
      let right: Vec3;
      let up: Vec3;
      if (distantView) {
        const side = cross3({ x: viewX, y: viewY, z: viewZ }, tan);
        if (Math.hypot(side.x, side.y, side.z) > 1e-4) {
          right = norm3(side, node.right);
          up = norm3(cross3(tan, right), node.up);
        } else {
          const b = orthogonalBasis(tan, node.right, node.up);
          right = b.right;
          up = b.up;
        }
      } else {
        const b = orthogonalBasis(tan, node.right, node.up);
        right = b.right;
        up = b.up;
      }

      if (i === activeCount - 1) {
        tailX = baseX;
        tailY = baseY;
        tailZ = baseZ;
      }

      // 遠方での最低スクリーン視認性（流れ星・航跡として見える太さ）
      const streakWeight = distantView ? Math.min(1, (r1px - L * 0.2) / Math.max(L * 0.8, 1e-6)) : 0;
      const streakEnv = isTailCap ? 0 : Math.min(1, baseAlpha * 1.4) * Math.max(0.15, 1 - ageRatio * 0.65);

      let vBase = i * VERTS_PER_SLICE;
      for (let tIdx = 0; tIdx < 4; tIdx++) {
        const t = tubes[tIdx];
        const cx =
          baseX +
          right.x * ((t.xRatio + t.convergeXRatio * ageRatio) * L) +
          up.x * ((t.yRatio + t.convergeYRatio * ageRatio) * L) +
          node.back.x * (t.backRatio * L);
        const cy =
          baseY +
          right.y * ((t.xRatio + t.convergeXRatio * ageRatio) * L) +
          up.y * ((t.yRatio + t.convergeYRatio * ageRatio) * L) +
          node.back.y * (t.backRatio * L);
        const cz =
          baseZ +
          right.z * ((t.xRatio + t.convergeXRatio * ageRatio) * L) +
          up.z * ((t.yRatio + t.convergeYRatio * ageRatio) * L) +
          node.back.z * (t.backRatio * L);

        const expTerm = tIdx === 0 ? Math.pow(ageRatio, 0.65) : ageRatio;
        const physR = isTailCap ? 0 : L * Math.max(0.002, t.baseRadiusRatio + t.expandRadiusRatio * expTerm) * scale;
        let rx = physR * t.aspectX;
        let ry = physR * t.aspectY;

        let tAlpha = alpha * Math.pow(Math.max(0, 1 - ageRatio * t.fadeScale), t.fadePower) * t.opacity;
        let rCol = t.colorHead[0] + (t.colorTail[0] - t.colorHead[0]) * ageRatio;
        let gCol = t.colorHead[1] + (t.colorTail[1] - t.colorHead[1]) * ageRatio;
        let bCol = t.colorHead[2] + (t.colorTail[2] - t.colorHead[2]) * ageRatio;

        if (streakWeight > 0) {
          if (tIdx === 0) {
            const minR = 4.2 * r1px * streakEnv;
            if (minR > rx) {
              rx = minR;
              ry = minR;
              const sA = Math.max(tAlpha, streakEnv * 0.52 * streakWeight);
              tAlpha = sA;
              rCol = rCol * (1 - streakWeight) + streakCol[0] * streakWeight;
              gCol = gCol * (1 - streakWeight) + streakCol[1] * streakWeight;
              bCol = bCol * (1 - streakWeight) + streakCol[2] * streakWeight;
            }
          } else if (tIdx === 1) {
            const minR = 1.7 * r1px * streakEnv;
            if (minR > rx) {
              rx = minR;
              ry = minR;
              tAlpha = Math.max(tAlpha, streakEnv * 0.95 * streakWeight);
            }
          } else {
            // 遠方では翼端のサブピクセル細線は中心光跡に溶け込ませて描画ノイズを出さない
            tAlpha *= 1 - streakWeight;
          }
        }

        this.writeRing(
          vBase,
          tIdx,
          cx,
          cy,
          cz,
          right,
          up,
          rx,
          ry,
          rCol * tAlpha,
          gCol * tAlpha,
          bCol * tAlpha,
          node.distanceHulls,
          ageRatio,
        );
        vBase += RADIALS[tIdx] + 1;
      }
    }

    // 未使用スライスは末尾の位置・黒色で埋める
    for (let i = activeCount; i < MAX_TRAIL_NODES; i++) {
      const start = i * VERTS_PER_SLICE;
      for (let k = 0; k < VERTS_PER_SLICE; k++) {
        const v3 = (start + k) * 3;
        const v2 = (start + k) * 2;
        this.positions[v3] = tailX;
        this.positions[v3 + 1] = tailY;
        this.positions[v3 + 2] = tailZ;
        this.normals[v3] = 0;
        this.normals[v3 + 1] = 1;
        this.normals[v3 + 2] = 0;
        this.colors[v3] = 0;
        this.colors[v3 + 1] = 0;
        this.colors[v3 + 2] = 0;
        this.uvs[v2] = 0;
        this.uvs[v2 + 1] = 1;
      }
    }

    this.posAttr.needsUpdate = true;
    this.normAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
  }

  private writeRing(
    vertexStart: number,
    tubeIdx: number,
    cx: number,
    cy: number,
    cz: number,
    right: Vec3,
    up: Vec3,
    rx: number,
    ry: number,
    cr: number,
    cg: number,
    cb: number,
    uX: number,
    uY: number,
  ): void {
    const r = RADIALS[tubeIdx];
    const { cos, sin } = TRIG[tubeIdx];
    for (let j = 0; j <= r; j++) {
      const c = cos[j];
      const s = sin[j];
      const nx = right.x * c + up.x * s;
      const ny = right.y * c + up.y * s;
      const nz = right.z * c + up.z * s;
      const vi = vertexStart + j;
      const v3 = vi * 3;
      const v2 = vi * 2;
      this.positions[v3] = cx + right.x * (c * rx) + up.x * (s * ry);
      this.positions[v3 + 1] = cy + right.y * (c * rx) + up.y * (s * ry);
      this.positions[v3 + 2] = cz + right.z * (c * rx) + up.z * (s * ry);
      this.normals[v3] = nx;
      this.normals[v3 + 1] = ny;
      this.normals[v3 + 2] = nz;
      this.colors[v3] = cr;
      this.colors[v3 + 1] = cg;
      this.colors[v3 + 2] = cb;
      this.uvs[v2] = uX;
      this.uvs[v2 + 1] = uY;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
