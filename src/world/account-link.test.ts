import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { linkStatements } from './account-link';

/** 手元の D1 と同じ SQLite に、本物のテーブル（migrations/）を作って確かめる */
function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  for (const f of ['0002_warps.sql', '0003_ship_designs.sql', '0004_visits.sql']) d.exec(readFileSync(new URL(`../../migrations/${f}`, import.meta.url), 'utf8'));
  return d;
}

function link(d: DatabaseSync, from: string, to: string) {
  for (const s of linkStatements(from, to)) d.prepare(s.sql).run(...s.params);
}

const warp = (d: DatabaseSync, id: string, owner: string) =>
  d.prepare(`INSERT INTO warps VALUES (?, ?, ?, 'P', 1, 'Earth', 0, 0, 0, 0, 0, 1, '2026-11-05')`).run(id, owner, `MW-${id}`);
const visit = (d: DatabaseSync, user: string, key: string, at: string) =>
  d.prepare(`INSERT INTO visits VALUES (?, ?, 'planet', ?, ?)`).run(user, key, key, at);

describe('匿名のときの記録を、登録したアカウントへ移す', () => {
  it('ワープホールは全部移し、合計が 3 個を超えても消さない', () => {
    const d = db();
    for (const id of ['a1', 'a2']) warp(d, id, 'anon');
    for (const id of ['n1', 'n2']) warp(d, id, 'new');
    link(d, 'anon', 'new');
    const rows = d.prepare('SELECT owner_id, COUNT(*) AS n FROM warps GROUP BY owner_id').all() as { owner_id: string; n: number }[];
    expect(rows).toEqual([{ owner_id: 'new', n: 4 }]);
  });

  it('宇宙船の設計は、登録した側がすでに決めていればそちらを残す', () => {
    const d = db();
    const put = (u: string, hull: string) => d.prepare(`INSERT INTO ship_designs VALUES (?, ?, '2026-11-05')`).run(u, JSON.stringify({ v: 1, hull }));
    put('anon', 'bell');
    put('new', 'ring');
    link(d, 'anon', 'new');
    const rows = d.prepare('SELECT user_id, design FROM ship_designs').all() as { user_id: string; design: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('new');
    expect(JSON.parse(rows[0].design).hull).toBe('ring');
  });

  it('宇宙船の設計は、登録した側が決めていなければ匿名のものを移す', () => {
    const d = db();
    d.prepare(`INSERT INTO ship_designs VALUES ('anon', '{"v":1,"hull":"bell"}', '2026-11-05')`).run();
    link(d, 'anon', 'new');
    const rows = d.prepare('SELECT user_id FROM ship_designs').all() as { user_id: string }[];
    expect(rows).toEqual([{ user_id: 'new' }]);
  });

  it('訪れた天体は両方を合わせ、同じ天体は早い方の日時を残す', () => {
    const d = db();
    visit(d, 'anon', 'Earth', '2026-11-05T01:00:00Z');
    visit(d, 'anon', 'Moon', '2026-11-05T02:00:00Z');
    visit(d, 'new', 'Earth', '2026-11-05T03:00:00Z');
    visit(d, 'new', 'Mars', '2026-11-05T04:00:00Z');
    link(d, 'anon', 'new');
    const rows = d.prepare('SELECT user_id, key, first_at FROM visits ORDER BY key').all() as { user_id: string; key: string; first_at: string }[];
    expect(rows.map((r) => r.user_id)).toEqual(['new', 'new', 'new']);
    expect(rows.map((r) => [r.key, r.first_at])).toEqual([
      ['Earth', '2026-11-05T01:00:00Z'],
      ['Mars', '2026-11-05T04:00:00Z'],
      ['Moon', '2026-11-05T02:00:00Z'],
    ]);
  });

  it('ほかの人の記録には触らない。匿名の分は残らない', () => {
    const d = db();
    warp(d, 'w1', 'anon');
    warp(d, 'w2', 'other');
    visit(d, 'anon', 'Earth', '2026-11-05T01:00:00Z');
    visit(d, 'other', 'Earth', '2026-11-05T01:00:00Z');
    link(d, 'anon', 'new');
    expect(d.prepare("SELECT COUNT(*) AS n FROM warps WHERE owner_id = 'other'").get()).toEqual({ n: 1 });
    expect(d.prepare("SELECT COUNT(*) AS n FROM visits WHERE user_id = 'other'").get()).toEqual({ n: 1 });
    expect(d.prepare("SELECT COUNT(*) AS n FROM visits WHERE user_id = 'anon'").get()).toEqual({ n: 0 });
  });
});
