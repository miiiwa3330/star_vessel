import { useEffect, useState } from 'react';
import { STAMP_MIN_INTERVAL_MS, STAMPS } from '../world/stamps';
import { hudActions, type StampLogItem } from './hud-store';

/**
 * スタンプを選んで送る（要件 F6）。近くのプレイヤー（船が見えている相手）に届く。
 * 続けて送れるのは 2 秒に 1 回まで（サーバーも同じ間隔で確かめる）
 */
export function StampPanel({ ready, log }: { ready: boolean; log: StampLogItem[] }) {
  const [open, setOpen] = useState(false);
  const [coolUntil, setCoolUntil] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (coolUntil <= Date.now()) return;
    const t = setTimeout(() => setTick((n) => n + 1), coolUntil - Date.now());
    return () => clearTimeout(t);
  }, [coolUntil]);
  const cooling = coolUntil > Date.now();
  return (
    <div className="hud-stamps">
      {log.length > 0 && (
        <ul className="hud-panel hud-stamp-log" aria-label="スタンプの履歴">
          {log.map((l) => (
            <li key={l.key}>
              <span className="hud-stamp-dot" style={{ background: `hsl(${l.hue} 75% 60%)` }} aria-hidden="true" />
              <span className="hud-muted hud-small">{l.mine ? 'あなた' : 'ほかの船'}</span> {l.text}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="hud-panel hud-stamp-palette" role="dialog" aria-label="スタンプ">
          {STAMPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`hud-stamp-button${s.kind === 'phrase' ? ' is-phrase' : ''}`}
              disabled={!ready || cooling}
              onClick={() => {
                hudActions.sendStamp(s.id);
                setCoolUntil(Date.now() + STAMP_MIN_INTERVAL_MS);
              }}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="hud-button"
        disabled={!ready}
        aria-expanded={open}
        onClick={(e) => {
          setOpen((v) => !v);
          e.currentTarget.blur();
        }}
      >
        スタンプ
      </button>
    </div>
  );
}
