import { useState } from 'react';
import { MAX_WARPS_PER_PLAYER } from '../world/warp-schema';
import { formatDistance } from './format';
import { hudActions, type WarpListItem } from './hud-store';

export function WarpPanel({ warps, ready }: { warps: WarpListItem[]; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const sorted = [...warps].sort((a, b) => a.distanceKm - b.distanceKm);
  const mine = warps.filter((w) => w.mine).length;
  return (
    <>
      <div className="hud-warp-buttons">
        <button
          type="button"
          className="hud-button"
          disabled={!ready}
          onClick={(e) => {
            hudActions.placeWarp();
            e.currentTarget.blur();
          }}
        >
          ここにワープホールを置く（{mine}/{MAX_WARPS_PER_PLAYER}）
        </button>
        <button
          type="button"
          className="hud-button"
          disabled={!ready}
          onClick={() => {
            if (!open) hudActions.refreshWarps();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
        >
          ワープ（{warps.length}）
        </button>
      </div>
      {open && (
        <div className="hud-panel hud-warp-list" role="dialog" aria-label="ワープホールの一覧">
          <div className="hud-warp-list-head">
            <span className="hud-title">ワープホール</span>
            <button type="button" className="hud-button hud-button-small" onClick={() => setOpen(false)}>
              閉じる
            </button>
          </div>
          <div className="hud-muted hud-small">全員のワープホール。自分が置けるのは {MAX_WARPS_PER_PLAYER} 個まで</div>
          {sorted.length === 0 ? (
            <div className="hud-muted">まだありません。行った場所で「ここにワープホールを置く」を押すと増えます。</div>
          ) : (
            <ul>
              {sorted.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="hud-warp-item"
                    onClick={() => {
                      hudActions.warpTo(w.id);
                      setOpen(false);
                    }}
                  >
                    <span className="hud-warp-item-main">
                      <span className="hud-code">{w.code}</span>
                      <span className="hud-muted hud-small">{w.reading}</span>
                    </span>
                    <span className="hud-muted hud-small">{formatDistance(w.distanceKm)}</span>
                  </button>
                  {w.mine && (
                    <button type="button" className="hud-button hud-button-small" onClick={() => hudActions.removeWarp(w.id)}>
                      消す
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
