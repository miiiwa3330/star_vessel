import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clampOnline, onlineCountStatement, presenceStatement, PRESENCE_MAX, PRESENCE_STALE_MS } from './presence';

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  d.exec(readFileSync(new URL('../../migrations/0006_presence.sql', import.meta.url), 'utf8'));
  return d;
}
const write = (d: DatabaseSync, room: string, count: number, now: number) => {
  const s = presenceStatement(room, count, now);
  d.prepare(s.sql).run(...s.params);
};
const online = (d: DatabaseSync, now: number) => {
  const s = onlineCountStatement(now);
  return (d.prepare(s.sql).get(...s.params) as { online: number }).online;
};

describe('いま遊んでいる人数', () => {
  const T = 1_000_000_000;

  it('部屋ごとの数を合計する。書き直すと、足さずに置き換わる', () => {
    const d = db();
    write(d, 'SOL', 3, T);
    write(d, 'H70666', 2, T);
    expect(online(d, T)).toBe(5);
    write(d, 'SOL', 1, T + 1000);
    expect(online(d, T + 1000)).toBe(3);
  });

  it('0 人になった部屋の行は消える', () => {
    const d = db();
    write(d, 'SOL', 2, T);
    write(d, 'SOL', 0, T + 1);
    expect(d.prepare('SELECT COUNT(*) AS n FROM presence').get()).toEqual({ n: 0 });
    expect(online(d, T + 1)).toBe(0);
  });

  it('知らせずに消えた部屋の行は、古くなると数えない', () => {
    const d = db();
    write(d, 'SOL', 4, T);
    write(d, 'H70666', 1, T + PRESENCE_STALE_MS - 1000);
    expect(online(d, T + PRESENCE_STALE_MS - 500)).toBe(5);
    expect(online(d, T + PRESENCE_STALE_MS + 1)).toBe(1);
  });

  it('行が無ければ 0 人。返す値は整数に丸め、範囲に収める', () => {
    expect(online(db(), T)).toBe(0);
    expect(clampOnline(12.9)).toBe(12);
    expect(clampOnline(-3)).toBe(0);
    expect(clampOnline(Number.NaN)).toBe(0);
    expect(clampOnline('7')).toBe(0);
    expect(clampOnline(1e12)).toBe(PRESENCE_MAX);
  });
});
