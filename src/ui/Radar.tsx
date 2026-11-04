import { RADAR_RANGE, type RadarBlip } from '../world/radar';

/** 目盛りの輪（km） */
const RINGS: { km: number; label: string }[] = [
  { km: 1e5, label: '10万km' },
  { km: 1e7, label: '1千万km' },
  { km: 1e9, label: '10億km' },
];
/** 名前を出すのは、近い天体からこの数まで（名前は小さく、レーダーの中だけ。docs/design/README.md） */
const LABELED_BODIES = 3;

const ringRadius = (km: number) =>
  Math.log(km / RADAR_RANGE.minKm) / Math.log(RADAR_RANGE.maxKm / RADAR_RANGE.minKm);

const COLORS = { body: '#d9e2ff', warp: '#74e6ff', ship: '#8dffb0' } as const;

export function Radar({ blips }: { blips: RadarBlip[] }) {
  const labeled = new Set(
    blips
      .filter((b) => b.kind === 'body')
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, LABELED_BODIES)
      .map((b) => b.id),
  );
  return (
    <svg className="hud-radar" viewBox="-1.12 -1.12 2.24 2.24" role="img" aria-label="レーダー">
      <circle r={1} className="hud-radar-edge" />
      {RINGS.map((ring) => (
        <g key={ring.km}>
          <circle r={ringRadius(ring.km)} className="hud-radar-ring" />
          <text x={0.02} y={-ringRadius(ring.km) + 0.07} className="hud-radar-ring-label">
            {ring.label}
          </text>
        </g>
      ))}
      <line x1={0} y1={0} x2={0} y2={-1} className="hud-radar-ring" />
      {blips.map((b) => {
        const color = COLORS[b.kind];
        const cx = b.x;
        const cy = -b.y;
        const fill = b.above ? color : 'none';
        return (
          <g key={`${b.kind}:${b.id}`} opacity={b.clamped ? 0.5 : 1}>
            {b.kind === 'warp' ? (
              <rect x={cx - 0.035} y={cy - 0.035} width={0.07} height={0.07} transform={`rotate(45 ${cx} ${cy})`} fill={fill} stroke={color} strokeWidth={0.02} />
            ) : (
              <circle cx={cx} cy={cy} r={b.id === 'Sun' ? 0.05 : 0.03} fill={fill} stroke={color} strokeWidth={0.02} />
            )}
            {(b.kind === 'warp' || labeled.has(b.id)) && (
              <text x={cx + 0.06} y={cy + 0.03} className="hud-radar-label" fill={color}>
                {b.label}
              </text>
            )}
          </g>
        );
      })}
      <path d="M 0 -0.07 L 0.05 0.05 L 0 0.02 L -0.05 0.05 Z" fill="#ffffff" />
    </svg>
  );
}
