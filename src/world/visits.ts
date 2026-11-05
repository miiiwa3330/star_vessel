/**
 * 訪れた天体のコレクション（要件 F38）の記録の形と確かめ方。サーバー（worker/visits.ts）とブラウザの両方で使う。
 * three.js・DOM・astronomy-engine を読み込まない。決まりは docs/product/info-and-collection.md。
 */
import type { InfoKind } from './info';

export const VISIT_KINDS: readonly InfoKind[] = [
  'star',
  'white-dwarf',
  'neutron-star',
  'black-hole',
  'planet',
  'dwarf',
  'moon',
  'asteroid',
  'exoplanet',
  'satellite',
  'cluster',
];

/** 1 人が記録できる数の上限（サーバーの容量のため） */
export const MAX_VISITS_PER_PLAYER = 100_000;

export interface Visit {
  /** 天体の記号（InfoTarget の key） */
  key: string;
  kind: InfoKind;
  name: string;
  /** 初めて訪れた時刻（ISO 8601。サーバーが付ける） */
  firstAt: string;
}

/** 記録の記号：英数字と . ~ : + - と空白だけ、64 文字まで（星団の名前に空白が入る） */
const KEY = /^[0-9A-Za-z.~:+\- ]{1,64}$/;

/** ブラウザ → サーバー（訪れた） */
export interface VisitInput {
  key: string;
  kind: InfoKind;
  name: string;
}

export function isVisitInput(v: unknown): v is VisitInput {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.key === 'string' &&
    KEY.test(o.key) &&
    typeof o.kind === 'string' &&
    (VISIT_KINDS as readonly string[]).includes(o.kind) &&
    typeof o.name === 'string' &&
    o.name.length >= 1 &&
    o.name.length <= 80
  );
}

export const isVisit = (v: unknown): v is Visit =>
  isVisitInput(v) && typeof (v as unknown as Record<string, unknown>).firstAt === 'string';
