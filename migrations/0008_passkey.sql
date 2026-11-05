-- パスキー（Better Auth の passkey プラグイン。要件 F52）。npm run auth:schema の結果との差分
-- 持つのは公開鍵と、鍵の識別の情報だけ。秘密鍵と、指紋・顔の情報は端末から出ない
create table "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" integer not null, "transports" text, "createdAt" date, "aaguid" text);
create index "passkey_userId_idx" on "passkey" ("userId");
create index "passkey_credentialID_idx" on "passkey" ("credentialID");
