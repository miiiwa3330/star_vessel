import { useEffect, useState } from 'react';
import { fetchOnline } from '../net/presence';

/** 人数を読み直す間隔（ms）。サーバーも 15 秒覚えておくので、それより短くしても意味がない */
const REFRESH_MS = 30_000;

/** いま遊んでいる人数の 1 行。読めなかったときは null（出さない） */
export const onlineText = (online: number | null): string | null =>
  online === null ? null : online > 0 ? `いま ${online.toLocaleString('ja-JP')} 人が旅をしています` : 'いま旅をしている人は、いません';

/**
 * タイトル画面（要件 F48）。景色が主役で、文字は最小限：名前・一言・「はじめる」・いま遊んでいる人数だけ。
 * 宇宙の中に文字を出さない決まり（docs/design/README.md）と同じく、景色をふさがない。
 */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void fetchOnline().then((n) => alive && setOnline(n));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const text = onlineText(online);
  return (
    <main className="top-title-screen">
      <h1 className="top-title">STAR VESSEL</h1>
      <p className="top-tagline">地球から飛び立ち、世界中のプレイヤーと同じ宇宙を旅する。</p>
      <button type="button" className="top-button top-button-primary" onClick={onStart}>
        はじめる
      </button>
      <p className="top-online" role="status" aria-live="polite">
        {text ?? ' '}
      </p>
    </main>
  );
}
