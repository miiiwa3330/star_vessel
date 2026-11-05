-- 回復コード（要件 F51）。ユーザー名やパスワードを忘れたときに戻すためのもの。コード自体は保存せず、ハッシュだけを持つ
CREATE TABLE recovery_codes (
  -- Better Auth の user.id。1 人 1 つ。作り直すと置き換わる
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  -- コードの SHA-256（16 進）
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
