import { useEffect, useRef, useState } from 'react';
import { visitApi } from '../net/visit-repository';
import type { Visit } from '../world/visits';
import { CollectionPanel } from '../ui/CollectionPanel';
import { loadCollectionSource } from '../ui/collection-loader';
import '../ui/hud.css';

/**
 * マイページ（火星の箱）の下の画面の、コレクション（図鑑。要件 F38・F55。2026-11-13 にオーナーの指示）。
 * 世界の画面の図鑑と同じもの（CollectionPanel）を、画面いっぱいの面として置く。
 * 図鑑のデータ（約 9 MB）は、下へスクロールして図鑑が画面に入ったときに初めて読む（マイページを開いただけでは読まない）
 */
export default function MyCollection() {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el || state !== 'idle') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setState('loading');
        Promise.all([loadCollectionSource(), visitApi.list()])
          .then(([, v]) => {
            setVisits(v);
            setState('ready');
          })
          .catch((e: unknown) => {
            console.error(e);
            setState('error');
          });
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [state]);

  // マイページのホイールは、2 つの画面の間を動かす（AuthBox）。コレクションの画面にいる間は、中のスクロールできる所
  // （詳細の説明など）をホイールで動かし、それ以上動けない上向きのときだけ、上の画面へ戻す
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const box = el.closest<HTMLElement>('.top-auth-box');
      if (!box || box.scrollTop < el.offsetTop - 2) return;
      for (let n = e.target instanceof HTMLElement ? e.target : null; n && n !== el; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          const can = e.deltaY > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0;
          if (can) {
            e.stopPropagation();
            return;
          }
        }
      }
      // 図鑑の下の端まで来ていたら、下向きは何もしない（それまでは、マイページの面を動かす）
      if (e.deltaY > 0 && box.scrollTop + box.clientHeight >= box.scrollHeight - 1) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <section ref={ref} className="top-mypage-collection hud-scope" aria-label="コレクション">
      {state === 'ready' ? (
        <CollectionPanel visits={visits} embedded />
      ) : (
        <div className="top-mypage-wait">
          <p className="top-eyebrow">COLLECTION</p>
          <p className="top-hint" role="status">
            {state === 'error' ? 'コレクションを読めませんでした。あとでもう一度開いてください。' : '読み込んでいます…'}
          </p>
        </div>
      )}
    </section>
  );
}
