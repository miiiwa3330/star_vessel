import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { AuthLinks, type AuthMode } from './AuthLinks';
import { ServiceDetails } from './ServiceDetails';
import { SocialLinks } from './SocialLinks';

/**
 * タイトル画面の中の様子。
 *   title：最初の画面（名前・一言・「-START-」）。下にスクロールすると、サービスの詳細
 *   select：「-START-」を押したあと。一言が消え、名前が少し上がり、地球との間に宇宙船（UFO）が 3 つ並ぶ。「-START-」は「-Go!-」になる。
 *           スクロールはできない。名前を押すと title に戻る
 *   away：SIGN IN・SIGN UP を押したあと。カメラが月へ飛んでいる間と、アカウントの箱が開いている間、帰ってくる間。文字を隠す
 */
export type TitlePhase = 'title' | 'select' | 'away';

/**
 * タイトル画面（要件 F48）。2 つの画面が縦に並ぶ：
 *   1. 最初の画面：景色が主役で、文字は名前・一言・「-START-」だけ。進むのは「-START-」のまわりをタップ（クリック）したとき
 *      （2026-11-06 に、画面全体から変更）。枠のあるボタンは置かない
 *   2. スクロールした先：サービスの詳細（ServiceDetails）。スクロールは、2 つの画面の間で止まらずに、どちらかへ吸い付く（top.css の scroll-snap）
 * 右上に、SIGN IN と SIGN UP（AuthLinks。押すと、月まで飛んで、アカウントの箱が開く）。右下に、X と Miiiwa のアイコン。
 * 宇宙の中に文字を出さない決まり（docs/design/README.md）と同じく、景色をふさがない。
 */
export function TitleScreen({
  phase,
  going,
  error,
  picker,
  authVersion,
  onStart,
  onBack,
  onGo,
  onStep,
  onAuth,
  onSignedIn,
}: {
  phase: TitlePhase;
  /** 出発の途中（GO を押したあと） */
  going: boolean;
  /** 出発できなかった理由（無ければ null） */
  error: string | null;
  /** 宇宙船を選ぶ列（UfoPicker） */
  picker: ReactNode;
  authVersion: number;
  onStart: () => void;
  onBack: () => void;
  onGo: () => void;
  /** 選んでいる船を隣へ（左：−1、右：+1） */
  onStep: (delta: number) => void;
  onAuth: (mode?: AuthMode) => void;
  onSignedIn: (signedIn: boolean) => void;
}) {
  // どこにも焦点が無いときの Enter は、進む（画面全体のタップはやめたので、キーボードの人のために残す）。
  // Space は、ページをスクロールするために使うので、奪わない。選ぶ画面では、左右の矢印で船を送り、Esc で戻る
  useEffect(() => {
    if (phase === 'away') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (phase === 'select' && !document.querySelector('dialog[open]')) {
        if (e.key === 'Escape') return onBack();
        if (e.key === 'ArrowLeft') return onStep(-1);
        if (e.key === 'ArrowRight') return onStep(1);
      }
      if (e.key !== 'Enter' || e.repeat) return;
      // 焦点が、ボタンやリンクにあるときは、それぞれの動きに任せる（スクロールの箱 .top にあるのは、何も選んでいないのと同じ）
      const active = document.activeElement;
      if (active && active !== document.body && !active.classList.contains('top')) return;
      e.preventDefault();
      if (phase === 'select') onGo();
      else onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onStart, onBack, onGo, onStep]);

  const selecting = phase === 'select';
  return (
    <main className="top-title-screen">
      <AuthLinks onAuth={onAuth} version={authVersion} away={phase === 'away'} onSignedIn={onSignedIn} />
      <SocialLinks />
      <section className={`top-hero is-${phase}`} aria-hidden={phase === 'away'}>
        <h1
          className="top-title"
          {...(selecting
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-label': 'STAR VESSEL（タイトルへ戻る）',
                onClick: onBack,
                onKeyDown: (e: ReactKeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onBack();
                  }
                },
              }
            : {})}
        >
          STAR VESSEL
        </h1>
        <div className="top-tagline-wrap">
          <p className="top-tagline" lang="en">Travel the same universe as players around the world.</p>
        </div>
        {picker}
        {/* 見た目は枠の無い文字。まわり（約 330×110px）をタップできる。選ぶ画面では、同じボタンが「-Go!-」になる */}
        <button
          type="button"
          className={`top-start${selecting ? ' is-go' : ''}`}
          onClick={selecting ? onGo : onStart}
          disabled={going || phase === 'away'}
          aria-label={selecting ? '出発する' : undefined}
        >
          <span className="top-start-word top-start-a">-START-</span>
          <span className="top-start-word top-start-b">{going ? '-…-' : '-Go!-'}</span>
        </button>
        {selecting && error && <p className="top-error top-go-error" role="alert">{error}</p>}
      </section>
      <ServiceDetails />
    </main>
  );
}
