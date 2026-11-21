-- ブロックで作った宇宙船（要件 F27。2026-11-21）。決まりは docs/tech/ships.md の「ブロックの船」
-- blocks_ref：いま使っている、自分で作った船のブロック（design の customs[use]）の印。SHA-256 の前の 16 バイト（16 進 32 文字）。
-- 最初から選べる船を使っていれば NULL。
-- 宇宙の部屋では印だけを配り、受け取った側が GET /api/ship/blocks/:ref でブロックを読む
ALTER TABLE ship_designs ADD COLUMN blocks_ref TEXT;
CREATE INDEX ship_designs_blocks_ref ON ship_designs (blocks_ref);
