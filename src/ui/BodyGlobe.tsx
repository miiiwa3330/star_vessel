import type { CSSProperties } from 'react';
import type { CollectionLook } from './collection-look';

/** 環の傾き（見た目のための値） */
const RING_TILT_DEG = -16;
const RING_SQUASH = 0.3;

/**
 * コレクション（図鑑）の天体の絵（2026-11-12）。CSS だけで描く（src/ui/collection-look.ts）。
 * spin：自転しているように、地図をゆっくり横に動かす（詳細の大きな絵）
 */
export function BodyGlobe({ look, size, spin = false }: { look: CollectionLook; size: number; spin?: boolean }) {
  const box: CSSProperties = { width: size, height: size };
  if (look.type === 'globe') {
    const outer = look.rings ? look.rings.outer : 1;
    // 環のある天体は、環が枠に収まるように球を小さくする
    const d = Math.round(look.rings ? size / outer : size * 0.86);
    const sphere: CSSProperties = {
      width: d,
      height: d,
      backgroundImage: `url("${look.url}")`,
      ['--cg-d' as string]: `${d}px`,
      boxShadow: look.atmosphere ? `0 0 ${Math.max(3, d * 0.08)}px ${look.atmosphere}` : undefined,
    };
    const ring = look.rings && (
      <RingPart d={d} inner={look.rings.inner} outer={look.rings.outer} color={look.rings.color} />
    );
    return (
      <div className={`cg cg-globe${spin ? ' is-spin' : ''}`} style={box} aria-hidden="true">
        {ring && <div className="cg-ring-wrap is-back">{ring}</div>}
        <div className="cg-sphere" style={sphere}>
          <div className="cg-shade" />
        </div>
        {ring && <div className="cg-ring-wrap is-front">{ring}</div>}
      </div>
    );
  }
  if (look.type === 'star') {
    return <div className="cg cg-star" style={{ ...box, ['--cg-color' as string]: look.color }} aria-hidden="true" />;
  }
  if (look.type === 'cluster') {
    return (
      <div className="cg" style={box} aria-hidden="true">
        <svg viewBox="-1 -1 2 2" width={size} height={size}>
          {CLUSTER_DOTS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.warm ? '#ffe2b8' : '#dfe8ff'} opacity={p.a} />
          ))}
        </svg>
      </div>
    );
  }
  if (look.type === 'craft') {
    return (
      <div className="cg cg-craft" style={box} aria-hidden="true">
        <svg viewBox="0 0 48 48" width={size * 0.62} height={size * 0.62} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <rect x="19" y="18" width="10" height="12" rx="1.5" />
          <path d="M19 24H13M29 24h6" />
          <rect x="3" y="19" width="10" height="10" />
          <rect x="35" y="19" width="10" height="10" />
          <path d="M8 19v10M40 19v10M24 18v-5M21.5 11.5a3.5 3.5 0 0 1 5 0" />
        </svg>
      </div>
    );
  }
  return <div className={`cg cg-${look.type}`} style={box} aria-hidden="true" />;
}

/** 環（後ろ半分と前半分で、球の後ろ・前に分けて描く。clip-path は傾ける前の向きで効く） */
function RingPart({ d, inner, outer, color }: { d: number; inner: number; outer: number; color: string }) {
  const w = d * outer;
  const i = (inner / outer) * 100;
  return (
    <div
      className="cg-ring"
      style={{
        width: w,
        height: w,
        marginLeft: -w / 2,
        marginTop: -w / 2,
        transform: `rotate(${RING_TILT_DEG}deg) scaleY(${RING_SQUASH})`,
        background: `radial-gradient(closest-side, transparent ${i}%, ${color} ${i + 1}%, ${color} 96%, transparent 100%)`,
      }}
    />
  );
}

/** 星団の点（誰の端末でも同じになるよう、決まった並び。中心ほど多い） */
const CLUSTER_DOTS = (() => {
  let s = 12345;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: 46 }, () => {
    const r = 0.82 * Math.sqrt(rand()) * rand();
    const a = rand() * 2 * Math.PI;
    return { x: r * Math.cos(a), y: r * Math.sin(a), r: 0.018 + 0.03 * rand() ** 3, a: 0.55 + 0.45 * rand(), warm: rand() < 0.3 };
  });
})();
