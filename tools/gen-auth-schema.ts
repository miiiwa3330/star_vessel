// Better Auth が使うテーブルの SQL を作る。使い方：npm run auth:schema > migrations/000X_xxx.sql
// 空の SQLite（node:sqlite・メモリの中）に対して、Better Auth のマイグレーションの SQL を組み立てる。
import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../worker/auth-options.ts';

const { compileMigrations } = await getMigrations({ ...authOptions, database: new DatabaseSync(':memory:') });
process.stdout.write(`-- Better Auth のテーブル（tools/gen-auth-schema.ts で生成）\n${await compileMigrations()}\n`);
