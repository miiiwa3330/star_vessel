import { useCallback, useEffect, useRef } from 'react';

/**
 * タイトル画面（要件 F48）。景色が主役で、文字は最小限：名前・一言・「-START-」だけ。
 * 画面のどこをタップ（クリック）しても、Enter・Space を押しても、次へ進む。枠のあるボタンは置かない。
 * 宇宙の中に文字を出さない決まり（docs/design/README.md）と同じく、景色をふさがない。
 */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  // 1 回の操作で 2 回進まないように（ボタンを Enter で押すと、キーとクリックの両方が届く）
  const started = useRef(false);
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    onStart();
  }, [onStart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start]);

  return (
    <main className="top-title-screen" onClick={start}>
      <h1 className="top-title">STAR VESSEL</h1>
      <p className="top-tagline">地球から飛び立ち、世界中のプレイヤーと同じ宇宙を旅する。</p>
      {/* 見た目は枠の無い文字。画面全体がタップできるので、これは読み上げとキーボード（Tab）のための本物のボタン */}
      <button type="button" className="top-start">
        -START-
      </button>
    </main>
  );
}
