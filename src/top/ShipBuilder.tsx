import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { BLOCK_SIZES, MAX_BLOCKS, PALETTE, type Block, type BlockSize } from '../world/ship-blocks';
import { BuildDoc, fits, mirroredPositions, placementFor, planeHit, raycast, regionFor, type Hit, type Mirror } from '../world/ship-builder';
import { HULL_TYPES, HULLS } from '../world/ship-design';
import { presetBlocks } from '../world/ship-presets';
import type { BuilderScene } from './builder-scene';

type Tool = 'place' | 'erase' | 'paint';
const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'place', label: '置く', key: 'B' },
  { id: 'erase', label: '消す', key: 'E' },
  { id: 'paint', label: '塗る', key: 'P' },
];

/** この距離（px）以上動いたら、押したのではなく、回すドラッグ */
const DRAG_PX = 6;
/** ロック中に、この長さ（ms）押し続けると、なぞって続けて使える */
const LONG_PRESS_MS = 280;
/** なぞりで、指の動きの間を埋める間隔（px）。速くなぞっても、間が空かないように */
const STROKE_STEP_PX = 4;
/** ひな形の一覧の幅（px。top.css の .sb-menu と同じ） */
const MENU_WIDTH = 200;
/** 「やめる」をもう一度押すのを待つ長さ（ms） */
const CONFIRM_MS = 3000;

/** なぞっている途中のこと。plane：置くときに沿う平面（最初に置いた面）。last：最後に使った位置（同じ所で何度も使わない） */
interface Stroke {
  tool: Tool;
  plane: { axis: 0 | 1 | 2; sign: 1 | -1; face: number } | null;
  last: string;
}

/**
 * 宇宙船を作る画面（要件 F27。2026-11-21 にオーナーの指示）。タイトル画面の船を選ぶ段階で、「＋」（新しく作る）か、
 * 真ん中のマイ UFO（作り直す）を押すと開く。
 *
 * - 作れる範囲は 40 m の箱。ブロックは 0.5 m・1 m・2 m の 3 種類と、色の表（光る色もある）から選ぶ
 * - 消す・塗るも、選んでいる大きさの範囲で使う（2 m のブロックの 1 m 分だけ消す・塗る、ができる）
 * - ドラッグで回す、ホイール・ピンチで近づく。押した（クリック・タップした）所に、選んでいる道具（置く・消す・塗る）を使う
 * - ロック：カメラを止める。ロック中は、長押ししてからなぞると、なぞった所に続けて使える（置くときは、最初に置いた面と同じ平面に沿う）
 * - PC：右クリックで消す、Alt＋クリックで色を取る、Ctrl（⌘）＋Z で元に戻す、1・2・3 でブロックの大きさ、B・E・P で道具、L でロック
 * - 左右・前後の対称：映した位置にも、同じことをする
 *
 * 3D の描画は builder-scene.ts（three.js なので遅れて読む）、置く位置などの計算は src/world/ship-builder.ts。
 */
export function ShipBuilder({
  initial,
  onSave,
  onCancel,
}: {
  /** 作り直す船（新しく作るときは null。空から始める） */
  initial: readonly Block[] | null;
  /** 保存する。失敗したら例外（画面に理由を出す） */
  onSave: (blocks: readonly Block[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [doc] = useState(() => new BuildDoc(initial ?? []));
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState<Tool>('place');
  const [size, setSize] = useState<BlockSize>(1);
  const [color, setColor] = useState(1);
  const [mirror, setMirror] = useState<Mirror>({ x: true, z: false });
  const [locked, setLocked] = useState(false);
  /** ひな形の一覧（開いていなければ null）。道具の面（すりガラス）の中に置くと、スマホで面の外が切れるので、画面に直接置く */
  const [templatesAt, setTemplatesAt] = useState<{ left: number; top: number } | null>(null);
  const templatesOpen = templatesAt !== null;
  const closeTemplates = () => setTemplatesAt(null);
  /** ひな形のボタンの横（スマホは下）に、一覧を開く */
  const toggleTemplates = (button: HTMLElement) => {
    if (templatesOpen) return closeTemplates();
    const r = button.getBoundingClientRect();
    const narrow = window.innerWidth <= 720;
    setTemplatesAt(
      narrow
        ? { left: Math.max(12, Math.min(r.left, window.innerWidth - MENU_WIDTH - 12)), top: r.bottom + 8 }
        : { left: r.right + 10, top: Math.min(r.top, window.innerHeight - 220) },
    );
  };
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const changed = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BuilderScene | null>(null);
  /** 船の形を描き直すか（なぞっている間は 1 フレームに 1 回だけ描き直す） */
  const meshDirty = useRef(false);
  // 毎フレーム・イベントの中から読む値（React の再描画を待たない）
  const live = useRef({ tool, size, color, mirror, locked });
  live.current = { tool, size, color, mirror, locked };
  const lastHover = useRef<{ x: number; y: number } | null>(null);

  // ---- 3D ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let observer: ResizeObserver | null = null;
    void (async () => {
      try {
        const { BuilderScene } = await import('./builder-scene');
        const scene = await BuilderScene.create(canvas);
        if (disposed) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        const resize = () => scene.setSize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio, 2));
        resize();
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
        scene.setBlocks(doc.blocks);
        setSceneState('ready');
        const frame = () => {
          if (meshDirty.current) {
            meshDirty.current = false;
            scene.setBlocks(doc.blocks);
          }
          scene.render();
          if (!disposed) raf = requestAnimationFrame(frame);
        };
        frame();
      } catch (e) {
        console.error('宇宙船を作る画面を 3D で描けない', e);
        if (!disposed) setSceneState('failed');
      }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [doc]);

  /** 画面の点（client px）から伸ばした線（マス） */
  const rayAt = useCallback((clientX: number, clientY: number) => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return null;
    const r = canvas.getBoundingClientRect();
    return scene.rayAt(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
  }, []);

  /** 画面の点（client px）から、指した先 */
  const hitAt = useCallback(
    (clientX: number, clientY: number): Hit | null => {
      const ray = rayAt(clientX, clientY);
      return ray ? raycast(doc.occupancy, ray.o, ray.d) : null;
    },
    [doc, rayAt],
  );

  /** 次に何が起きるかの印を出す（マウスを乗せている所） */
  const showGhost = useCallback(
    (clientX: number, clientY: number) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const { size: s, color: c, mirror: m, tool: t } = live.current;
      const hit = hitAt(clientX, clientY);
      if (!hit) return scene.setGhosts(null, s, 'place', c);
      if (t === 'place') {
        const ps = mirroredPositions(placementFor(hit, s), s, m);
        const ok = doc.blocks.length < MAX_BLOCKS && ps.some((p) => fits(doc.occupancy, p, s));
        return scene.setGhosts(ps, s, ok ? 'place' : 'blocked', c);
      }
      // 消す・塗る：選んでいる大きさの範囲
      const region = regionFor(hit, s);
      if (!region) return scene.setGhosts(null, s, 'place', c);
      scene.setGhosts(mirroredPositions(region, s, m), s, t === 'erase' ? 'erase' : 'paint', c);
    },
    [doc, hitAt],
  );

  const afterChange = useCallback(
    (now: boolean) => {
      changed.current = true;
      if (now) sceneRef.current?.setBlocks(doc.blocks);
      else meshDirty.current = true;
      setVersion((v) => v + 1);
      setMessage(null);
      if (lastHover.current) showGhost(lastHover.current.x, lastHover.current.y);
    },
    [doc, showGhost],
  );

  /** 指した先に道具を使う。変わったら true */
  const apply = useCallback(
    (hit: Hit, t: Tool, quiet: boolean): boolean => {
      const { size: s, color: c, mirror: m } = live.current;
      if (t === 'place') {
        const done = doc.place(placementFor(hit, s), s, c, m);
        if (!done && !quiet) setMessage(doc.blocks.length >= MAX_BLOCKS ? `ブロックは ${MAX_BLOCKS.toLocaleString()} 個までです` : 'そこには置けません');
        return done;
      }
      const region = regionFor(hit, s);
      if (!region) return false;
      const done = t === 'erase' ? doc.eraseRegion(region, s, m) : doc.paintRegion(region, s, c, m);
      // 範囲にかかったブロックを分けると、数の上限を超えることがある
      if (!done && !quiet && doc.hasCellsIn(region, s, m) && t === 'erase') setMessage(`ブロックを分けると ${MAX_BLOCKS.toLocaleString()} 個を超えます`);
      return done;
    },
    [doc],
  );

  /** 押した所に、道具を使う（1 回だけ） */
  const act = useCallback(
    (clientX: number, clientY: number, effective: Tool | 'pick') => {
      const hit = hitAt(clientX, clientY);
      if (!hit) return;
      if (effective === 'pick') {
        if (hit.kind === 'block') setColor(doc.blocks[hit.index].c);
        return;
      }
      if (apply(hit, effective, false)) afterChange(true);
    },
    [doc, hitAt, apply, afterChange],
  );

  // ---- なぞり（ロック中の長押しスライド） ----
  const stroke = useRef<Stroke | null>(null);

  /** なぞった所に、道具を使う。置くときは最初に置いた面と同じ平面に沿う（置いたブロックの上に積み上がらないように） */
  const strokeAt = useCallback(
    (clientX: number, clientY: number) => {
      const st = stroke.current;
      const ray = rayAt(clientX, clientY);
      if (!st || !ray) return;
      const s = live.current.size;
      let hit: Hit | null;
      if (st.tool === 'place' && st.plane) hit = planeHit(ray.o, ray.d, st.plane.axis, st.plane.sign, st.plane.face);
      else hit = raycast(doc.occupancy, ray.o, ray.d);
      if (!hit) return;
      const key = st.tool === 'place' ? placementFor(hit, s).join(',') : (regionFor(hit, s)?.join(',') ?? '');
      if (key === st.last) return;
      st.last = key;
      if (st.tool === 'place' && !st.plane) st.plane = { axis: hit.axis, sign: hit.sign, face: hit.face };
      if (apply(hit, st.tool, true)) afterChange(false);
    },
    [doc, rayAt, apply, afterChange],
  );

  const beginStroke = useCallback(
    (clientX: number, clientY: number, t: Tool) => {
      doc.beginStroke();
      stroke.current = { tool: t, plane: null, last: '' };
      sceneRef.current?.setGhosts(null, 0, 'place', 0);
      navigator.vibrate?.(12);
      strokeAt(clientX, clientY);
    },
    [doc, strokeAt],
  );

  const endStroke = useCallback(() => {
    if (!stroke.current) return;
    stroke.current = null;
    doc.endStroke();
    setVersion((v) => v + 1);
  }, [doc]);

  // ---- 指・マウス ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number; moved: boolean; button: number; alt: boolean; mouse: boolean; timer: number } | null>(null);
  const pinch = useRef<number | null>(null);

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    closeTemplates();
    if (pointers.current.size === 1) {
      const x = e.clientX;
      const y = e.clientY;
      const button = e.button;
      const alt = e.altKey;
      // ロック中：長押しで、なぞりを始める（右クリックは消す、Alt は色を取るので、なぞりにしない）
      const timer =
        live.current.locked && button === 0 && !alt
          ? window.setTimeout(() => {
              const p = press.current;
              if (!p || stroke.current) return;
              const at = pointers.current.get(e.pointerId) ?? { x, y };
              beginStroke(at.x, at.y, live.current.tool);
            }, LONG_PRESS_MS)
          : 0;
      press.current = { x, y, moved: false, button, alt, mouse: e.pointerType === 'mouse', timer };
    } else {
      // 2 本目の指：押したことにはせず、ピンチにする
      cancelPress();
      endStroke();
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
      sceneRef.current?.setGhosts(null, 0, 'place', 0);
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      // 押していないマウス：次に何が起きるかの印
      if (e.pointerType === 'mouse') {
        lastHover.current = { x: e.clientX, y: e.clientY };
        showGhost(e.clientX, e.clientY);
      }
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current !== null) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) sceneRef.current?.zoom(pinch.current / d);
      pinch.current = d;
      return;
    }
    if (stroke.current) {
      // 前の点から今の点までを、細かく区切ってなぞる
      const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - prev.x, e.clientY - prev.y) / STROKE_STEP_PX));
      for (let k = 1; k <= steps; k++) strokeAt(prev.x + ((e.clientX - prev.x) * k) / steps, prev.y + ((e.clientY - prev.y) * k) / steps);
      return;
    }
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
    if (!p.moved) {
      p.moved = true;
      clearTimeout(p.timer);
      sceneRef.current?.setGhosts(null, 0, 'place', 0);
      // ロック中のマウスは、押したまま動かせば、すぐなぞりにする（マウスは長押しを待たなくても、押し間違えない）
      if (live.current.locked && p.mouse && p.button === 0 && !p.alt) {
        beginStroke(p.x, p.y, live.current.tool);
        strokeAt(e.clientX, e.clientY);
        return;
      }
    }
    // ロック中は、カメラを回さない
    if (!live.current.locked) sceneRef.current?.orbit(e.clientX - prev.x, e.clientY - prev.y);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const p = press.current;
    cancelPress();
    if (stroke.current) {
      endStroke();
    } else if (p && !p.moved && pointers.current.size === 0) {
      act(e.clientX, e.clientY, p.button === 2 ? 'erase' : p.alt ? 'pick' : live.current.tool);
    }
    if (e.pointerType === 'mouse') {
      lastHover.current = { x: e.clientX, y: e.clientY };
      showGhost(e.clientX, e.clientY);
    }
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    cancelPress();
    endStroke();
  };
  const onPointerLeave = () => {
    lastHover.current = null;
    sceneRef.current?.setGhosts(null, 0, 'place', 0);
  };

  // ホイールで近づく（ページは動かさない）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sceneRef.current?.zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // 道具・大きさ・色・対称を変えたら、印も描き直す
  useEffect(() => {
    if (lastHover.current) showGhost(lastHover.current.x, lastHover.current.y);
  }, [tool, size, color, mirror, showGhost]);

  const undo = useCallback(() => doc.undo() && afterChange(true), [doc, afterChange]);
  const redo = useCallback(() => doc.redo() && afterChange(true), [doc, afterChange]);
  const replaceAll = (blocks: readonly Block[]) => {
    doc.replace(blocks);
    closeTemplates();
    afterChange(true);
  };

  const save = async () => {
    if (saving || doc.blocks.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSave(doc.blocks);
    } catch (e) {
      console.error(e);
      setMessage('保存できませんでした。もう一度お試しください');
      setSaving(false);
    }
  };

  const cancel = () => {
    if (!changed.current || confirmCancel) return onCancel();
    setConfirmCancel(true);
  };
  useEffect(() => {
    if (!confirmCancel) return;
    const id = window.setTimeout(() => setConfirmCancel(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirmCancel]);

  // ---- キーボード ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey) return;
      if (k === '1' || k === '2' || k === '3') setSize((Number(k) - 1) as BlockSize);
      else if (k === 'b') setTool('place');
      else if (k === 'e') setTool('erase');
      else if (k === 'p') setTool('paint');
      else if (k === 'l') setLocked((v) => !v);
      else if (k === 'escape') closeTemplates();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const count = doc.blocks.length;
  void version; // 数・元に戻せるかの表示を、変えるたびに描き直す
  return (
    <div className={`sb${locked ? ' is-locked' : ''}`} role="dialog" aria-label="宇宙船を作る">
      <canvas
        ref={canvasRef}
        className="sb-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      {sceneState === 'failed' && <p className="sb-failed">この端末では、宇宙船を作る画面を 3D で描けませんでした</p>}

      <header className="sb-top">
        <div className="sb-title">
          <h2 className="sb-heading">BUILD</h2>
          <p className={`sb-count${count >= MAX_BLOCKS ? ' is-full' : ''}`}>
            <span className="sb-count-now">{count.toLocaleString()}</span> / {MAX_BLOCKS.toLocaleString()}
          </p>
        </div>
        <div className="sb-actions">
          <button type="button" className="top-button top-button-small top-button-quiet" onClick={cancel} disabled={saving}>
            {confirmCancel ? '作った分を捨てる？' : 'CANCEL'}
          </button>
          <button type="button" className="top-button top-button-small sb-save" onClick={() => void save()} disabled={saving || count === 0 || sceneState !== 'ready'}>
            {saving ? 'SAVING…' : 'SAVE'}
          </button>
        </div>
      </header>

      <div className="sb-tools sb-glass" role="toolbar" aria-label="道具">
        <div className="sb-group" role="radiogroup" aria-label="道具">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tool === t.id}
              className={`sb-chip${tool === t.id ? ' is-on' : ''}`}
              onClick={() => setTool(t.id)}
              title={`${t.label}（${t.key}）`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="sb-group" role="radiogroup" aria-label="大きさ">
          {BLOCK_SIZES.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={size === i}
              className={`sb-chip sb-size${size === i ? ' is-on' : ''}`}
              onClick={() => setSize(i as BlockSize)}
              title={`${b.nameJa}（${i + 1}）。消す・塗るも、この大きさで`}
            >
              <span className="sb-size-box" style={{ width: 6 + i * 4, height: 6 + i * 4 }} aria-hidden />
              {b.label} m
            </button>
          ))}
        </div>
        <div className="sb-group" aria-label="対称・ロック">
          <button type="button" aria-pressed={mirror.x} className={`sb-chip${mirror.x ? ' is-on' : ''}`} onClick={() => setMirror((m) => ({ ...m, x: !m.x }))}>
            左右対称
          </button>
          <button type="button" aria-pressed={mirror.z} className={`sb-chip${mirror.z ? ' is-on' : ''}`} onClick={() => setMirror((m) => ({ ...m, z: !m.z }))}>
            前後対称
          </button>
          <button
            type="button"
            aria-pressed={locked}
            className={`sb-chip${locked ? ' is-on' : ''}`}
            onClick={() => setLocked((v) => !v)}
            title="ロック（L）：カメラを止める。長押ししてなぞると、続けて使える"
          >
            <LockIcon locked={locked} />
            ロック
          </button>
        </div>
        <div className="sb-group sb-group-row">
          <button type="button" className="sb-chip" onClick={undo} disabled={!doc.canUndo} title="元に戻す（Ctrl＋Z）" aria-label="元に戻す">
            ↶
          </button>
          <button type="button" className="sb-chip" onClick={redo} disabled={!doc.canRedo} title="やり直す（Ctrl＋Shift＋Z）" aria-label="やり直す">
            ↷
          </button>
          <button type="button" className="sb-chip" onClick={() => replaceAll([])} disabled={count === 0} title="空にする（元に戻せます）" aria-label="空にする">
            <TrashIcon />
          </button>
          <button type="button" className={`sb-chip${templatesOpen ? ' is-on' : ''}`} aria-expanded={templatesOpen} onClick={(e) => toggleTemplates(e.currentTarget)}>
            ひな形
          </button>
        </div>
      </div>
      {templatesAt && (
        <div className="sb-menu sb-glass" role="menu" style={{ left: templatesAt.left, top: templatesAt.top }}>
          {HULL_TYPES.map((h) => (
            <button key={h} type="button" role="menuitem" className="sb-menu-item" onClick={() => replaceAll(presetBlocks(h))}>
              {HULLS[h].nameJa}
            </button>
          ))}
          {initial && (
            <button type="button" role="menuitem" className="sb-menu-item" onClick={() => replaceAll(initial)}>
              作り直す前の形
            </button>
          )}
        </div>
      )}

      <div className="sb-bottom">
        {(message || locked) && (
          <p className="sb-message" role="status">
            {message ?? 'ロック中：長押ししてなぞると、続けて使えます'}
          </p>
        )}
        <div className="sb-palette sb-glass" role="radiogroup" aria-label="色">
          {PALETTE.map((p, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={color === i}
              aria-label={p.nameJa}
              title={p.nameJa}
              className={`sb-swatch${color === i ? ' is-on' : ''}${p.glow ? ' is-glow' : ''}`}
              style={{ '--sb-swatch': `#${p.hex.toString(16).padStart(6, '0')}` } as CSSProperties}
              onClick={() => {
                setColor(i);
                if (tool === 'erase') setTool('place');
              }}
            />
          ))}
        </div>
        <p className="sb-hint sb-hint-mouse">ドラッグ：回す　ホイール：近づく　クリック：使う　右クリック：消す　Alt＋クリック：色を取る　L：ロック</p>
        <p className="sb-hint sb-hint-touch">ドラッグ：回す　ピンチ：近づく　タップ：使う</p>
      </div>
    </div>
  );
}

/** 鍵（細い線。閉じている・開いている） */
function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg className="sb-icon" viewBox="0 0 16 16" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" />
      <path d={locked ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 4.9-.7'} fill="none" stroke="currentColor" />
    </svg>
  );
}

/** ごみ箱（細い線） */
function TrashIcon() {
  return (
    <svg className="sb-icon" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
