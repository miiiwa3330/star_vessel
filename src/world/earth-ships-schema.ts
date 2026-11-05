/**
 * タイトル画面の背景に出す、地球のまわりの船（要件 F48・F53）のやりとりの形と確かめ方。
 * サーバー（worker/）とブラウザの両方で使う。three.js・DOM・astronomy-engine を読み込まない。
 * 計算は src/world/earth-ships.ts（サーバー）。決まりは docs/tech/server.md の「地球のまわりの船」。
 *
 * ログイン不要で誰でも読めるので、出すのは「位置・速度・色」だけ。アカウントの ID は出さない。
 * 船の短い ID は、接続ごとに作った 8 文字（宇宙の部屋で、近くのプレイヤーにも配っているもの）
 */
import type { Vec3 } from './vec';

/** 地球の中心からこの距離（km）より近い船だけを出す（月までの距離の約 2.6 倍） */
export const SHOWCASE_RADIUS_KM = 1_000_000;
/** 1 回に返す船の数の上限（地球に近い順） */
export const MAX_SHOWCASE_SHIPS = 24;
/** サーバーとブラウザが、読み直す間隔（ms）。サーバーはこの間、同じ答えを覚えておく */
export const SHOWCASE_REFRESH_MS = 2_000;

export interface EarthShip {
  /** 接続ごとの短い ID（アカウントの ID ではない） */
  id: string;
  /** 船の色（色相 0〜359） */
  hue: number;
  /** 地球の中心からの位置（km・EQJ）。now の時刻のもの */
  position: Vec3;
  /** 地球に対する速度（km/s・EQJ）。次に読み直すまでの位置を、ブラウザが予測するのに使う */
  velocity: Vec3;
}

export interface EarthShipsSnapshot {
  /** この位置の時刻（ms・サーバーの時計） */
  now: number;
  ships: EarthShip[];
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isVec = (v: unknown): v is Vec3 => {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && finite(o.x) && finite(o.y) && finite(o.z);
};

/** サーバーから受け取ったものとして正しいか（ブラウザは、受け取ったものを確かめてから使う） */
export function isEarthShipsSnapshot(v: unknown): v is EarthShipsSnapshot {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!finite(o.now) || !Array.isArray(o.ships) || o.ships.length > MAX_SHOWCASE_SHIPS) return false;
  return o.ships.every((s) => {
    const e = s as Record<string, unknown> | null;
    return (
      !!e &&
      typeof e.id === 'string' &&
      e.id.length > 0 &&
      e.id.length <= 32 &&
      finite(e.hue) &&
      isVec(e.position) &&
      isVec(e.velocity)
    );
  });
}
