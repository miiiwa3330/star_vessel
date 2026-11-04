/**
 * ワープホールの保存先。
 *
 * 要件 F9 ではワープホールを全プレイヤーで共有する。共有にはサーバーが要るが、サーバーの技術はまだ選んでいない
 * （docs/tech/stack.md）。それまでの仮として、この端末のブラウザの中だけに保存する LocalWarpRepository を使う。
 * サーバーができたら、同じ WarpRepository の形でサーバー版を作って差し替える。
 */
import { isWarpHole, type WarpHole } from '../world/warp';

export interface WarpRepository {
  /** 全員のワープホール */
  list(): Promise<WarpHole[]>;
  add(warp: WarpHole): Promise<void>;
  /** 置いた本人だけが消せる */
  remove(id: string, ownerId: string): Promise<void>;
  /** 保存先が全員と共有されているか（画面に出す注意書きに使う） */
  readonly shared: boolean;
}

const WARPS_KEY = 'star_vessel.warps.v1';
const PLAYER_KEY = 'star_vessel.playerId.v1';

export class LocalWarpRepository implements WarpRepository {
  readonly shared = false;
  private memory: WarpHole[] | null = null;

  async list(): Promise<WarpHole[]> {
    if (this.memory) return [...this.memory];
    try {
      const raw = JSON.parse(localStorage.getItem(WARPS_KEY) ?? '[]') as unknown;
      this.memory = Array.isArray(raw) ? raw.filter(isWarpHole) : [];
    } catch {
      // 保存が使えない（プライベートウィンドウなど）ときは、開いている間だけ覚えておく
      this.memory = [];
    }
    return [...this.memory];
  }

  async add(warp: WarpHole): Promise<void> {
    const all = await this.list();
    this.save([...all, warp]);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const all = await this.list();
    this.save(all.filter((w) => !(w.id === id && w.ownerId === ownerId)));
  }

  private save(warps: WarpHole[]) {
    this.memory = warps;
    try {
      localStorage.setItem(WARPS_KEY, JSON.stringify(warps));
    } catch {
      // 保存できなくても、開いている間は使える
    }
  }
}

/**
 * このブラウザのプレイヤーの ID（仮）。アカウントの方式が決まったら置き換える
 * （docs/product/requirements.md の「アカウント」）。
 */
export function localPlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
