import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { AuthMode } from './AuthLinks';
import { Backdrop, type ScrollState } from './Backdrop';
import { TitleScreen } from './TitleScreen';
// 準備画面はアカウントの部品（Better Auth）を使うので大きい。タイトル画面を軽く開くため、開くときに読み込む
const ReadyScreen = lazy(() => import('./ReadyScreen').then((m) => ({ default: m.ReadyScreen })));

import { pathForScreen, screenForPath, type TopScreen } from './routes';
import { attachSectionWheel } from './section-scroll';

/**
 * タイトル画面と準備画面（要件 F48）。URL（/ と /ready）と戻るボタンに合わせて切り替える。
 * 背景は 2 つの画面で共通（画面を切り替えても星がちらつかないように、ここに 1 つだけ置く）。
 */
export function TopApp() {
  const [screen, setScreen] = useState<TopScreen>(() => screenForPath(location.pathname));
  /** タイトル画面の SIGN IN・SIGN UP から準備画面へ来たとき、アカウントの入力を最初から開く（戻る・再読み込みでは、開かない） */
  const [authMode, setAuthMode] = useState<AuthMode | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    const onPop = () => {
      setScreen(screenForPath(location.pathname));
      setAuthMode(undefined);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // auth：タイトル画面の SIGN IN・SIGN UP から来たとき、準備画面でアカウントの入力を開く（URL には出さない）
  const go = useCallback((next: TopScreen, auth?: AuthMode) => {
    history.pushState(null, '', pathForScreen(next) + location.search);
    setAuthMode(auth);
    setScreen(next);
  }, []);

  // キーボード（Space・PageDown など）でスクロールできるよう、スクロールする箱に焦点を置く（Tab の順には入れない）。
  // 画面が変わるたびに置き直す（準備画面も、長いと、スクロールするため）
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [screen]);

  // 最初の画面と詳細の間は、ホイールを少し回しただけでも、隣の画面まで動かす（section-scroll.ts）
  useEffect(() => {
    const root = rootRef.current;
    if (!root || screen !== 'title') return;
    return attachSectionWheel(root, () => root.querySelector<HTMLElement>('.top-hero')?.offsetHeight || root.clientHeight || 1);
  }, [screen]);

  /**
   * タイトル画面のスクロールの位置（背景の地球を動かすため）。progress：最初の画面の高さを 1 とした位置（0〜1。1 で詳細の画面）、
   * pastPx：1 を超えた分（px。地球を画面の外へ送る）。準備画面は、スクロールしても地球を動かさない
   */
  const getScroll = useCallback((): ScrollState => {
    const root = rootRef.current;
    if (!root || screenRef.current !== 'title') return { progress: 0, pastPx: 0 };
    const heroHeight = root.querySelector<HTMLElement>('.top-hero')?.offsetHeight || root.clientHeight || 1;
    return { progress: Math.min(1, root.scrollTop / heroHeight), pastPx: Math.max(0, root.scrollTop - heroHeight) };
  }, []);

  return (
    <div ref={rootRef} tabIndex={-1} className={`top${screen === 'title' ? ' is-title' : ''}`}>
      <Backdrop getScroll={getScroll} />
      {screen === 'title' ? (
        <TitleScreen onStart={() => go('ready')} onAuth={(mode) => go('ready', mode)} />
      ) : (
        <Suspense fallback={null}>
          <ReadyScreen onBack={() => go('title')} initialMode={authMode} />
        </Suspense>
      )}
    </div>
  );
}
