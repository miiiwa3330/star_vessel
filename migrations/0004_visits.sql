-- 訪れた天体のコレクション（要件 F38）。決まりは docs/product/info-and-collection.md
CREATE TABLE visits (
  user_id TEXT NOT NULL,
  -- 天体の記号（例：Earth、S6.6、H70666.2、SOL.0 ではなく Sun、C:Melotte 22）
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  first_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
