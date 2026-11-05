import { useSyncExternalStore } from 'react';
import { formatCoordinates, formatDistance, formatSpeed } from './format';
import { STAR_LIMIT_NAMES_JA } from '../world/stars';
import { hudActions, hudStore } from './hud-store';
import { Radar } from './Radar';
import { WarpPanel } from './WarpPanel';
import { ShipBuilder } from './ShipBuilder';
import { StampPanel } from './StampPanel';
import { InfoCard } from './InfoCard';
import { NearbyPanel } from './NearbyPanel';
import { CollectionPanel } from './CollectionPanel';
import { AimLabel } from './AimLabel';
import { BottomPanels } from './BottomPanels';
import './hud.css';

export function Hud() {
  const s = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  const utc = s.date.toISOString().replace('T', ' ').slice(0, 19);
  return (
    <>
      <div className="hud-left">
        <div className="hud-panel hud-status">
          <div className="hud-title">STAR VESSEL</div>
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
        {!s.shipBuilder && (
          <div className="hud-tabs" role="group" aria-label="パネル">
            {(
              [
                ['stamps', 'スタンプ'],
                ['nearby', '近く'],
                ['collection', 'コレクション'],
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
        )}
        {/* 情報のカード：PC は画面の上の真ん中（position: fixed）、スマホはこの列の中（右上のレーダーに重ならないように） */}
        {!s.shipBuilder && s.infoCard && <InfoCard card={s.infoCard} />}
        {!s.shipBuilder && <StampPanel ready={s.stampReady} log={s.stampLog} open={s.leftPanel === 'stamps'} />}
        {!s.shipBuilder && s.leftPanel === 'nearby' && <NearbyPanel sections={s.nearby} selectedKey={s.selectedKey} />}
        {!s.shipBuilder && s.leftPanel === 'collection' && <CollectionPanel visits={s.visits} />}
      </div>
      {s.notice && <div className="hud-panel hud-notice">{s.notice}</div>}
      <div className="hud-dock" style={s.shipBuilder ? { display: 'none' } : undefined}>
        <Radar blips={s.radar} />
        <WarpPanel warps={s.warps} ready={s.warpsReady} />
        <div className="hud-view-buttons">
          <button type="button" className="hud-button" onClick={(e) => { hudActions.toggleView(); e.currentTarget.blur(); }}>
            視点：{s.viewMode === 'first' ? '一人称' : '三人称'}
          </button>
          {s.viewMode === 'third' && (
            <button
              type="button"
              className="hud-button hud-touch-only"
              aria-pressed={s.orbitDrag}
              onClick={() => hudActions.toggleOrbitDrag()}
            >
              {s.orbitDrag ? 'ドラッグ：カメラを回す' : 'ドラッグ：船の向き'}
            </button>
          )}
          <button type="button" className="hud-button" onClick={(e) => { hudActions.cycleStarLimit(); e.currentTarget.blur(); }}>
            星：{STAR_LIMIT_NAMES_JA[s.starLimit]}
          </button>
          <button
            type="button"
            className={`hud-button${s.constellations ? ' is-selected' : ''}`}
            aria-pressed={s.constellations}
            onClick={(e) => { hudActions.toggleConstellations(); e.currentTarget.blur(); }}
          >
            星座：{s.constellations ? '表示中' : '非表示'}
          </button>
          <button
            type="button"
            className="hud-button"
            disabled={!s.shipReady}
            onClick={(e) => { hudActions.openShipBuilder(); e.currentTarget.blur(); }}
          >
            宇宙船
          </button>
        </div>
      </div>
      {s.shipBuilder && <ShipBuilder state={s.shipBuilder} />}

      <div className="hud-speed-buttons hud-touch-only" style={s.shipBuilder ? { display: 'none' } : undefined}>
        <button type="button" className="hud-button" onClick={() => hudActions.changeSpeed(1)} aria-label="速くする">
          速く
        </button>
        <button type="button" className="hud-button" onClick={() => hudActions.changeSpeed(-1)} aria-label="遅くする">
          遅く
        </button>
      </div>
      {/* 宇宙船を作る画面を開いている間は、下の説明と右のボタンを隠す（重なるため） */}
      {!s.shipBuilder && <AimLabel aim={s.aimLabel} constellation={s.aimConstellation} />}
      <BottomPanels hidden={s.shipBuilder !== null} />
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
