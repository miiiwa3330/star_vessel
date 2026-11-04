import { useSyncExternalStore } from 'react';
import { bodyInfo } from '../world/solar-system';
import { formatDistance, formatSpeed } from './format';
import { hudStore } from './hud-store';
import { Radar } from './Radar';
import { WarpPanel } from './WarpPanel';
import './hud.css';

export function Hud() {
  const s = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  const utc = s.date.toISOString().replace('T', ' ').slice(0, 19);
  return (
    <>
      <div className="hud-panel hud-status">
        <div className="hud-title">STAR VESSEL</div>
        <div>UTC {utc}</div>
        <div>
          {bodyInfo(s.anchor).nameJa}の表面から {formatDistance(s.altitudeKm)}
        </div>
        <div>{formatSpeed(s.speedKmS)}</div>
        <div className="hud-muted">描画：{s.backend}</div>
        {s.status && <div className="hud-warn">{s.status}</div>}
      </div>
      {s.notice && <div className="hud-panel hud-notice">{s.notice}</div>}
      <div className="hud-dock">
        <Radar blips={s.radar} />
        <WarpPanel warps={s.warps} shared={s.warpsShared} />
      </div>
      <div className="hud-bottom">
        <div className="hud-panel hud-help">
          <div className="hud-keyboard-only">
            ドラッグ：向きを変える ／ W・S：前後 ／ A・D：左右 ／ R・F：上下 ／ Q・E：傾き ／ ホイール・＋−：速さ
          </div>
          <div className="hud-touch-only">1 本指：向きを変える ／ 2 本指で触れている間：前へ</div>
          <div className="hud-muted">レーダー：上が進む方向 ／ ●自分より上 ○下 ／ ◆ワープホール</div>
        </div>
        <div className="hud-panel hud-credits">
          星：<a href="https://codeberg.org/astronexus/hyg">HYG v4.4</a>（
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>） ／ 地球・月の画像：
          <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a>（
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>）
        </div>
      </div>
    </>
  );
}
