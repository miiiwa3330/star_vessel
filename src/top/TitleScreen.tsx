import { useCallback, useEffect, useRef } from 'react';
import { ServiceDetails } from './ServiceDetails';
import { SocialLinks } from './SocialLinks';

/**
 * タイトル画面（要件 F48）。2 つの画面が縦に並ぶ：
 *   1. 最初の画面：景色が主役で、文字は名前・一言・「-START-」だけ。進むのは「-START-」のまわりをタップ（クリック）したとき
 *      （2026-11-06 に、画面全体から変更）。枠のあるボタンは置かない
 *   2. スクロールした先：サービスの詳細（ServiceDetails）。スクロールは、2 つの画面の間で止まらずに、どちらかへ吸い付く（top.css の scroll-snap）
 * 右上に、X と Miiiwa のアイコン。
 * 宇宙の中に文字を出さない決まり（docs/design/README.md）と同じく、景色をふさがない。
 */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  // 1 回の操作で 2 回進まないように（ボタンを Enter で押すと、キーとクリックの両方が届くことがある）
  const started = useRef(false);
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    onStart();
  }, [onStart]);

  // どこにも焦点が無いときの Enter は、進む（画面全体のタップはやめたので、キーボードの人のために残す）。
  // Space は、ページをスクロールするために使うので、奪わない
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      // 焦点が、ボタンやリンクにあるときは、それぞれの動きに任せる（スクロールの箱 .top にあるのは、何も選んでいないのと同じ）
      const active = document.activeElement;
      if (active && active !== document.body && !active.classList.contains('top')) return;
      e.preventDefault();
      start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start]);

  return (
    <main className="top-title-screen">
      <SocialLinks />
      <section className="top-hero">
        <h1 className="top-title">STAR VESSEL</h1>
        <p className="top-tagline" lang="en">Travel the same universe as players around the world.</p>
        {/* 見た目は枠の無い文字。まわり（約 330×110px）をタップできる */}
        <button type="button" className="top-start" onClick={start}>
          -START-
        </button>
      </section>
      <ServiceDetails />
    </main>
  );
}
