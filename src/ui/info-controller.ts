/**
 * 天体の情報（要件 F35〜F38）をつなぐところ：近くの天体の一覧、照準の先・選んだ天体・近づいた天体の情報のカード、
 * 選んだ天体の印、訪れた天体のコレクション。計算は src/world/info.ts、表示は InfoCard・NearbyPanel・CollectionPanel。
 * 決まりは docs/product/info-and-collection.md
 */
import * as THREE from 'three/webgpu';
import {
  bodyKind,
  clusterKey,
  describeBody,
  describeCluster,
  describeGalaxy,
  describeNebula,
  galaxyKey,
  nebulaKey,
  describeHost,
  nearestStars,
  pickAimed,
  starKey,
  type InfoTarget,
} from '../world/info';
import { allBodies, findBody, heliocentricPositionKm, type BodyInfo } from '../world/solar-system';
import { clusterLabel, nearbyClusters, type Cluster } from '../world/clusters';
import { insideOf, nebulaLabel, prominent, type Nebula } from '../world/nebulae';
import { galaxyLabel, type Galaxy } from '../world/galaxies';
import type { StarSystems } from '../world/star-systems';
import { STAR_STRIDE } from '../world/stars';
import { KM_PER_PC } from '../world/units';
import { length, sub, type Vec3 } from '../world/vec';
import type { Visit, VisitInput } from '../world/visits';
import { visitApi } from '../net/visit-repository';
import { formatDistance } from './format';
import { hudActions, hudStore, type InfoCardState } from './hud-store';
import { TargetMarker } from './target-marker';
import { bodyAddress } from '../world/address';

/** 近づいたときのカードを出しておく時間 */
const NEAR_CARD_MS = 8_000;
/** 近くの恒星・星団を探し直す間隔（星は 10 万個以上あるので、毎回は探さない） */
const FAR_SEARCH_MS = 2_000;
/** 選べるように探しておく、近くの恒星・星団などの数（照準の先・クリックで選ぶ相手） */
const LIST_SIZE = { stars: 8, clusters: 5, nebulae: 5, galaxies: 5 };
/** クリック・タップで選べる、画面の上での距離（CSS ピクセル） */
const TAP_RADIUS_PX = 40;

interface Deps {
  ui: HTMLElement;
  camera: THREE.PerspectiveCamera;
  systems: StarSystems;
  /** 星のデータ。Gaia の星を読み込むと data が大きくなるので、入れ物ごと持つ */
  stars: { data: Float32Array };
  extraStars: readonly { position: Vec3; system: string }[];
  clusters: readonly Cluster[];
  nebulae: readonly Nebula[];
  galaxies: readonly Galaxy[];
  /** 自分の見ている向きの方を向く（その方を向くボタン） */
  face: (relKm: Vec3) => void;
  /** 恒星の名前（固有名のある恒星。src/world/star-info.ts）。無ければ null */
  starName?: (system: string) => string | null;
}

export class InfoController {
  private readonly marker: TargetMarker;
  /** 近くの恒星・星団（FAR_SEARCH_MS ごとに探し直す） */
  private far: InfoTarget[] = [];
  private lastFarSearch = -Infinity;
  /** いま情報を出せる相手（天体の位置は毎回入れ直す） */
  private targets: InfoTarget[] = [];
  private selected: InfoTarget | null = null;
  private near: { target: InfoTarget; until: number; firstVisit: boolean } | null = null;
  private readonly visited = new Set<string>();
  private loaded = false;
  private readonly pending: VisitInput[] = [];
  private online = false;
  private last: { anchor: string; system: string; cluster: string | null; deep: string | null } | null = null;
  /** 中にいる星雲・銀河（FAR_SEARCH_MS ごとに調べる） */
  private inside: InfoTarget | null = null;
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor(private readonly deps: Deps) {
    this.marker = new TargetMarker(deps.ui);
    hudActions.selectTarget = (key) => {
      this.selected = key ? (this.targets.find((t) => t.key === key) ?? null) : null;
      // 天体を選ぶと、選んでいたワープホールはやめる（カードはどちらか一方）
      hudStore.set({ selectedKey: this.selected?.key ?? null, ...(this.selected ? { selectedWarp: null } : {}) });
    };
    hudActions.faceTarget = () => {
      if (this.selected) this.deps.face(sub(this.selected.positionKm, this.observer));
    };
  }

  private observer: Vec3 = { x: 0, y: 0, z: 0 };

  /** サーバーにつながったら、これまでのコレクションを読む */
  async connect(): Promise<void> {
    this.online = true;
    try {
      const list = await visitApi.list();
      const merged = new Map<string, Visit>(list.map((v) => [v.key, v]));
      for (const v of hudStore.get().visits) if (!merged.has(v.key)) merged.set(v.key, v);
      for (const k of merged.keys()) this.visited.add(k);
      hudStore.set({ visits: [...merged.values()].sort((a, b) => a.firstAt.localeCompare(b.firstAt)) });
    } catch (e) {
      console.error(e);
    }
    this.loaded = true;
    // 読み込む前に訪れたものを送る
    for (const v of this.pending.splice(0)) this.send(v);
  }

  /** クリック・タップした場所の近くの相手を選ぶ。何も無ければ何もしない */
  tap(x: number, y: number, w: number, h: number): void {
    let best: InfoTarget | null = null;
    let bestD = Infinity;
    const pxPerRad = h / 2 / Math.tan((this.deps.camera.fov * Math.PI) / 360);
    for (const t of this.targets) {
      const p = this.project(t.positionKm);
      if (!p.inFront) continue;
      const sx = ((p.ndc.x + 1) / 2) * w;
      const sy = ((1 - p.ndc.y) / 2) * h;
      const radiusPx = t.radiusKm ? (t.radiusKm / Math.max(p.distanceKm, 1e-9)) * pxPerRad : 0;
      const d = Math.hypot(sx - x, sy - y) - radiusPx;
      if (d < Math.max(TAP_RADIUS_PX - radiusPx, 0) + 1e-9 && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      this.selected = best;
      hudStore.set({ selectedKey: best.key, selectedWarp: null });
    }
  }

  /** 1 秒に 10 回。相手の一覧・カード・コレクションを更新する */
  updateHud(nowMs: number, abs: Vec3, date: Date, anchor: string, cluster: Cluster | null, forward: Vec3, blocked: boolean): void {
    this.observer = abs;
    const pc = { x: abs.x / KM_PER_PC, y: abs.y / KM_PER_PC, z: abs.z / KM_PER_PC };
    if (nowMs - this.lastFarSearch > FAR_SEARCH_MS) {
      this.lastFarSearch = nowMs;
      this.far = this.searchFar(pc);
      const neb = insideOf(this.deps.nebulae, pc);
      const gal = insideOf(this.deps.galaxies, pc);
      this.inside = neb ? this.nebulaTarget(neb) : gal ? this.galaxyTarget(gal) : null;
      // 左上の表示は英語（星雲・銀河の英語の名前はカタログの名前）
      const insideEn = neb ? `Nebula: ${neb.name.replace(/^NAME /, '')}` : gal ? `Galaxy: ${gal.name}` : null;
      hudStore.set({ deepRegion: insideEn });
    }
    const bodies = allBodies()
      // 恒星は、恒星の一覧（far）の方で出す。太陽系の外の恒星の天体は同じ記号なので、天体の方を優先する
      .map((b) => this.bodyTarget(b, date));
    const bodyKeys = new Set(bodies.map((t) => t.key));
    this.targets = [...bodies, ...this.far.filter((t) => !bodyKeys.has(t.key))];
    if (this.selected) {
      const key = this.selected.key;
      this.selected = this.targets.find((t) => t.key === key) ?? this.selected;
    }

    // 近づいたとき（要件 F37）：基準の天体が変わった・恒星系に入った・星団に入った
    const sys = this.deps.systems.currentSystem;
    const now = { anchor, system: sys, cluster: cluster ? clusterKey(cluster) : null, deep: this.inside?.key ?? null };
    if (!this.last) {
      // 起動したときにいる場所は、カードを出さずに記録だけする
      this.record(this.bodyTarget(findBody(anchor) ?? findBody('Sun')!, date));
      const star = this.starTarget(sys);
      if (star) this.record(star);
    } else {
      const hits: InfoTarget[] = [];
      if (now.system !== this.last.system) {
        const star = this.starTarget(now.system);
        if (star) hits.push(star);
      }
      if (now.anchor !== this.last.anchor && now.anchor !== 'Sun' && !now.anchor.endsWith('.0')) {
        const b = findBody(now.anchor);
        if (b) hits.push(this.bodyTarget(b, date));
      }
      if (now.cluster && now.cluster !== this.last.cluster && cluster) hits.push(this.clusterTarget(cluster));
      if (now.deep && now.deep !== this.last.deep && this.inside) hits.push(this.inside);
      // いちばん近いもの（あとに足したもの）をカードに出す。どれも記録する
      for (const t of hits) {
        const first = this.record(t);
        this.near = { target: t, until: nowMs + NEAR_CARD_MS, firstVisit: first };
      }
    }
    this.last = now;
    if (this.near && nowMs > this.near.until) this.near = null;

    // カード：選んだ天体 → 近づいた天体。照準の先は、照準の下に 1 行だけ
    let card: InfoCardState | null = null;
    if (this.selected) card = this.card(this.selected, 'selected', false);
    else if (this.near) card = this.card(this.near.target, 'near', this.near.firstVisit);
    const aimed = blocked ? null : pickAimed(this.targets, abs, forward);
    const aimLabel = aimed ? { name: aimed.name, distance: formatDistance(length(sub(aimed.positionKm, abs))) } : null;
    const prev = hudStore.get();
    const patch: Partial<typeof prev> = {};
    if (!sameCard(prev.infoCard, card)) patch.infoCard = blocked ? null : card;
    if (prev.aimLabel?.name !== aimLabel?.name || prev.aimLabel?.distance !== aimLabel?.distance) patch.aimLabel = aimLabel;
    if (Object.keys(patch).length > 0) hudStore.set(patch);
  }

  private deepOf(key: string): InfoTarget | null {
    if (key.startsWith('C:')) {
      const c = this.deps.clusters.find((x) => clusterKey(x) === key);
      return c ? this.clusterTarget(c) : null;
    }
    if (key.startsWith('N:')) {
      const n = this.deps.nebulae.find((x) => nebulaKey(x) === key);
      return n ? this.nebulaTarget(n) : null;
    }
    if (key.startsWith('Y:')) {
      const g = this.deps.galaxies.find((x) => galaxyKey(x) === key);
      return g ? this.galaxyTarget(g) : null;
    }
    return null;
  }

  /**
   * 訪れた場所の、いまの位置（太陽中心 km。3D のマップ・要件 F62）。分からなければ null
   * （いまは近くにない小さな小惑星・彗星など。天体の一覧に入っていないため）。
   * ほかの恒星系の惑星・衛星は、その恒星の位置にする（マップの上では、恒星系の中の違いは見分けられないほど小さい）
   */
  locate(key: string, date: Date): Vec3 | null {
    if (key === 'Sun') return { x: 0, y: 0, z: 0 };
    const deep = this.deepOf(key);
    if (deep) return deep.positionKm;
    if (key.endsWith('.0')) return this.starTarget(key.slice(0, -2))?.positionKm ?? null;
    if (findBody(key)) return heliocentricPositionKm(key, date);
    const system = bodyAddress(key)?.system;
    if (system && system !== 'SOL') return this.starTarget(system)?.positionKm ?? null;
    return null;
  }

  /** 近くの恒星（白色矮星などの燃えかすも。レーダーに出す。FAR_SEARCH_MS ごとに探し直したもの） */
  nearStars(): readonly { key: string; name: string; positionKm: Vec3 }[] {
    return this.far.filter((t) => t.kind !== 'cluster' && t.kind !== 'nebula' && t.kind !== 'galaxy');
  }

  /** 毎フレーム：選んだ天体の印を動かす */
  updateMarker(w: number, h: number, hidden: boolean): void {
    if (!this.selected || hidden) {
      this.marker.hide();
      return;
    }
    const p = this.project(this.selected.positionKm);
    this.marker.show(p.ndc, p.inFront, w, h);
  }

  /** 太陽中心の位置を、画面の座標（−1〜1）に。カメラの後ろなら inFront が false */
  private project(positionKm: Vec3): { ndc: { x: number; y: number }; inFront: boolean; distanceKm: number } {
    const cam = this.deps.camera;
    // 自分（船）が原点。カメラは船からの相対位置にいる
    const rel = sub(sub(positionKm, this.observer), cam.position);
    const d = length(rel);
    this.v.set(rel.x / d, rel.y / d, rel.z / d).applyQuaternion(this.q.copy(cam.quaternion).invert());
    const inFront = this.v.z < 0;
    const t = Math.tan((cam.fov * Math.PI) / 360);
    const z = Math.max(Math.abs(this.v.z), 1e-6);
    return { ndc: { x: this.v.x / z / t / cam.aspect, y: this.v.y / z / t }, inFront, distanceKm: d };
  }

  private bodyTarget(b: BodyInfo, date: Date): InfoTarget {
    const parent = b.parent ? findBody(b.parent) : null;
    return {
      key: b.id,
      name: b.nameJa || b.id,
      kind: bodyKind(b),
      positionKm: heliocentricPositionKm(b.id, date),
      radiusKm: b.radiusKm,
      details: () =>
        b.kind === 'star' && b.id !== 'Sun' ? this.starTarget(b.id.slice(0, -2))?.details() ?? describeBody(b, null) : describeBody(b, parent?.nameJa ?? null),
    };
  }

  private starTarget(system: string): InfoTarget | null {
    if (system === 'SOL') {
      const sun = findBody('Sun');
      if (!sun) return null;
      return {
        key: 'Sun',
        name: sun.nameJa,
        kind: 'star',
        positionKm: { x: 0, y: 0, z: 0 },
        radiusKm: sun.radiusKm,
        details: () => ['恒星 ・ 太陽系の中心', '絶対等級 4.8', '惑星 8 個（準惑星は冥王星など）'],
      };
    }
    const host = this.deps.systems.hostOf(system);
    if (!host) return null;
    const bodies = this.deps.systems.bodiesOf(system);
    const star = bodies.find((b) => b.id === starKey(system));
    const name = host.compactInfo?.name ?? this.deps.starName?.(system) ?? star?.nameJa ?? `恒星 ${system}`;
    const planets = bodies.filter((b) => b.kind === 'exoplanet').length;
    return {
      key: starKey(system),
      name,
      kind: host.compact ?? 'star',
      positionKm: { x: host.positionPc.x * KM_PER_PC, y: host.positionPc.y * KM_PER_PC, z: host.positionPc.z * KM_PER_PC },
      radiusKm: star?.radiusKm,
      details: () => describeHost(host, name, planets),
    };
  }

  private clusterTarget(c: Cluster): InfoTarget {
    return {
      key: clusterKey(c),
      name: clusterLabel(c),
      kind: 'cluster',
      positionKm: { x: c.positionPc.x * KM_PER_PC, y: c.positionPc.y * KM_PER_PC, z: c.positionPc.z * KM_PER_PC },
      details: () => describeCluster(c),
    };
  }

  private nebulaTarget(n: Nebula): InfoTarget {
    return {
      key: nebulaKey(n),
      name: nebulaLabel(n),
      kind: 'nebula',
      // 半径は渡さない。大きな星雲の円の中のどこを見ても選ばれると、手前の小さな天体が照準で選べなくなるため
      positionKm: { x: n.positionPc.x * KM_PER_PC, y: n.positionPc.y * KM_PER_PC, z: n.positionPc.z * KM_PER_PC },
      details: () => describeNebula(n),
    };
  }

  private galaxyTarget(g: Galaxy): InfoTarget {
    return {
      key: galaxyKey(g),
      name: galaxyLabel(g),
      kind: 'galaxy',
      positionKm: { x: g.positionPc.x * KM_PER_PC, y: g.positionPc.y * KM_PER_PC, z: g.positionPc.z * KM_PER_PC },
      details: () => describeGalaxy(g),
    };
  }

  private searchFar(pc: Vec3): InfoTarget[] {
    const out: InfoTarget[] = [];
    for (const s of nearestStars(pc, this.deps.stars.data, STAR_STRIDE, this.deps.extraStars, LIST_SIZE.stars)) {
      const t = this.starTarget(s.system);
      if (t) out.push(t);
    }
    for (const c of nearbyClusters(this.deps.clusters, pc, LIST_SIZE.clusters)) out.push(this.clusterTarget(c));
    // 星雲と銀河は、大きく見えている順（アンドロメダ銀河やオリオン大星雲を地球からも選べるように）
    for (const n of prominent(this.deps.nebulae, pc, LIST_SIZE.nebulae * 3)) out.push(this.nebulaTarget(n));
    for (const g of prominent(this.deps.galaxies, pc, LIST_SIZE.galaxies * 3)) out.push(this.galaxyTarget(g));
    return out;
  }

  private card(t: InfoTarget, source: InfoCardState['source'], firstVisit: boolean): InfoCardState {
    return {
      key: t.key,
      name: t.name,
      source,
      distance: `ここから ${formatDistance(length(sub(t.positionKm, this.observer)))}`,
      details: t.details(),
      firstVisit,
    };
  }

  /** コレクションに記録する。はじめて訪れたなら true */
  private record(t: InfoTarget): boolean {
    if (this.visited.has(t.key)) return false;
    this.visited.add(t.key);
    const input: VisitInput = { key: t.key, kind: t.kind, name: t.name.slice(0, 80) };
    hudStore.set({ visits: [...hudStore.get().visits, { ...input, firstAt: new Date().toISOString() }] });
    if (!this.online || !this.loaded) this.pending.push(input);
    else this.send(input);
    return true;
  }

  private send(v: VisitInput): void {
    visitApi.add(v).catch((e: unknown) => console.error(e));
  }
}

function sameCard(a: InfoCardState | null, b: InfoCardState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.key === b.key && a.source === b.source && a.distance === b.distance && a.firstVisit === b.firstVisit;
}
