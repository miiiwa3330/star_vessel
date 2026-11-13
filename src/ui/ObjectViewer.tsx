import { forwardRef, useEffect, useRef } from 'react';
import { mulberry32 } from '../world/random';
import { globeExtent, projectCloud, renderGlobe, type CloudPoint, type GlobeOptions, type SurfaceMap } from './globe-render';
import { globeMap, type CollectionLook } from './collection-look';
import { CraftIcon } from './BodyGlobe';

/** ドラッグ 1 px で回る角度・ひとりでに回る速さ（ラジアン/秒）・止まるまでの速さの減り方 */
const ROTATE_PER_PX = 0.012;
const AUTO_SPIN = 0.22;
const DAMPING = 3.2;
const PITCH_LIMIT = 1.45;

/**
 * 図鑑の詳細の天体（2026-11-12。要件 F38）。**ドラッグ（スマホは指）でくるくる回せる**。離すと少し滑ってから、ゆっくりひとりでに回る。
 * 球の天体・恒星・ブラックホールは globe-render の 1 画素ずつの絵、星団・銀河・星雲・彗星は 3D の点の集まり、人工の物は線の絵を CSS で回す。
 * unknown：まだ訪れていない天体（黒いシルエット）
 */
export const ObjectViewer = forwardRef<HTMLDivElement, { look: CollectionLook; size: number; unknown?: boolean }>(function ObjectViewer(
  { look, size, unknown = false },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const craftRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = { yaw: 0.6, pitch: look.type === 'galaxy' ? 0.75 : look.type === 'black-hole' ? 0.32 : 0.28, vy: 0, vp: 0, dragging: false, dirty: true };
    let map: SurfaceMap | null = null;
    let cloud: CloudPoint[] | null = null;
    let alive = true;
    if (look.type === 'globe' || look.type === 'star') {
      if (!unknown) void globeMap(look).then((m) => {
        if (!alive) return;
        map = m;
        state.dirty = true;
      });
    } else if (look.type !== 'black-hole' && look.type !== 'craft') cloud = makeCloud(look);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // 1 画素ずつ描く球は、重さを抑えるため、少し粗く描いて広げる
    const res = Math.round(size * (cloud ? dpr : Math.min(dpr, 1.25)));
    let image: ImageData | null = null;
    if (canvas && ctx) {
      canvas.width = res;
      canvas.height = res;
      if (!cloud) image = ctx.createImageData(res, res);
    }
    const globeOpts = (): GlobeOptions => {
      if (look.type === 'star') return { yaw: state.yaw, pitch: state.pitch, emissive: true, color: look.color };
      if (look.type === 'black-hole')
        return { yaw: state.yaw, pitch: state.pitch, color: [0, 0, 0], emissive: true, ring: { inner: 1.6, outer: 4.4, color: [255, 160, 70], alpha: 0.95, emissive: true } };
      if (look.type === 'globe')
        return { yaw: state.yaw, pitch: state.pitch, color: [120, 120, 120], atmosphere: look.atmosphere, ring: look.ring };
      return { yaw: state.yaw, pitch: state.pitch };
    };
    const draw = () => {
      if (craftRef.current) {
        craftRef.current.style.transform = `rotateX(${-state.pitch}rad) rotateY(${state.yaw}rad)`;
        return;
      }
      if (!ctx) return;
      if (image) {
        renderGlobe(image.data, res, unknown ? null : map, unknown ? { ...globeOpts(), color: [0, 0, 0], atmosphere: undefined } : globeOpts());
        ctx.putImageData(image, 0, 0);
        return;
      }
      if (cloud) {
        ctx.clearRect(0, 0, res, res);
        ctx.globalCompositeOperation = unknown ? 'source-over' : 'lighter';
        for (const q of projectCloud(cloud, state.yaw, state.pitch)) {
          const x = (q.x * 0.47 + 0.5) * res;
          const y = (-q.y * 0.47 + 0.5) * res;
          const s = Math.max(0.6, q.p.s * res);
          const a = q.p.a * (0.75 + 0.25 * q.z);
          if (q.p.s > 0.02) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, s);
            g.addColorStop(0, `rgba(${q.p.r}, ${q.p.g}, ${q.p.b}, ${a})`);
            g.addColorStop(1, `rgba(${q.p.r}, ${q.p.g}, ${q.p.b}, 0)`);
            ctx.fillStyle = g;
          } else ctx.fillStyle = `rgba(${q.p.r}, ${q.p.g}, ${q.p.b}, ${a})`;
          ctx.beginPath();
          ctx.arc(x, y, s, 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    // ドラッグで回す
    let last: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      box.setPointerCapture(e.pointerId);
      state.dragging = true;
      state.vy = 0;
      state.vp = 0;
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const move = (e: PointerEvent) => {
      if (!state.dragging || !last) return;
      const now = performance.now();
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const dt = Math.max(1, now - last.t) / 1000;
      state.yaw += dx * ROTATE_PER_PX;
      state.pitch = clamp(state.pitch + dy * ROTATE_PER_PX, -PITCH_LIMIT, PITCH_LIMIT);
      state.vy = (dx * ROTATE_PER_PX) / dt;
      state.vp = (dy * ROTATE_PER_PX) / dt;
      state.dirty = true;
      last = { x: e.clientX, y: e.clientY, t: now };
    };
    const up = () => {
      state.dragging = false;
      last = null;
    };
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);

    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!state.dragging) {
        const k = Math.exp(-DAMPING * dt);
        state.vy *= k;
        state.vp *= k;
        const auto = reduce ? 0 : AUTO_SPIN;
        // 滑りが弱まったら、ひとりでにゆっくり回る
        const spin = Math.abs(state.vy) > auto ? state.vy : state.vy + (auto - state.vy) * (1 - k);
        state.vy = spin;
        if (Math.abs(state.vy) > 1e-3 || Math.abs(state.vp) > 1e-3) {
          state.yaw += state.vy * dt;
          state.pitch = clamp(state.pitch + state.vp * dt, -PITCH_LIMIT, PITCH_LIMIT);
          state.dirty = true;
        }
      }
      if (state.dirty) {
        state.dirty = false;
        draw();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
    };
  }, [look, size, unknown]);

  const ext = look.type === 'globe' ? globeExtent({ ring: look.ring, atmosphere: look.atmosphere }) : look.type === 'black-hole' ? 4.5 : 1;
  return (
    <div
      ref={(el) => {
        boxRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={`ov ov-${look.type}${unknown ? ' is-unknown' : ''}`}
      style={{
        width: size,
        height: size,
        ['--ov-ext' as string]: ext,
        ...(look.type === 'star' ? { ['--ov-glow' as string]: `rgba(${look.color.map(Math.round).join(', ')}, 0.55)` } : {}),
      }}
      role="img"
      aria-label="ドラッグで回せます"
    >
      {look.type === 'craft' ? (
        <div className="ov-craft-stage">
          <div ref={craftRef} className="ov-craft">
            <CraftIcon size={size * 0.7} />
          </div>
        </div>
      ) : (
        <canvas ref={canvasRef} className="ov-canvas" style={{ width: size, height: size }} />
      )}
    </div>
  );
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 点の集まりを作る（種から決まる。誰の端末でも同じ形。見た目のための形で、観測の形ではない） */
export function makeCloud(look: CollectionLook): CloudPoint[] {
  const rand = mulberry32('seed' in look ? look.seed : 1);
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 4; i++) s += rand();
    return (s - 2) / 0.58;
  };
  const pts: CloudPoint[] = [];
  const star = (x: number, y: number, z: number, s: number, warm: number, a = 1) => {
    const t = warm;
    pts.push({ x, y, z, s, r: Math.round(200 + 55 * t), g: Math.round(215 + 20 * (1 - Math.abs(t - 0.5))), b: Math.round(255 - 90 * t), a });
  };
  if (look.type === 'cluster') {
    const n = look.globular ? 900 : 160;
    for (let i = 0; i < n; i++) {
      // 球状星団は中心に集まる（プラマーの分布。外へはみ出したものは選び直す）、散開星団はまばら
      let r = 2;
      while (r > 1) r = look.globular ? 0.16 / Math.sqrt(Math.max(1e-3, rand() ** (-2 / 3) - 1)) : 0.85 * Math.cbrt(rand());
      const u = 2 * rand() - 1;
      const th = rand() * 2 * Math.PI;
      const rr = r;
      const sxy = Math.sqrt(1 - u * u);
      star(rr * sxy * Math.cos(th), rr * u, rr * sxy * Math.sin(th), (look.globular ? 0.005 : 0.008) + 0.012 * rand() ** 6, look.globular ? 0.55 + 0.4 * rand() : rand() * 0.6, look.globular ? 0.5 : 0.9);
    }
  } else if (look.type === 'galaxy') {
    const t = look.tType ?? 4;
    const elliptical = t <= -1;
    const irregular = t >= 9;
    // 中心のふくらみ
    for (let i = 0; i < (elliptical ? 1400 : 380); i++) {
      const k = elliptical ? 0.75 : 0.22;
      star(gauss() * k * 0.5, gauss() * k * (elliptical ? 0.32 : 0.16), gauss() * k * 0.5, 0.005 + 0.006 * rand(), 0.75 + 0.25 * rand(), 0.55);
    }
    if (!elliptical) {
      const arms = irregular ? 0 : 2;
      for (let i = 0; i < 1600; i++) {
        const r = 0.12 + 0.85 * Math.sqrt(rand());
        let th = rand() * 2 * Math.PI;
        if (arms > 0 && rand() < 0.78) {
          const arm = Math.floor(rand() * arms);
          th = (arm / arms) * 2 * Math.PI + Math.log(r / 0.12) * 2.2 + gauss() * 0.28;
        }
        const blue = rand() < 0.55;
        const x = r * Math.cos(th) + (irregular ? gauss() * 0.18 : 0);
        const z = r * Math.sin(th) + (irregular ? gauss() * 0.18 : 0);
        star(x, gauss() * 0.025, z, 0.004 + 0.007 * rand(), blue ? 0.1 * rand() : 0.4 + 0.3 * rand(), 0.6);
        // 星の生まれる所の、ほんのり赤い光
        if (blue && rand() < 0.04) pts.push({ x, y: 0, z, s: 0.03 + 0.03 * rand(), r: 255, g: 120, b: 170, a: 0.22 });
      }
    }
  } else if (look.type === 'nebula') {
    // 種類ごとの色：電離した水素（赤・桃）、惑星状星雲（青緑の殻）、超新星残骸（すじ）、反射星雲（青）、暗黒星雲（茶）
    const palette: Record<string, [number, number, number][]> = {
      hii: [
        [255, 90, 140],
        [255, 150, 120],
        [140, 200, 255],
      ],
      pn: [
        [90, 230, 220],
        [120, 160, 255],
        [255, 120, 150],
      ],
      snr: [
        [255, 160, 90],
        [120, 170, 255],
        [255, 110, 130],
      ],
      rn: [
        [120, 170, 255],
        [170, 200, 255],
        [210, 220, 255],
      ],
      dn: [
        [120, 80, 60],
        [90, 60, 50],
        [160, 120, 90],
      ],
    };
    const cols = palette[look.nebula] ?? palette.hii;
    const shell = look.nebula === 'pn' || look.nebula === 'snr';
    for (let i = 0; i < 520; i++) {
      let x: number;
      let y: number;
      let z: number;
      if (shell) {
        const u = 2 * rand() - 1;
        const th = rand() * 2 * Math.PI;
        const r = (look.nebula === 'pn' ? 0.55 : 0.75) + gauss() * 0.06;
        const s = Math.sqrt(1 - u * u);
        x = r * s * Math.cos(th);
        y = r * u * (look.nebula === 'pn' ? 0.8 : 1);
        z = r * s * Math.sin(th);
      } else {
        x = gauss() * 0.32;
        y = gauss() * 0.24;
        z = gauss() * 0.3;
      }
      const c = cols[Math.floor(rand() * cols.length)];
      pts.push({ x, y, z, s: 0.05 + 0.08 * rand(), r: c[0], g: c[1], b: c[2], a: look.nebula === 'dn' ? 0.35 : shell ? 0.09 : 0.045 });
    }
    // 中の星
    for (let i = 0; i < 24; i++) star(gauss() * 0.3, gauss() * 0.25, gauss() * 0.3, 0.005 + 0.006 * rand(), rand() * 0.4, 0.8);
    if (look.nebula === 'pn') star(0, 0, 0, 0.018, 0, 1);
  } else if (look.type === 'comet') {
    // 核と、太陽と反対の向き（ここでは −x）へのびる尾
    pts.push({ x: 0.55, y: 0, z: 0, s: 0.05, r: 255, g: 255, b: 255, a: 1 });
    pts.push({ x: 0.55, y: 0, z: 0, s: 0.16, r: 170, g: 220, b: 255, a: 0.5 });
    for (let i = 0; i < 700; i++) {
      const t = rand();
      const spread = 0.02 + t * 0.22;
      const dust = rand() < 0.5;
      pts.push({
        x: 0.55 - t * 1.45,
        y: gauss() * spread + (dust ? -t * t * 0.25 : 0),
        z: gauss() * spread,
        s: 0.02 + 0.05 * rand(),
        r: dust ? 255 : 130,
        g: dust ? 230 : 190,
        b: dust ? 190 : 255,
        a: 0.12 * (1 - t),
      });
    }
  }
  return pts;
}
