import {
  chooseRadarLabels,
  formatRingKm,
  placeBlips,
  radarRange,
  radarRingRadius,
  radarRings,
  type MapLayer,
  type RadarBlip,
} from '../world/radar';

/**
 * 名前を出すのは、ワープホール → 近い天体の順に、ほかの名前と重ならないものだけ、この数まで
 * （名前は小さく、レーダーの中だけ。docs/design/README.md）。大きくしたマップでは多く出す
 */
const MAX_LABELS = 5;
const MAX_LABELS_LARGE = 18;
/** 大きくしたマップでの、印と文字の大きさ（レーダーの座標の単位で、ふつうの何倍か）。画面の上で約 13px の文字になる */
const LARGE_SCALE = 0.55;

const COLORS = { body: '#d9e2ff', star: '#ffd59a', warp: '#74e6ff', ship: '#8dffb0' } as const;

/**
 * レーダー（マップ）。ふだんは画面の隅に小さく、押すと（M キーでも）画面の真ん中に大きく出す。
 * 範囲（ふちの距離）と出すものの種類は、マップで変えたものを、小さなレーダーでもそのまま使う（2026-11-12）。
 * 大きくしたときは、名前を多く出し、天体・恒星の点を押すとその天体を選び、ワープホールの点を押すとそのワープホールを選ぶ
 */
export function Radar({
  blips,
  rangeKm,
  layers,
  large = false,
  selectedKey = null,
  selectedWarp = null,
  onPickBody,
  onPickWarp,
}: {
  blips: RadarBlip[];
  rangeKm: number;
  layers: Record<MapLayer, boolean>;
  large?: boolean;
  selectedKey?: string | null;
  selectedWarp?: string | null;
  onPickBody?: (key: string) => void;
  onPickWarp?: (id: string) => void;
}) {
  const k = large ? LARGE_SCALE : 1;
  const range = radarRange(rangeKm);
  // 世界からは 1 秒に 10 回しか届かないので、範囲を変えている間は、ここで置き直す
  const shown = placeBlips(
    blips.filter((b) => layers[b.layer]),
    range,
  );
  const byDistance = shown.filter((b) => b.kind !== 'ship').sort((a, b) => a.distanceKm - b.distanceKm);
  const labeled = chooseRadarLabels(
    byDistance.map((b, i) => ({ id: `${b.kind}:${b.id}`, x: b.x, y: b.y, label: b.label, priority: (b.kind === 'warp' ? 0 : 1e6) + i })),
    large ? MAX_LABELS_LARGE : MAX_LABELS,
    shown.map((b) => ({ x: b.x, y: b.y })),
    0.09 * k,
    0.1 * k,
    0.035 * k,
  );
  const selected = shown.find((b) => (b.kind === 'body' || b.kind === 'star') && b.id === selectedKey);
  const warp = shown.find((b) => b.kind === 'warp' && b.id === selectedWarp);
  return (
    <svg className={`hud-radar${large ? ' is-large' : ''}`} viewBox="-1.12 -1.12 2.24 2.24" role="img" aria-label="レーダー">
      <circle r={1} className="hud-radar-edge" />
      {radarRings(range).map((km) => {
        const r = radarRingRadius(km, range);
        return (
          <g key={km}>
            <circle r={r} className="hud-radar-ring" />
            <text x={0.02} y={-r + 0.07 * k} className="hud-radar-ring-label" fontSize={0.07 * k}>
              {formatRingKm(km)}
            </text>
          </g>
        );
      })}
      <line x1={0} y1={0} x2={0} y2={-1} className="hud-radar-ring" />
      <RadarSweep />
      {shown.map((b) => {
        const color = COLORS[b.kind];
        const cx = b.x;
        const cy = -b.y;
        const fill = b.above ? color : 'none';
        const sw = 0.02 * k;
        const pick = !large
          ? undefined
          : b.kind === 'warp'
            ? onPickWarp && (() => onPickWarp(b.id))
            : b.kind === 'body' || b.kind === 'star'
              ? onPickBody && (() => onPickBody(b.id))
              : undefined;
        return (
          <g key={`${b.kind}:${b.id}`} opacity={b.clamped ? 0.5 : 1} className={pick ? 'hud-radar-pick' : undefined} onClick={pick}>
            {pick && <circle className="hud-radar-hit" cx={cx} cy={cy} r={0.05} />}
            {b.kind === 'ship' ? (
              <path
                d={`M ${cx} ${cy - 0.04 * k} L ${cx + 0.033 * k} ${cy + 0.03 * k} L ${cx - 0.033 * k} ${cy + 0.03 * k} Z`}
                fill={fill}
                stroke={color}
                strokeWidth={0.015 * k}
              />
            ) : b.kind === 'warp' ? (
              <rect
                x={cx - 0.035 * k}
                y={cy - 0.035 * k}
                width={0.07 * k}
                height={0.07 * k}
                transform={`rotate(45 ${cx} ${cy})`}
                fill={fill}
                stroke={color}
                strokeWidth={sw}
              />
            ) : b.kind === 'star' ? (
              <path d={starPath(cx, cy, 0.05 * k)} fill={fill} stroke={color} strokeWidth={0.014 * k} strokeLinejoin="round" />
            ) : (
              <circle cx={cx} cy={cy} r={(b.id === 'Sun' ? 0.05 : 0.03) * k} fill={fill} stroke={color} strokeWidth={sw} />
            )}
          </g>
        );
      })}
      {/* 選んだ天体・ワープホールの印（宇宙の中の輪と同じオレンジ） */}
      {large && selected && <circle cx={selected.x} cy={-selected.y} r={0.045} className="hud-radar-selected" />}
      {large && warp && <circle cx={warp.x} cy={-warp.y} r={0.045} className="hud-radar-selected" />}
      {/* 名前は点の印より上に描く（あとから描いた印に隠されないように） */}
      {shown
        .filter((b) => labeled.has(`${b.kind}:${b.id}`))
        .map((b) => (
          <text
            key={`label:${b.kind}:${b.id}`}
            x={b.x + 0.06 * k}
            y={-b.y + 0.03 * k}
            className="hud-radar-label"
            fontSize={0.09 * k}
            strokeWidth={0.025 * k}
            fill={COLORS[b.kind]}
            opacity={b.clamped ? 0.5 : 1}
          >
            {b.label}
          </text>
        ))}
      <path d={`M 0 ${-0.07 * k} L ${0.05 * k} ${0.05 * k} L 0 ${0.02 * k} L ${-0.05 * k} ${0.05 * k} Z`} fill="#ffffff" />
    </svg>
  );
}

/**
 * 回る緑の光（2026-11-12 にオーナーの指示。レーダーらしい演出）。先の明るい線と、後ろに薄れていく扇。
 * 扇は SVG に円すいのグラデーションが無いので、細い扇を重ねて作る。回すのは CSS（動きを減らす設定では止めて消す）
 */
const SWEEP_DEG = 80;
const SWEEP_SLICES = 20;
const SWEEP: { d: string; opacity: number }[] = Array.from({ length: SWEEP_SLICES }, (_, i) => {
  // 上（0 度）が先。時計回りに回るので、後ろは反時計回りの側
  const a0 = (-(i + 1) * SWEEP_DEG) / SWEEP_SLICES;
  const a1 = (-i * SWEEP_DEG) / SWEEP_SLICES;
  const p = (deg: number) => `${Math.sin((deg * Math.PI) / 180)} ${-Math.cos((deg * Math.PI) / 180)}`;
  return { d: `M 0 0 L ${p(a0)} A 1 1 0 0 1 ${p(a1)} Z`, opacity: 0.26 * (1 - i / SWEEP_SLICES) ** 1.6 };
});
function RadarSweep() {
  return (
    <g className="hud-radar-sweep" aria-hidden="true">
      {SWEEP.map((s, i) => (
        <path key={i} d={s.d} fill="#5eff72" opacity={s.opacity} />
      ))}
      <line x1={0} y1={0} x2={0} y2={-1} className="hud-radar-sweep-line" />
    </g>
  );
}

/** 4 つの角の星の形（ほかの恒星の点） */
function starPath(cx: number, cy: number, r: number): string {
  const i = r * 0.38;
  return `M ${cx} ${cy - r} L ${cx + i} ${cy - i} L ${cx + r} ${cy} L ${cx + i} ${cy + i} L ${cx} ${cy + r} L ${cx - i} ${cy + i} L ${cx - r} ${cy} L ${cx - i} ${cy - i} Z`;
}
