import { useState } from 'react';
import { INFO_KIND_NAMES_JA, type InfoKind } from '../world/info';
import { VISIT_KINDS, type Visit } from '../world/visits';

/** 訪れた天体のコレクション（要件 F38）。種類ごとの数と、初めて訪れた日時の一覧。閉じるのは、まわりを押すか Esc・1 キー（× は置かない） */
export function CollectionPanel({ visits }: { visits: Visit[] }) {
  const [kind, setKind] = useState<InfoKind | 'all'>('all');
  const counts = new Map<InfoKind, number>();
  for (const v of visits) counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
  const shown = visits.filter((v) => kind === 'all' || v.kind === kind).slice(-100).reverse();
  return (
    <div className="hud-panel hud-modal hud-collection-modal" role="dialog" aria-label="訪れた天体のコレクション">
      <div className="hud-modal-head">
        <p className="hud-eyebrow">
          COLLECTION<span className="hud-count">{visits.length}</span>
        </p>
      </div>
      <div className="hud-chips" role="group" aria-label="種類で絞る">
        <button type="button" className={`hud-chip${kind === 'all' ? ' is-selected' : ''}`} onClick={() => setKind('all')}>
          すべて {visits.length}
        </button>
        {VISIT_KINDS.filter((k) => counts.has(k)).map((k) => (
          <button key={k} type="button" className={`hud-chip${kind === k ? ' is-selected' : ''}`} onClick={() => setKind(k)}>
            {INFO_KIND_NAMES_JA[k]} {counts.get(k)}
          </button>
        ))}
      </div>
      {visits.length === 0 ? (
        <div className="hud-modal-note">まだありません。天体に近づくと、ここに記録されます</div>
      ) : (
        <ul>
          {shown.map((v) => (
            <li key={v.key} className="hud-list-row">
              <span className="hud-list-name">{v.name}</span>
              <span className="hud-muted hud-small">
                {INFO_KIND_NAMES_JA[v.kind]} ・ {new Date(v.firstAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
