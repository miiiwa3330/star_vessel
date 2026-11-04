import { useState } from 'react';
import { formatDistance } from './format';
import { hudActions, type WarpListItem } from './hud-store';

export function WarpPanel({ warps, shared }: { warps: WarpListItem[]; shared: boolean }) {
  const [open, setOpen] = useState(false);
  const sorted = [...warps].sort((a, b) => a.distanceKm - b.distanceKm);
  return (
    <>
      <div className="hud-warp-buttons">
        <button
          type="button"
          className="hud-button"
          onClick={(e) => {
            hudActions.placeWarp();
            e.currentTarget.blur();
          }}
        >
          ここにワープホールを置く
        </button>
        <button type="button" className="hud-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
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
          {!shared && <div className="hud-warn hud-small">いまはこの端末の中だけに保存されます（全員との共有は準備中）</div>}
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
                    <span>{w.name}</span>
                    <span className="hud-muted">{formatDistance(w.distanceKm)}</span>
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
