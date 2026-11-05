import { useEffect, useState } from 'react';
import { fetchOnline } from '../net/presence';

/** 人数を読み直す間隔（ms）。サーバーも 15 秒覚えておくので、それより短くしても意味がない */
const REFRESH_MS = 30_000;

/** いま遊んでいる人数の 1 行。読めなかったときは null（出さない） */
export const onlineText = (online: number | null): string | null =>
  online === null ? null : online > 0 ? `いま ${online.toLocaleString('ja-JP')} 人が旅をしています` : 'いま旅をしている人は、いません';

/** いま遊んでいる人数（要件 F50）。読めるまでは null。画面が開いている間、読み直す */
export function useOnline(): number | null {
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
  return online;
}
