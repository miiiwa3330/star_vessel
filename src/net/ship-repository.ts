/**
 * 宇宙船の設計の保存先（サーバーの /api/ship。worker/ships.ts）。要件 F27。
 * 他のプレイヤーが自分で作った船のブロックも、ここから読む（宇宙の部屋では印〈ref〉だけが届くため）。
 */
import { decodeBlocks, isBlocksRef, type Block } from '../world/ship-blocks';
import { parseShipDesign, usedCustom, type ShipDesign } from '../world/ship-design';

/** 自分の設計と、使っている自分で作った船の印（サーバーが付ける。最初から選べる船を使っていれば null） */
export interface SavedShip {
  design: ShipDesign | null;
  ref: string | null;
}

const parseSaved = (body: { design?: unknown; ref?: unknown }): SavedShip => {
  const design = parseShipDesign(body.design);
  return { design, ref: usedCustom(design) && isBlocksRef(body.ref) ? body.ref : null };
};

export const shipApi = {
  /** 自分の設計。まだ決めていなければ design は null */
  async get(): Promise<SavedShip> {
    const res = await fetch('/api/ship', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`船の設計が読めない: ${res.status}`);
    return parseSaved((await res.json()) as { design?: unknown; ref?: unknown });
  },

  async save(design: ShipDesign): Promise<SavedShip> {
    const res = await fetch('/api/ship', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(design),
    });
    if (!res.ok) throw new Error(`船の設計を保存できない: ${res.status}`);
    return parseSaved((await res.json()) as { design?: unknown; ref?: unknown });
  },
};

/** 読めなかった印を、もう一度読むまでの間（ms） */
const RETRY_MS = 60_000;
const loaded = new Map<string, readonly Block[]>();
const pending = new Set<string>();
const failedAt = new Map<string, number>();

/**
 * 印 ref の船のブロック。読んであればそれを、まだなら null を返して、裏で読み始める（読めたら次から返す）。
 * 中身は印から決まるので、一度読んだものは読み直さない
 */
export function customBlocks(ref: string): readonly Block[] | null {
  const hit = loaded.get(ref);
  if (hit) return hit;
  if (!isBlocksRef(ref) || pending.has(ref) || Date.now() - (failedAt.get(ref) ?? -Infinity) < RETRY_MS) return null;
  pending.add(ref);
  void (async () => {
    try {
      const res = await fetch(`/api/ship/blocks/${ref}`);
      const body = res.ok ? ((await res.json()) as { blocks?: unknown }) : null;
      const blocks = body ? decodeBlocks(body.blocks) : null;
      if (blocks) loaded.set(ref, blocks);
      else failedAt.set(ref, Date.now());
    } catch {
      failedAt.set(ref, Date.now());
    } finally {
      pending.delete(ref);
    }
  })();
  return null;
}

/** 自分で作った船を保存したときに、読み直さずに使えるよう覚えておく */
export function rememberCustomBlocks(ref: string, blocks: readonly Block[]): void {
  loaded.set(ref, blocks);
}
