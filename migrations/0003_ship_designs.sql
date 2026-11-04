-- 宇宙船の設計（要件 F27）。アカウントごとに 1 つ。決まりは docs/tech/ships.md
CREATE TABLE ship_designs (
  -- Better Auth の user.id
  user_id TEXT NOT NULL PRIMARY KEY,
  -- 設計（JSON。src/world/ship-design.ts の ShipDesign）
  design TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
