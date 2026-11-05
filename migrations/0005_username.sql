-- ユーザー名でのログイン（Better Auth の username プラグイン。要件 F49）
-- npm run auth:schema の結果との差分。SQLite は ALTER TABLE で UNIQUE の列を足せないので、一意の索引を別に作る
alter table "user" add column "username" text;
alter table "user" add column "displayUsername" text;
create unique index "user_username_uidx" on "user" ("username");
