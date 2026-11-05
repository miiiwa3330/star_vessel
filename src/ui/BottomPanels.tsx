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

type Panel = 'help' | 'credits' | null;

/**
 * 画面の左下：操作の説明とクレジットを、小さなボタンにしまう（2026-11-05 のオーナーの決定。画面を広く使うため）。
 * クレジットは CC BY・CC BY-SA の表記のため、いつでも開けるようにしておく
 */
export function BottomPanels({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState<Panel>(() => (helpSeen() ? null : 'help'));
  const toggle = (p: Exclude<Panel, null>) => {
    setOpen((cur) => (cur === p ? null : p));
    if (p === 'help' || open === 'help') {
      try {
        localStorage.setItem(HELP_SEEN_KEY, '1');
      } catch {
        // 覚えられなくても動く
      }
    }
  };
  return (
    <div className="hud-bottom" style={hidden ? { display: 'none' } : undefined}>
      {open === 'help' && (
        <div className="hud-panel hud-help" role="dialog" aria-label="操作の説明">
          <div className="hud-keyboard-only">
            ドラッグ：向きを変える ／ W・S：前後 ／ A・D：左右 ／ Space：上昇 ／ Shift＋Space：下降（R・F でも上下） ／ Q・E：傾き ／ ホイール・＋−：速さ（Shift で 10 倍ずつ） ／ V：視点（三人称では右ドラッグで回り込み、Alt＋ホイールで距離） ／ C：星座 ／ クリック：天体を選ぶ
          </div>
          <div className="hud-touch-only">1 本指：向きを変える ／ 2 本指で触れている間：前へ ／ タップ：天体を選ぶ</div>
          <div className="hud-muted">レーダー：上が進む方向 ／ ●自分より上 ○下 ／ ◆ワープホール ／ ▲ほかのプレイヤー</div>
        </div>
      )}
      {open === 'credits' && (
        <div className="hud-panel hud-credits" role="dialog" aria-label="クレジット">
          星：<a href="https://codeberg.org/astronexus/hyg">HYG v4.4</a>（
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>） ／ 系外惑星：
          <a href="https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue">Open Exoplanet Catalogue</a>（MIT） ／ 衛星・小惑星：
          <a href="https://ssd.jpl.nasa.gov/">NASA/JPL</a>、衛星の名前：<a href="https://www.wikidata.org/">Wikidata</a>（CC0） ／ 人工衛星：
          <a href="https://db.satnogs.org/">SatNOGS DB</a>（
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>） ／ 星団・白色矮星・パルサー・ブラックホール：
          <a href="https://vizier.cfa.harvard.edu/">VizieR</a>（Hunt &amp; Reffert 2023 ほか） ／ 天体の画像：
          <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a>（
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>） ／ 星（近く）：
          <a href="https://www.cosmos.esa.int/gaia">ESA Gaia DR3</a>（
          <a href="https://www.cosmos.esa.int/web/gaia-users/license">CC BY-SA 3.0 IGO</a>） ／ 星座の線：
          <a href="https://github.com/ofrohn/d3-celestial">d3-celestial</a>（BSD 3-Clause） ／ 星雲：
          <a href="https://simbad.cfa.harvard.edu/">SIMBAD</a>、<a href="https://github.com/mattiaverga/OpenNGC">OpenNGC</a>（
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>） ／ 銀河：Karachentsev ほか 2013（VizieR） ／ 系外惑星（追加）：
          <a href="https://exoplanetarchive.ipac.caltech.edu/">NASA Exoplanet Archive</a> ／ 探査機・彗星：NASA/JPL
        </div>
      )}
      <div className="hud-bottom-buttons">
        <button
          type="button"
          className={`hud-button hud-button-small${open === 'help' ? ' is-selected' : ''}`}
          aria-expanded={open === 'help'}
          onClick={(e) => {
            toggle('help');
            e.currentTarget.blur();
          }}
        >
          ？ 操作
        </button>
        <button
          type="button"
          className={`hud-button hud-button-small${open === 'credits' ? ' is-selected' : ''}`}
          aria-expanded={open === 'credits'}
          onClick={(e) => {
            toggle('credits');
            e.currentTarget.blur();
          }}
        >
          クレジット
        </button>
      </div>
    </div>
  );
}
