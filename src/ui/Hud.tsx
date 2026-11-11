import { useState, useSyncExternalStore } from 'react';
import '@fontsource/monoton/400.css';
import '@fontsource/dotgothic16/400.css';
import { formatCoordinates, formatDistance, formatSpeed } from './format';
import { STAR_LIMIT_NAMES_JA } from '../world/stars';
import { hudActions, hudStore } from './hud-store';
import { Radar } from './Radar';
import { WarpPanel } from './WarpPanel';
import { StampPanel } from './StampPanel';
import { InfoCard } from './InfoCard';
import { NearbyPanel } from './NearbyPanel';
import { CollectionPanel } from './CollectionPanel';
import { AimLabel } from './AimLabel';
import { PauseMenu } from './PauseMenu';
import { TouchPad } from './TouchPad';
import './hud.css';

export function Hud() {
  const s = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  const [warpOpen, setWarpOpen] = useState(false);
  const utc = s.date.toISOString().replace('T', ' ').slice(0, 19);
  const toggleCollection = () => {
    if (s.leftPanel !== 'collection') setWarpOpen(false);
    hudActions.toggleLeftPanel('collection');
  };
  const toggleWarp = () => {
    if (!warpOpen) {
      if (s.leftPanel === 'collection') hudActions.toggleLeftPanel('collection');
      hudActions.refreshWarps();
    }
    setWarpOpen((v) => !v);
  };
  return (
    <>
      {/* ゲームメニューは一番先に置き、後ろを暗くする。まわりのボタンは、この上に重なって押せる */}
      {s.paused && <PauseMenu />}
      <div className="hud-left">
        <header className="hud-brand">STAR VESSEL</header>
        {s.statusVisible && (
          <div className="hud-status">
            <div>UTC {utc}</div>
            <div>
              {s.anchorName}の表面から {formatDistance(s.altitudeKm)}
            </div>
            <div>{formatSpeed(s.speedKmS)}</div>
            <Coordinates v={s.fromEarthKm} />
            {s.region && <div>{s.region}</div>}
            {s.deepRegion && <div>{s.deepRegion}</div>}
            {s.nearbyShips !== null && <div>近くのプレイヤー：{s.nearbyShips} 人</div>}
            <div className="hud-muted">描画：{s.backend}</div>
            {s.status && <div className="hud-warn">{s.status}</div>}
          </div>
        )}
        <div className="hud-tabs" role="group" aria-label="パネル">
          {(
            [
              ['stamps', 'スタンプ'],
              ['nearby', '近く'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`hud-button hud-button-small${s.leftPanel === id ? ' is-selected' : ''}`}
              aria-pressed={s.leftPanel === id}
              onClick={(e) => {
                hudActions.toggleLeftPanel(id);
                e.currentTarget.blur();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 情報のカード：PC は画面の上の真ん中（position: fixed）、スマホはこの列の中（右上のレーダーに重ならないように） */}
        {s.infoCard && <InfoCard card={s.infoCard} />}
        <StampPanel ready={s.stampReady} log={s.stampLog} open={s.leftPanel === 'stamps'} />
        {s.leftPanel === 'nearby' && <NearbyPanel sections={s.nearby} selectedKey={s.selectedKey} />}
      </div>
      {s.notice && <div className="hud-panel hud-notice">{s.notice}</div>}
      <div className="hud-dock">
        <Radar blips={s.radar} />
      </div>
      {s.leftPanel === 'collection' && <CollectionPanel visits={s.visits} />}
      {warpOpen && <WarpPanel warps={s.warps} ready={s.warpsReady} onClose={() => setWarpOpen(false)} />}
      <div className="hud-hotbar" role="toolbar" aria-label="メニュー">
        <button
          type="button"
          className={`hud-button hud-icon-button${s.leftPanel === 'collection' ? ' is-selected' : ''}`}
          aria-label={`コレクション（${s.visits.length}）`}
          title={`コレクション（${s.visits.length}）`}
          aria-pressed={s.leftPanel === 'collection'}
          onClick={(e) => {
            toggleCollection();
            e.currentTarget.blur();
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" />
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H19" />
            <path d="m12 7 1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 13l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4L12 7Z" />
          </svg>
        </button>
        <button
          type="button"
          className="hud-button hud-icon-button"
          aria-label={`星の見え方：${STAR_LIMIT_NAMES_JA[s.starLimit]}`}
          title={`星の見え方：${STAR_LIMIT_NAMES_JA[s.starLimit]}`}
          onClick={(e) => {
            hudActions.cycleStarLimit();
            e.currentTarget.blur();
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3Z" />
            <path d="M19 3v3M20.5 4.5h-3M5 17v2M6 18H4" />
          </svg>
        </button>
        <button
          type="button"
          className={`hud-button hud-icon-button${s.constellations ? ' is-selected' : ''}`}
          aria-label={`星座：${s.constellations ? '表示中' : '非表示'}`}
          title={`星座：${s.constellations ? '表示中' : '非表示'}`}
          aria-pressed={s.constellations}
          onClick={(e) => {
            hudActions.toggleConstellations();
            e.currentTarget.blur();
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="5" cy="6" r="1.8" fill="currentColor" />
            <circle cx="12" cy="9" r="1.8" fill="currentColor" />
            <circle cx="19" cy="5" r="1.8" fill="currentColor" />
            <circle cx="15" cy="18" r="1.8" fill="currentColor" />
            <path d="M6.6 6.7 10.4 8.3M13.6 8.1 17.4 5.9M12.6 10.7 14.4 16.3" />
          </svg>
        </button>
        <button
          type="button"
          className={`hud-button hud-icon-button${warpOpen ? ' is-selected' : ''}`}
          aria-label={`ワープ（${s.warps.length}）`}
          title={`ワープ（${s.warps.length}）`}
          aria-expanded={warpOpen}
          disabled={!s.warpsReady}
          onClick={(e) => {
            toggleWarp();
            e.currentTarget.blur();
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-25 12 12)" />
            <ellipse cx="12" cy="12" rx="5" ry="2.4" transform="rotate(-25 12 12)" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="hud-speed-buttons hud-touch-only">
        <button type="button" className="hud-button" onClick={() => hudActions.changeSpeed(1)} aria-label="速くする">
          速く
        </button>
        <button type="button" className="hud-button" onClick={() => hudActions.changeSpeed(-1)} aria-label="遅くする">
          遅く
        </button>
      </div>
      <TouchPad hidden={false} />
      {!s.paused && <AimLabel aim={s.aimLabel} constellation={s.aimConstellation} />}
    </>
  );
}

/** 地球を原点にした座標（天の赤道の向き。X が春分点、Z が天の北極） */
function Coordinates({ v }: { v: { x: number; y: number; z: number } }) {
  const c = formatCoordinates(v);
  return (
    <div className="hud-coords" title="地球の中心を原点にした座標（X：春分点の方向、Z：天の北極の方向）">
      <span>X {c.x}</span> <span>Y {c.y}</span> <span>Z {c.z}</span> <span className="hud-muted">{c.unit}</span>
    </div>
  );
}
