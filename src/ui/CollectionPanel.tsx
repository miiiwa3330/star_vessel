import { useEffect, useMemo, useState } from 'react';
import { INFO_KIND_NAMES_JA, type InfoKind } from '../world/info';
import { VISIT_KINDS, type Visit } from '../world/visits';
import { hudActions } from './hud-store';
import { BodyGlobe } from './BodyGlobe';

/** 1 ページに並べる数（PC は横 5・縦 3、スマホは横 3・縦 5。2026-11-12 にオーナーの指示） */
const PAGE_SIZE = 15;
/** 天体の絵の大きさ（CSS ピクセル）。スマホは小さく（hud.css と同じ切り替え） */
const small = () => matchMedia('(max-width: 720px), (pointer: coarse)').matches;

/**
 * 訪れた天体のコレクション（図鑑。要件 F38）。画面を大きく使い、一覧と詳細の 2 つの画面を持つ（2026-11-12 にオーナーの指示）。
 * - 一覧：訪れた順に番号を付け（No.001 が最初に訪れた天体）、天体の絵と名前を並べる。種類で絞れる。15 個ずつのページ
 * - 詳細：左に天体（自転して見える）、右にその天体の説明
 * 閉じるのは、まわりを押すか Esc・1 キー（× は置かない）
 */
export function CollectionPanel({ visits }: { visits: Visit[] }) {
  const [kind, setKind] = useState<InfoKind | 'all'>('all');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  // 訪れた順の番号（絞っても変わらない）
  const numbered = useMemo(
    () => [...visits].sort((a, b) => a.firstAt.localeCompare(b.firstAt)).map((v, i) => ({ v, no: i + 1 })),
    [visits],
  );
  const counts = new Map<InfoKind, number>();
  for (const v of visits) counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
  const shown = numbered.filter(({ v }) => kind === 'all' || v.kind === kind);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  const opened = open ? numbered.find(({ v }) => v.key === open) : undefined;

  // ← → でページをめくる（詳細では、前・次の天体）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      if (opened) {
        const i = shown.findIndex(({ v }) => v.key === opened.v.key);
        const next = shown[i + step];
        if (next) setOpen(next.v.key);
      } else setPage(Math.min(pages - 1, Math.max(0, p + step)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opened, shown, pages, p]);

  return (
    <div className="hud-panel hud-glass-panel hud-collection" role="dialog" aria-label="訪れた天体のコレクション">
      <div className="hud-collection-head">
        <p className="hud-eyebrow">
          COLLECTION<span className="hud-count">{visits.length}</span>
        </p>
      </div>
      {opened ? (
        <CollectionDetail visit={opened.v} no={opened.no} onBack={() => setOpen(null)} />
      ) : (
        <>
          <div className="hud-chips" role="group" aria-label="種類で絞る">
            <button
              type="button"
              className={`hud-chip${kind === 'all' ? ' is-selected' : ''}`}
              onClick={() => {
                setKind('all');
                setPage(0);
              }}
            >
              すべて {visits.length}
            </button>
            {VISIT_KINDS.filter((k) => counts.has(k)).map((k) => (
              <button
                key={k}
                type="button"
                className={`hud-chip${kind === k ? ' is-selected' : ''}`}
                onClick={() => {
                  setKind(k);
                  setPage(0);
                }}
              >
                {INFO_KIND_NAMES_JA[k]} {counts.get(k)}
              </button>
            ))}
          </div>
          {visits.length === 0 ? (
            <div className="hud-modal-note">まだありません。天体に近づくと、ここに記録されます</div>
          ) : (
            <>
              <ul className="hud-collection-grid">
                {shown.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map(({ v, no }) => (
                  <li key={v.key}>
                    <button type="button" className="hud-collection-cell" onClick={() => setOpen(v.key)}>
                      <Thumb visit={v} size={small() ? 54 : 76} />
                      <span className="hud-collection-no">No.{String(no).padStart(3, '0')}</span>
                      <span className="hud-collection-name">{v.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {pages > 1 && (
                <div className="hud-collection-pager">
                  <button type="button" className="hud-button hud-button-small" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="前のページ">
                    ‹
                  </button>
                  <span className="hud-collection-page">
                    {p + 1} / {pages}
                  </span>
                  <button type="button" className="hud-button hud-button-small" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="次のページ">
                    ›
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Thumb({ visit, size, spin = false }: { visit: Visit; size: number; spin?: boolean }) {
  const entry = useMemo(() => hudActions.describeVisit(visit), [visit]);
  return <BodyGlobe look={entry.look} size={size} spin={spin} />;
}

/** 詳細：左に天体、右に説明 */
function CollectionDetail({ visit, no, onBack }: { visit: Visit; no: number; onBack: () => void }) {
  const entry = useMemo(() => hudActions.describeVisit(visit), [visit]);
  const first = new Date(visit.firstAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="hud-collection-detail">
      <div className="hud-collection-figure">
        <BodyGlobe look={entry.look} size={small() ? 170 : 300} spin />
      </div>
      <div className="hud-collection-text">
        <p className="hud-collection-kind">
          No.{String(no).padStart(3, '0')} ・ {INFO_KIND_NAMES_JA[visit.kind]}
        </p>
        <h2 className="hud-collection-title">{visit.name}</h2>
        {entry.nameEn && <p className="hud-collection-en" lang="en">{entry.nameEn}</p>}
        <ul className="hud-collection-facts">
          {entry.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
          <li>はじめて訪れた日 {first}</li>
        </ul>
        <div className="hud-collection-actions">
          <button type="button" className="hud-button hud-button-small" onClick={onBack}>
            一覧へ戻る
          </button>
          <button type="button" className="hud-button hud-button-small" onClick={() => hudActions.openMapAt(visit.key)}>
            マップで見る
          </button>
        </div>
      </div>
    </div>
  );
}
