/**
 * スキャン（訪れた判定。2026-11-22 にオーナーの指示）をつなぐところ。
 * 計算は src/world/scan.ts、光は src/render/scan-beam.ts、表示はレーダーの上の「SCAN: OK」（Hud.tsx の ScanStatus）。
 * 決まりは docs/product/scan.md
 */
import type { InfoTarget } from '../world/info';
import { findBody, heliocentricPositionKm } from '../world/solar-system';
import {
  SCAN_IDLE,
  inScanRange,
  markAlready,
  scanProgress,
  startScan,
  stepScan,
  type ScanState,
} from '../world/scan';
import { sub, type Vec3 } from '../world/vec';
import type { ScanBeam } from '../render/scan-beam';
import type { InfoController } from './info-controller';
import { hudStore, showNotice, type ScanHud } from './hud-store';

export interface ScanFrame {
  nowMs: number;
  date: Date;
  /** 自分の位置（太陽中心 km） */
  abs: Vec3;
  /** カメラの前・上の向き（単位ベクトル） */
  forward: Vec3;
  up: Vec3;
  /** いまの視点（一人称・後ろから・前から） */
  view: string;
  /** 画面の 1 ラジアンの画素の数（CSS の px。光の線の太さを画面の画素にそろえるため） */
  pxPerRad: number;
}

export class ScanController {
  private state: ScanState = SCAN_IDLE;
  private target: InfoTarget | null = null;
  /** スキャンを始めたときの画面の上（光はこの向きの上から下へ動く） */
  private up: Vec3 = { x: 0, y: 0, z: 1 };
  private available = false;

  constructor(
    private readonly info: InfoController,
    private readonly beam: ScanBeam,
  ) {}

  /** 押した天体がスキャンできる範囲にあれば、スキャンを始める。始めたら true */
  tryStart(t: InfoTarget, f: Omit<ScanFrame, 'date' | 'abs' | 'pxPerRad'>): boolean {
    if (this.state.phase === 'scanning' || !this.info.canScan(t)) return false;
    this.state = startScan(this.state, t.key, f.nowMs, f.forward, f.view);
    this.target = t;
    this.up = f.up;
    this.publish(f.nowMs);
    return true;
  }

  /** 毎フレーム：スキャンを進め、光を動かす */
  frame(f: ScanFrame): void {
    const t = this.target;
    // 天体の位置は毎フレーム計算し直す（相手の一覧は 1 秒に 10 回しか入れ直さないので、光が揺れないように）
    const centerKm = t && findBody(t.key) ? heliocentricPositionKm(t.key, f.date) : (t?.positionKm ?? null);
    const inRange = t !== null && centerKm !== null && inScanRange({ positionKm: centerKm, radiusKm: t.radiusKm }, f.abs);
    const prevPhase = this.state.phase;
    const { state, event } = stepScan(this.state, { nowMs: f.nowMs, forward: f.forward, view: f.view, inRange });
    this.state = state;
    if (event === 'success' && t) {
      const first = this.info.completeScan(t, f.nowMs);
      // もうコレクションにある天体は、SUCCESS の代わりに ALREADY（お知らせは出さない。2026-11-22 にオーナーの指示）
      if (!first) this.state = markAlready(this.state);
      if (first) showNotice(`${t.name}をスキャンして、コレクションに入れました`);
    }
    if (state.phase === 'scanning' && t && centerKm && t.radiusKm) {
      this.beam.show({ x: 0, y: 0, z: 0 }, sub(centerKm, f.abs), t.radiusKm, this.up, scanProgress(state, f.nowMs), f.nowMs, f.pxPerRad);
    } else {
      this.beam.hide();
      if (state.phase === 'idle') this.target = null;
    }
    if (prevPhase !== state.phase || state.phase === 'scanning') this.publish(f.nowMs);
  }

  /** 1 秒に 10 回：スキャンできる天体が範囲にあるか（OK が光るか） */
  updateAvailability(): void {
    const available = this.info.scannable() !== null;
    if (available === this.available) return;
    this.available = available;
    this.publish(performance.now());
  }

  private publish(nowMs: number): void {
    const next: ScanHud = {
      available: this.available,
      phase: this.state.phase,
      // 5% ずつ（毎フレーム画面を作り直さないように）
      percent: Math.floor(scanProgress(this.state, nowMs) * 20) * 5,
    };
    const prev = hudStore.get().scan;
    if (prev.available !== next.available || prev.phase !== next.phase || prev.percent !== next.percent) hudStore.set({ scan: next });
  }
}
