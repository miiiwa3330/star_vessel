/**
 * 訪れた天体のコレクションの保存先（サーバーの /api/visits。worker/visits.ts）。要件 F38。
 */
import { isVisit, type Visit, type VisitInput } from '../world/visits';

export const visitApi = {
  async list(): Promise<Visit[]> {
    const res = await fetch('/api/visits', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`コレクションが読めない: ${res.status}`);
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? data.filter(isVisit) : [];
  },

  async add(v: VisitInput): Promise<void> {
    const res = await fetch('/api/visits', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v),
    });
    if (!res.ok) throw new Error(`コレクションに記録できない: ${res.status}`);
  },
};
