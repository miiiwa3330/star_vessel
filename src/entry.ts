/**
 * ブラウザの入口。URL で、何を出すかを分ける。
 *
 * - /play：世界（操縦席）。約 78 MB のデータを読んで動くので、ここだけで読み込む
 * - それ以外（/ など）：タイトル画面（src/top/。船を選ぶ・アカウントも、この中）。世界は読み込まず、軽く開く
 *
 * どの URL も同じ index.html を返す（wrangler.jsonc の assets・開発サーバーの既定）。
 */
import { isPlayPath } from './top/routes';
import { showLoading } from './loading-screen';

/**
 * 横向きのスワイプ（トラックパッドの二本指など）で、ブラウザが前のページへ戻らないようにする（2026-11-21。オーナーの指示）。
 * 縦は、どちらの画面も自分でホイールを扱うので、ここでは止めない。横に流す一覧（overflow-x）の中だけは、そのまま流す。
 * 指のスワイプでの「戻る」「読み込み直す」は、index.html の overscroll-behavior で止める
 */
window.addEventListener(
  'wheel',
  (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    for (let el = e.target instanceof Element ? e.target : null; el; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return;
    }
    e.preventDefault();
  },
  { passive: false },
);

if (isPlayPath(location.pathname)) {
  // 世界のデータ（大きい）を読んでいる間は、ローディング画面を出す。最初の 1 枚が描けたら main.ts が消す
  showLoading();
  void import('./main');
} else {
  void import('./top/main');
}
