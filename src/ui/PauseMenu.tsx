import { useState } from 'react';
import { hudActions } from './hud-store';
import { KeyboardGuide } from './KeyboardGuide';

/**
 * ゲームメニュー（PC で Esc を押すと出る。要件 F60）。マインクラフトの一時停止の画面を真似た。
 * ほかのプレイヤーがいる宇宙なので、世界の時間は止めない（操縦だけ止まる）。
 * 2026-11-12 にオーナーの指示で：後ろは画面全体をすりガラスにし、メニューのボタンのほかは押せない（画面をクリックしても戻らない）。
 * 戻るのは「ゲームに戻る」か Esc。入ったばかりのときは出さない（クリックで操縦をはじめる）。
 * 操作の説明（「？ 操作」）もこの画面の中に置く。開くと、キーボードとマウスの図（KeyboardGuide）を出す
 */
export function PauseMenu() {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="hud-pause">
      <div className={`hud-pause-menu${helpOpen ? ' is-help' : ''}`} role="dialog" aria-modal="true" aria-label="ゲームメニュー">
        <p className="hud-eyebrow">MENU</p>
        <button type="button" className="hud-button hud-pause-button" onClick={() => hudActions.setOverlay(null)} autoFocus>
          ゲームに戻る
        </button>
        <button
          type="button"
          className={`hud-button hud-pause-button${helpOpen ? ' is-selected' : ''}`}
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((cur) => !cur)}
        >
          ？ 操作
        </button>
        {helpOpen && (
          <div className="hud-help" role="region" aria-label="操作の説明">
            <KeyboardGuide />
          </div>
        )}
        <button type="button" className="hud-button hud-pause-button" onClick={() => window.location.assign('/')}>
          タイトルへ
        </button>
        <div className="hud-pause-note">Esc でもゲームに戻れます</div>
      </div>
    </div>
  );
}
