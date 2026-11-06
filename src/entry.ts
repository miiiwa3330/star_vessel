/**
 * ブラウザの入口。URL で、何を出すかを分ける。
 *
 * - /play：世界（操縦席）。約 78 MB のデータを読んで動くので、ここだけで読み込む
 * - それ以外（/ など）：タイトル画面（src/top/。船を選ぶ・アカウントも、この中）。世界は読み込まず、軽く開く
 *
 * どの URL も同じ index.html を返す（wrangler.jsonc の assets・開発サーバーの既定）。
 */
import { isPlayPath } from './top/routes';

if (isPlayPath(location.pathname)) {
  void import('./main');
} else {
  void import('./top/main');
}
