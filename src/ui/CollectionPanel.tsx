import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { INFO_KIND_NAMES_JA, type InfoKind } from '../world/info';
import { countByKind, formatCatalogNo } from '../world/catalog';
import type { Visit } from '../world/visits';
import { hudActions } from './hud-store';
import { BodyGlobe } from './BodyGlobe';
import { ObjectViewer } from './ObjectViewer';
import { getCollectionSource, type CollectionEntry, type EncyclopediaTexts } from './collection-source';

/** 1 ページに並べる数（PC は横 5・縦 3、スマホは横 3・縦 5。2026-11-12 にオーナーの指示） */
const PAGE_SIZE = 15;
/** 一覧から詳細へ、天体が滑っていく時間（ミリ秒） */
const SLIDE_MS = 520;
const BACK_MS = 420;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const small = () => matchMedia('(max-width: 720px), (pointer: coarse)').matches;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 種類で絞る順 */
const KIND_ORDER: InfoKind[] = ['planet', 'dwarf', 'moon', 'asteroid', 'comet', 'spacecraft', 'star', 'exoplanet', 'neutron-star', 'black-hole', 'cluster', 'nebula', 'galaxy'];

type Filter = InfoKind | 'all' | 'extra';

/**
 * 訪れた天体のコレクション（図鑑。要件 F38）。2026-11-12 にオーナーの指示で作り直した。
 * - **名前のある実在の天体すべて**を、通しの番号で並べる（src/world/catalog.ts・src/ui/collection-source.ts）。見出しに「集めた数 / 全体の数」
 * - **まだ訪れていない天体は黒いシルエット**で、名前は「？？？」。詳細は種類とだいたいの場所だけ
 * - 一覧の天体を押すと、**天体が一覧の場所から詳細の場所へ滑っていき**（画面は切り替えない）、右に説明が出る。戻るときは逆に滑って戻る
 * - 詳細の天体は、**ドラッグでくるくる回せる**（ObjectViewer.tsx）。説明は、解説の文・数の表・くらべてみると、の順。長いのでスクロールする
 * 閉じるのは、まわりを押すか Esc・1 キー（× は置かない）。
 * embedded：タイトル画面のマイページ（火星の箱）の下に置くとき（2026-11-13）。宇宙が無いので「マップで見る」「その方を向く」は出さない
 */
export function CollectionPanel({ visits, embedded = false }: { visits: Visit[]; embedded?: boolean }) {
  const source = getCollectionSource();
  const [filter, setFilter] = useState<Filter>('all');
  const [onlyVisited, setOnlyVisited] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<{ key: string; from: DOMRect | null } | null>(null);
  const [texts, setTexts] = useState<EncyclopediaTexts | null>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const backing = useRef(false);

  useEffect(() => {
    void import('./encyclopedia-text').then((m) => setTexts(m.default));
  }, []);

  const visited = useMemo(() => new Set(visits.map((v) => v.key)), [visits]);
  const catalog = useMemo(() => source?.catalog() ?? [], [source]);
  const extras = useMemo(() => source?.extras(visits) ?? [], [source, visits]);
  const counts = useMemo(() => countByKind(catalog, visited), [catalog, visited]);
  const got = useMemo(() => catalog.reduce((n, e) => n + (visited.has(e.key) ? 1 : 0), 0), [catalog, visited]);
  const shown = useMemo(() => {
    let list: CollectionEntry[] = filter === 'extra' ? extras : filter === 'all' ? [...catalog, ...extras] : catalog.filter((e) => e.kind === filter);
    if (onlyVisited) list = list.filter((e) => visited.has(e.key));
    return list;
  }, [catalog, extras, filter, onlyVisited, visited]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  const opened = open ? shown.find((e) => e.key === open.key) ?? catalog.find((e) => e.key === open.key) ?? null : null;

  const pageOf = (key: string) => Math.max(0, Math.floor(shown.findIndex((e) => e.key === key) / PAGE_SIZE));
  const choose = (f: Filter) => {
    setFilter(f);
    setPage(0);
  };

  const openEntry = (key: string, cell: HTMLElement | null) => {
    const from = cell?.querySelector('.cg')?.getBoundingClientRect() ?? null;
    setOpen({ key, from });
  };

  // 一覧の場所から、詳細の場所へ滑らせる
  useLayoutEffect(() => {
    if (!open || !figureRef.current) return;
    const fig = figureRef.current;
    if (open.from && !reduceMotion()) {
      const to = fig.getBoundingClientRect();
      const s = open.from.width / to.width;
      const dx = open.from.left + open.from.width / 2 - (to.left + to.width / 2);
      const dy = open.from.top + open.from.height / 2 - (to.top + to.height / 2);
      fig.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], { duration: SLIDE_MS, easing: EASE });
      textRef.current?.animate([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }], { duration: SLIDE_MS, delay: 120, easing: EASE, fill: 'backwards' });
    } else if (!open.from && !reduceMotion()) {
      // 詳細の中で、前・次の天体へ
      fig.animate([{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE });
      textRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE });
    }
    textRef.current?.scrollTo({ top: 0 });
  }, [open]);

  // 戻る：一覧のその天体の場所へ滑って戻る
  const back = () => {
    if (!open || backing.current) return;
    const key = open.key;
    const target = pageOf(key);
    setPage(target);
    backing.current = true;
    requestAnimationFrame(() => {
      const fig = figureRef.current;
      const cell = gridRef.current?.querySelector(`[data-key="${CSS.escape(key)}"] .cg`);
      const done = () => {
        backing.current = false;
        setOpen(null);
      };
      if (!fig || !cell || reduceMotion()) return done();
      const from = fig.getBoundingClientRect();
      const to = cell.getBoundingClientRect();
      const s = to.width / from.width;
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      textRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BACK_MS / 2, fill: 'forwards' });
      fig.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }], { duration: BACK_MS, easing: EASE, fill: 'forwards' }).onfinish = done;
    });
  };

  // ← → でページをめくる（詳細では、前・次の天体）。詳細の Backspace で一覧へ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 文字を入れている所（マイページの入力など）のキーは使わない
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Backspace' && open) {
        e.preventDefault();
        back();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      if (open) {
        const i = shown.findIndex((x) => x.key === open.key);
        const next = shown[i + step];
        if (next) setOpen({ key: next.key, from: null });
      } else setPage(Math.min(pages - 1, Math.max(0, p + step)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!source) {
    return (
      <div className={`hud-panel hud-glass-panel hud-collection${embedded ? ' is-embedded' : ''}`} role="dialog" aria-label="コレクション">
        <div className="hud-modal-note">読み込み中…</div>
      </div>
    );
  }

  const isSmall = small();
  return (
    <div
      className={`hud-panel hud-glass-panel hud-collection${embedded ? ' is-embedded' : ''}`}
      role={embedded ? 'region' : 'dialog'}
      aria-label="天体のコレクション"
    >
      <div className="hud-collection-head">
        <p className="hud-eyebrow">COLLECTION</p>
        <p className="hud-collection-count" aria-label={`全体 ${catalog.length} 個のうち ${got} 個を集めた`}>
          <strong>{got.toLocaleString('ja-JP')}</strong> / {catalog.length.toLocaleString('ja-JP')}
        </p>
      </div>
      <div className="hud-collection-progress" aria-hidden="true">
        <span style={{ width: `${catalog.length ? Math.max(0.4, (got / catalog.length) * 100) : 0}%` }} />
      </div>
      <div className="hud-collection-body">
        <div className={`hud-collection-list${opened ? ' is-behind' : ''}`} aria-hidden={opened ? true : undefined}>
          <div className="hud-chips hud-collection-chips" role="group" aria-label="種類で絞る">
            <button type="button" className={`hud-chip${filter === 'all' ? ' is-selected' : ''}`} onClick={() => choose('all')}>
              すべて
            </button>
            {KIND_ORDER.filter((k) => counts.has(k)).map((k) => (
              <button key={k} type="button" className={`hud-chip${filter === k ? ' is-selected' : ''}`} onClick={() => choose(k)}>
                {INFO_KIND_NAMES_JA[k]} {counts.get(k)!.got}/{counts.get(k)!.total.toLocaleString('ja-JP')}
              </button>
            ))}
            {extras.length > 0 && (
              <button type="button" className={`hud-chip${filter === 'extra' ? ' is-selected' : ''}`} onClick={() => choose('extra')}>
                番外 {extras.length}
              </button>
            )}
            <button
              type="button"
              className={`hud-chip hud-chip-toggle${onlyVisited ? ' is-selected' : ''}`}
              aria-pressed={onlyVisited}
              onClick={() => {
                setOnlyVisited(!onlyVisited);
                setPage(0);
              }}
            >
              訪れたものだけ
            </button>
          </div>
          {shown.length === 0 ? (
            <div className="hud-modal-note">まだありません。天体に近づくと、ここに記録されます</div>
          ) : (
            <ul className="hud-collection-grid" ref={gridRef}>
              {shown.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map((e) => {
                const known = visited.has(e.key);
                return (
                  <li key={e.key} data-key={e.key}>
                    <button type="button" className="hud-collection-cell" onClick={(ev) => openEntry(e.key, ev.currentTarget)}>
                      <Thumb entry={e} size={isSmall ? 54 : 76} unknown={!known} />
                      <span className="hud-collection-no">{e.no > 0 ? formatCatalogNo(e.no) : '番外'}</span>
                      <span className={`hud-collection-name${known ? '' : ' is-unknown'}`}>{known ? e.name : '？？？'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {pages > 1 && (
            <div className="hud-collection-pager">
              <button type="button" className="hud-button hud-button-small" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="前のページ">
                ‹
              </button>
              <input
                type="range"
                className="hud-collection-slider"
                min={0}
                max={pages - 1}
                value={p}
                onChange={(ev) => setPage(Number(ev.target.value))}
                aria-label="ページ"
              />
              <span className="hud-collection-page">
                {(p + 1).toLocaleString('ja-JP')} / {pages.toLocaleString('ja-JP')}
              </span>
              <button type="button" className="hud-button hud-button-small" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="次のページ">
                ›
              </button>
            </div>
          )}
        </div>
        {opened && (
          <CollectionDetail
            key="detail"
            entry={opened}
            known={visited.has(opened.key)}
            visit={visits.find((v) => v.key === opened.key) ?? null}
            texts={texts}
            figureRef={figureRef}
            textRef={textRef}
            size={isSmall ? 190 : 340}
            embedded={embedded}
            onBack={back}
          />
        )}
      </div>
    </div>
  );
}

function Thumb({ entry, size, unknown }: { entry: CollectionEntry; size: number; unknown: boolean }) {
  const look = useMemo(() => getCollectionSource()!.look(entry), [entry]);
  return <BodyGlobe look={look} size={size} unknown={unknown} />;
}

/** 詳細：左に天体（回せる）、右に説明（スクロールする） */
function CollectionDetail({
  entry,
  known,
  visit,
  texts,
  figureRef,
  textRef,
  size,
  embedded,
  onBack,
}: {
  entry: CollectionEntry;
  known: boolean;
  visit: Visit | null;
  texts: EncyclopediaTexts | null;
  figureRef: React.RefObject<HTMLDivElement | null>;
  textRef: React.RefObject<HTMLDivElement | null>;
  size: number;
  embedded: boolean;
  onBack: () => void;
}) {
  const source = getCollectionSource()!;
  const look = useMemo(() => source.look(entry), [source, entry]);
  const article = useMemo(() => (known ? source.article(entry, texts) : source.hint(entry)), [source, entry, known, texts]);
  const parent = entry.parentKey ? source.entry(entry.parentKey) : undefined;
  return (
    <div className="hud-collection-detail">
      <div className="hud-collection-figure">
        <ObjectViewer key={entry.key} ref={figureRef} look={look} size={size} unknown={!known} />
        <p className="hud-collection-drag">ドラッグで回せます</p>
      </div>
      <div className="hud-collection-text" ref={textRef}>
        <p className="hud-collection-kind">
          {entry.no > 0 ? formatCatalogNo(entry.no) : '番外'} ・ {INFO_KIND_NAMES_JA[entry.kind]}
        </p>
        <h2 className={`hud-collection-title${known ? '' : ' is-unknown'}`}>{known ? entry.name : '？？？'}</h2>
        {known && entry.nameEn && (
          <p className="hud-collection-en" lang="en">
            {entry.nameEn}
          </p>
        )}
        {known && parent && <p className="hud-collection-parent">{parent.name}の惑星</p>}
        {article.lead.length > 0 && (
          <div className="hud-collection-lead">
            {article.lead.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
        )}
        {!texts && known && <p className="hud-modal-note">解説を読み込み中…</p>}
        {article.sections.map((s) => (
          <section key={s.title} className="hud-collection-section">
            <h3>{s.title}</h3>
            <dl>
              {s.rows.map(([k, v], i) => (
                <div key={`${k}${i}`} className="hud-collection-row">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {article.notes.length > 0 && (
          <section className="hud-collection-section">
            <h3>{known ? 'くらべてみると' : 'ヒント'}</h3>
            {article.notes.map((n, i) => (
              <p key={i} className="hud-collection-note">
                {n}
              </p>
            ))}
          </section>
        )}
        {known && visit && (
          <section className="hud-collection-section">
            <h3>記録</h3>
            <dl>
              <div className="hud-collection-row">
                <dt>はじめて訪れた日</dt>
                <dd>{new Date(visit.firstAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
              </div>
            </dl>
          </section>
        )}
        <div className="hud-collection-actions">
          <button type="button" className="hud-button hud-button-small" onClick={onBack}>
            一覧へ戻る
          </button>
          {known && !embedded && (
            <button type="button" className="hud-button hud-button-small" onClick={() => hudActions.openMapAt(entry.key)}>
              マップで見る
            </button>
          )}
          {!embedded && (
            <button
              type="button"
              className="hud-button hud-button-small"
              onClick={() => {
                hudActions.faceEntry(entry.key);
                hudActions.setOverlay(null);
              }}
            >
              その方を向く
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
