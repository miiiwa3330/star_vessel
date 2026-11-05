import { useState } from 'react';

/** 操作の説明を一度見たか（localStorage。初めて遊ぶときだけ開いておく） */
const HELP_SEEN_KEY = 'star_vessel.helpSeen';

const helpSeen = (): boolean => {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

export function BottomPanels({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState<boolean>(() => !helpSeen());
  const toggle = () => {
    setOpen((cur) => !cur);
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch {
      // 覚えられなくても動く
    }
  };
  return (
    <div className="hud-bottom" style={hidden ? { display: 'none' } : undefined}>
      {open && (
        <div className="hud-panel hud-help" role="dialog" aria-label="操作の説明">
          <div className="hud-keyboard-only">
            ドラッグ：向きを変える ／ W・S：前後 ／ A・D：左右 ／ Space：上昇 ／ Shift＋Space：下降（R・F でも上下） ／ Q・E：傾き ／ ホイール・＋−：速さ（Shift で 10 倍ずつ） ／ V：視点（三人称では右ドラッグで回り込み、Alt＋ホイールで距離） ／ C：星座 ／ クリック：天体を選ぶ
          </div>
          <div className="hud-touch-only">1 本指：向きを変える ／ 2 本指で触れている間：前へ ／ タップ：天体を選ぶ</div>
          <div className="hud-muted">レーダー：上が進む方向 ／ ●自分より上 ○下 ／ ◆ワープホール ／ ▲ほかのプレイヤー</div>
        </div>
      )}
      <div className="hud-bottom-buttons">
        <button
          type="button"
          className={`hud-button hud-button-small${open ? ' is-selected' : ''}`}
          aria-expanded={open}
          onClick={(e) => {
            toggle();
            e.currentTarget.blur();
          }}
        >
          ？ 操作
        </button>
      </div>
    </div>
  );
}
