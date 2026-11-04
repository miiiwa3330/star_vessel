/**
 * 自分の宇宙船の設計の保存先（サーバーの /api/ship。worker/ships.ts）。要件 F27。
 */
import { isShipDesign, type ShipDesign } from '../world/ship-design';

export const shipApi = {
  /** 自分の設計。まだ決めていなければ null */
  async get(): Promise<ShipDesign | null> {
    const res = await fetch('/api/ship', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`船の設計が読めない: ${res.status}`);
    const body = (await res.json()) as { design?: unknown };
    return isShipDesign(body.design) ? body.design : null;
  },

  async save(design: ShipDesign): Promise<void> {
    const res = await fetch('/api/ship', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(design),
    });
    if (!res.ok) throw new Error(`船の設計を保存できない: ${res.status}`);
  },
};
