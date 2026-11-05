-- いま遊んでいる人数（要件 F50）。宇宙の部屋（恒星系ごと）が、中の接続の数をここに書く
CREATE TABLE presence (
  -- 部屋の名前（恒星系の記号）
  room TEXT NOT NULL PRIMARY KEY,
  -- 中にいる接続の数。0 になった部屋の行は消す
  count INTEGER NOT NULL,
  -- 最後に書いた時刻（ms）。部屋が閉じたことを知らせずに消えたときのため、古い行は数えない
  at INTEGER NOT NULL
);
