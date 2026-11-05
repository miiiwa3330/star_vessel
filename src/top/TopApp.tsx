import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Backdrop } from './Backdrop';
import { TitleScreen } from './TitleScreen';
// 準備画面はアカウントの部品（Better Auth）を使うので大きい。タイトル画面を軽く開くため、開くときに読み込む
const ReadyScreen = lazy(() => import('./ReadyScreen').then((m) => ({ default: m.ReadyScreen })));

import { pathForScreen, screenForPath, type TopScreen } from './routes';

/**
 * タイトル画面と準備画面（要件 F48）。URL（/ と /ready）と戻るボタンに合わせて切り替える。
 * 背景は 2 つの画面で共通（画面を切り替えても星がちらつかないように、ここに 1 つだけ置く）。
 */
export function TopApp() {
  const [screen, setScreen] = useState<TopScreen>(() => screenForPath(location.pathname));

  useEffect(() => {
    const onPop = () => setScreen(screenForPath(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: TopScreen) => {
    history.pushState(null, '', pathForScreen(next) + location.search);
    setScreen(next);
  }, []);

  return (
    <div className="top">
      <Backdrop />
      {screen === 'title' ? (
        <TitleScreen onStart={() => go('ready')} />
      ) : (
        <Suspense fallback={null}>
          <ReadyScreen onBack={() => go('title')} />
        </Suspense>
      )}
    </div>
  );
}
