-- ワープホール（要件 F9・F12・F13）。決まりは docs/tech/server.md
CREATE TABLE warps (
  id TEXT NOT NULL PRIMARY KEY,
  -- 置いた人（Better Auth の user.id）。後から登録したときに引き継げるよう、外部キーの連鎖削除は付けない
  owner_id TEXT NOT NULL,
  -- 宇宙の住所（例：MW-ORI-SOL-3-1-002）
  code TEXT NOT NULL UNIQUE,
  -- 番号の前までの住所（例：MW-ORI-SOL-3-1）と、その中での番号
  prefix TEXT NOT NULL,
  serial INTEGER NOT NULL,
  -- 基準の天体と、その中心からの位置（km・EQJ）、輪の正面の向き
  anchor TEXT NOT NULL,
  offset_x REAL NOT NULL,
  offset_y REAL NOT NULL,
  offset_z REAL NOT NULL,
  facing_x REAL NOT NULL,
  facing_y REAL NOT NULL,
  facing_z REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX warps_owner_idx ON warps (owner_id);

-- 住所ごとの最後の番号。消したワープホールの番号は使い回さない（住所と同じ）
CREATE TABLE warp_counters (
  prefix TEXT NOT NULL PRIMARY KEY,
  last INTEGER NOT NULL
);
