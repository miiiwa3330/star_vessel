import { useEffect, useRef, type CSSProperties } from 'react';
import { drawCloud, initialPitch, INITIAL_YAW, isCloudLook, makeCloud } from './cloud-picture';
import { cssRgb, globeThumbUrl, paintStar, type CollectionLook } from './collection-look';
import { renderGlobe } from './globe-render';
import { drawConstellation } from './constellation-picture';

/** 環の傾き（見た目のための値） */
const RING_TILT_DEG = -16;
const RING_SQUASH = 0.3;

/**
 * コレクション（図鑑）の一覧の、天体の小さな絵（2026-11-12）。球は CSS だけで描く（1 ページに 15 個並ぶので軽く）。
 * 星団・銀河・星雲・彗星は、詳細の絵と同じ点の集まり（cloud-picture.ts）を、小さな canvas に 1 回だけ描く（2026-11-13。天体ごとに形が違う）。
 * unknown：まだ訪れていない天体。黒いシルエットにする（模様は描かない。形だけ分かるよう、ふちをうっすら光らせる）
 */
export function BodyGlobe({ look, size, unknown = false }: { look: CollectionLook; size: number; unknown?: boolean }) {
  const box: CSSProperties = { width: size, height: size };
  const cls = `cg${unknown ? ' is-unknown' : ''}`;
  if (look.type === 'globe') {
    const outer = look.ring ? look.ring.outer : 1;
    // 環のある天体は、環が枠に収まるように球を小さくする
    const d = Math.round(look.ring ? size / outer : size * 0.86);
    const sphere: CSSProperties = {
      width: d,
      height: d,
      backgroundImage: unknown ? undefined : `url("${globeThumbUrl(look)}")`,
      boxShadow: look.atmosphere && !unknown ? `0 0 ${Math.max(3, d * 0.08)}px ${cssRgb(look.atmosphere, 0.55)}` : undefined,
    };
    const ring = look.ring && <RingPart d={d} inner={look.ring.inner} outer={look.ring.outer} color={cssRgb(look.ring.color, 0.8)} />;
    return (
      <div className={`${cls} cg-globe`} style={box} aria-hidden="true">
        {ring && <div className="cg-ring-wrap is-back">{ring}</div>}
        <div className="cg-sphere" style={sphere}>
          <div className="cg-shade" />
        </div>
        {ring && <div className="cg-ring-wrap is-front">{ring}</div>}
      </div>
    );
  }
  if (look.type === 'star') return <StarThumb look={look} size={size} unknown={unknown} />;
  if (isCloudLook(look)) return <CloudThumb look={look} size={size} unknown={unknown} />;
  if (look.type === 'constellation') return <ConstellationThumb look={look} size={size} unknown={unknown} />;
  if (look.type === 'craft') {
    return (
      <div className={`${cls} cg-craft`} style={box} aria-hidden="true">
        <CraftIcon size={size * 0.62} />
      </div>
    );
  }
  return <div className={`${cls} cg-${look.type}`} style={box} aria-hidden="true" />;
}

/** 一覧の恒星の球は、光の広がりの分を空けて、枠より少し小さく描く */
const STAR_THUMB_FILL = 0.8;

/**
 * 恒星の小さな絵。詳細の絵（ObjectViewer.tsx）と同じ球（表面の模様・大きさ・光の広がり）を、小さな canvas に 1 回だけ描く
 * （2026-11-13。一覧と詳細で見た目をそろえる）。模様は小さく（128×64）描くので、15 個並べても軽い
 */
function StarThumb({ look, size, unknown }: { look: Extract<CollectionLook, { type: 'star' }>; size: number; unknown: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const res = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = res;
    canvas.height = res;
    const image = ctx.createImageData(res, res);
    const map = unknown ? null : paintStar(look.color, look.picture.surface, look.seed, 128, 64);
    renderGlobe(image.data, res, map, { yaw: INITIAL_YAW, pitch: initialPitch(look), emissive: true, color: unknown ? [0, 0, 0] : look.color });
    ctx.putImageData(image, 0, 0);
  }, [look, size, unknown]);
  const scale = look.picture.size * STAR_THUMB_FILL;
  // 光の広がり：詳細（幅 340 px で 6〜36 px）と同じ割合。縮めた分を戻して、画面の上で同じ幅になるように
  const glowPx = ((6 + 30 * look.picture.glow) * (size / 340)) / scale;
  const glow = unknown ? undefined : `drop-shadow(0 0 ${glowPx.toFixed(1)}px ${cssRgb(look.color, 0.35 + 0.45 * look.picture.glow)}) drop-shadow(0 0 ${(glowPx * 0.4).toFixed(1)}px ${cssRgb(look.color, 0.5)})`;
  return (
    <div className={`cg cg-star${unknown ? ' is-unknown' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <canvas ref={ref} style={{ display: 'block', width: size, height: size, transform: `scale(${scale.toFixed(3)})`, filter: glow }} />
    </div>
  );
}

/** 星座の小さな絵：地球から見た線と星（絵は重ねない。詳細で押すと重なる） */
function ConstellationThumb({ look, size, unknown }: { look: Extract<CollectionLook, { type: 'constellation' }>; size: number; unknown: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const res = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = res;
    canvas.height = res;
    drawConstellation(ctx, res, look.figure, unknown);
  }, [look, size, unknown]);
  return (
    <div className={`cg cg-cloud cg-constellation${unknown ? ' is-unknown' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <canvas ref={ref} style={{ width: size, height: size }} />
    </div>
  );
}

/** 長軸の向きが分からない銀河の傾き（見た目のための値） */
const UNKNOWN_ROLL_DEG = -20;

/** 点の集まりの小さな絵。銀河は、地球から見た傾きと長軸の向き（北が上・東が左）で描く */
function CloudThumb({ look, size, unknown }: { look: Extract<CollectionLook, { type: 'cluster' | 'galaxy' | 'nebula' | 'comet' }>; size: number; unknown: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const res = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = res;
    canvas.height = res;
    drawCloud(ctx, res, makeCloud(look), INITIAL_YAW, initialPitch(look), { unknown, pointScale: 1.4, starAlpha: look.type === 'galaxy' ? 0.4 : 0.8 });
  }, [look, size, unknown]);
  const roll = look.type === 'galaxy' ? (look.picture.rollDeg ?? UNKNOWN_ROLL_DEG) : look.type === 'comet' ? -30 : 0;
  return (
    <div className={`cg cg-cloud cg-${look.type}${unknown ? ' is-unknown' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <canvas ref={ref} style={{ width: size, height: size, transform: roll ? `rotate(${roll}deg)` : undefined }} />
    </div>
  );
}

/** 人工衛星・探査機の線の絵 */
export function CraftIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="19" y="18" width="10" height="12" rx="1.5" />
      <path d="M19 24H13M29 24h6" />
      <rect x="3" y="19" width="10" height="10" />
      <rect x="35" y="19" width="10" height="10" />
      <path d="M8 19v10M40 19v10M24 18v-5M21.5 11.5a3.5 3.5 0 0 1 5 0" />
    </svg>
  );
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
