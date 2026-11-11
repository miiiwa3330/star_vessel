import { useState } from 'react';
import { hudActions } from './hud-store';

/**
 * ゲームメニュー（PC で Esc を押すと出る。要件 F60）。マインクラフトの一時停止の画面を真似た。
 * ほかのプレイヤーがいる宇宙なので、世界の時間は止めない（操縦だけ止まる）。
 * 背景を少し暗くするだけで、まわりのボタン（ワープ・スタンプなど）はこの間に押せる。画面のほかの場所をクリックしても戻る。
 * 操作の説明（「？ 操作」）もこの画面の中に置く
 */
export function PauseMenu() {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="hud-pause">
      <div className="hud-panel hud-pause-menu" role="dialog" aria-label="ゲームメニュー">
        <div className="hud-title">ゲームメニュー</div>
        <button type="button" className="hud-button hud-pause-button" onClick={() => hudActions.resume()} autoFocus>
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
            <div className="hud-keyboard-only">
              マウス：向きを変える（Esc で一時停止） ／ W・S：前後 ／ A・D：左右 ／ Space：上昇 ／ Shift：下降 ／ W の 2 回押し・Ctrl：ダッシュ ／ Q・E：傾き ／ ホイール・＋−：速さ（Ctrl で 10 倍ずつ） ／ F5・V：視点（三人称では右ボタンを押しながらで回り込み、Alt＋ホイールで距離） ／ F3：左上の表示 ／ C：星座 ／ クリック：照準の先の天体を選ぶ
            </div>
            <div className="hud-touch-only">
              ドラッグ：向きを変える ／ 左下：前後左右（前を 2 回押しでダッシュ） ／ 右下：上昇・下降 ／ タップ：天体を選ぶ
            </div>
            <div className="hud-muted">レーダー：上が進む方向 ／ ●自分より上 ○下 ／ ◆ワープホール ／ ▲ほかのプレイヤー</div>
          </div>
        )}
        <button type="button" className="hud-button hud-pause-button" onClick={() => window.location.assign('/')}>
          タイトルへ
        </button>
        <div className="hud-muted hud-small">画面をクリックしても戻れます。Esc でまたこの画面</div>
      </div>
    </div>
  );
}
