import { useCallback, useEffect, useRef, useState } from 'react';
import { beginLoading, hideLoading, rememberUfoLook } from '../loading-screen';
import { currentAccount, ensureSession } from '../net/auth';
import { rememberCustomBlocks, shipApi, type SavedShip } from '../net/ship-repository';
import { customKey, presetShape } from '../world/ship-presets';
import { decodeBlocks, encodeBlocks, type Block } from '../world/ship-blocks';
import { defaultHullFor, HULL_TYPES, isHullType, MAX_CUSTOM_SHIPS, SHIP_DESIGN_VERSION, type ShipChoice } from '../world/ship-design';
import { hueFromId } from '../world/ship-schema';
import type { AccountMode } from './AccountPanel';
import type { AuthMode } from './AuthLinks';
import { AuthBox } from './AuthBox';
import { Backdrop, type Earth3dState, type ScrollState } from './Backdrop';
import { playUrl } from './routes';
import { attachSectionWheel } from './section-scroll';
import { TitleScreen, type TitlePhase } from './TitleScreen';
import { TopStage } from './top-stage';
import { ShipBuilder } from './ShipBuilder';
import { indexOfTarget, slotsFor, targetForIndex, type UfoSlot } from './ufo-carousel';
import { UfoPicker } from './UfoPicker';

/**
 * タイトル画面の中の段階。
 *   title：最初の画面（下へスクロールできる）
 *   select：「-START-」のあと。宇宙船を選ぶ（スクロールできない）
 *   auth：SIGN IN・SIGN UP のあとは月へ、ユーザー名のあとは火星へ、カメラが飛ぶ。着いたらアカウントの箱が開く
 *   return：箱を閉じたあと。カメラが地球へ戻る。着いたら title
 *   build：船を選ぶ段階の「BUILD」のあと。宇宙船を作る画面（ShipBuilder）が画面いっぱいに開く。閉じると select
 */
type Stage = 'title' | 'select' | 'auth' | 'return' | 'build';

/** 「BREAK」をもう一度押すのを待つ長さ（ms） */
const BREAK_CONFIRM_MS = 3000;

/** 列の中の、自分で作った船の番号 i の場所（最初から選べる船の後ろ） */
const customSlotIndex = (i: number): number => HULL_TYPES.length + i;
/** 列の中の、使う船の場所 */
const slotIndexOf = (choice: ShipChoice): number => (isHullType(choice) ? HULL_TYPES.indexOf(choice) : customSlotIndex(choice));

/** 形の名前（同じブロックの文字列は、いつも同じ名前。FNV-1a） */
function textKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `local:${(h >>> 0).toString(16)}:${text.length}`;
}

/** サーバーにつながらないときの、船の色（見た目のための仮の値） */
const FALLBACK_HUE = 200;
/** カメラが行き先に着くのを待つ長さの上限（ms）。3D が読み込めないまま待ち続けないように、箱を開く */
const AUTH_WAIT_MS = 7000;
/** 地球へ戻るのを待つ長さの上限（ms）。画面が見えていないなどで、描画が止まっていても、タイトル画面に戻す */
const RETURN_WAIT_MS = 8000;

/**
 * タイトル画面（要件 F48）。背景（星空・3D の地球・月・船を選ぶ列）は 1 つで、段階が変わっても作り直さない。
 * 段階の移り変わりは、3D の描画と共有する入れ物（TopStage）を通して伝える。
 */
export function TopApp() {
  const [shared] = useState(() => new TopStage());
  // 開発サーバーのときだけ：共有の状態を、開発者ツールから読めるようにする（確かめ用。本番のビルドには入らない）
  if (import.meta.env.DEV) (window as unknown as { __topStage?: TopStage }).__topStage = shared;
  const [stage, setStageState] = useState<Stage>('title');
  const stageRef = useRef<Stage>('title');
  const setStage = useCallback((next: Stage) => {
    stageRef.current = next;
    setStageState(next);
  }, []);

  const [earth3d, setEarth3d] = useState<Earth3dState>('pending');
  const [arrival, setArrival] = useState(shared.arrival);
  useEffect(() => shared.subscribe(() => setArrival(shared.arrival)), [shared]);

  const rootRef = useRef<HTMLDivElement>(null);
  const [authMode, setAuthMode] = useState<AccountMode | undefined>(undefined);
  /** 箱を閉じるたびに増やす（右上の SIGN IN・ユーザー名の表示を読み直すため） */
  const [authVersion, setAuthVersion] = useState(0);
  const [boxForced, setBoxForced] = useState(false);

  // ---- 宇宙船の選択 ----
  const [target, setTargetState] = useState(0);
  const [going, setGoing] = useState(false);
  const goingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** 自分で船を選んだか（選んだあとに、保存してある船が読めても、選んだ船を上書きしないため） */
  const picked = useRef(false);
  /** サーバーに保存してある船（読めるまでは null） */
  const saved = useRef<SavedShip | null>(null);
  /** 作る画面を開いたときの、作り直す船の番号（新しく作るときは null）と、その形 */
  const [buildFrom, setBuildFrom] = useState<{ index: number | null; initial: readonly Block[] | null } | null>(null);
  /** 自分で作った船（ブロックの文字列。customs の順） */
  const [customs, setCustoms] = useState<string[]>([]);
  const customsRef = useRef<string[]>([]);
  const items = slotsFor(customs.length);
  const itemsRef = useRef<UfoSlot[]>(items);
  itemsRef.current = items;
  /** 「BREAK」を 1 回押して、もう一度押すのを待っているか */
  const [breakArmed, setBreakArmed] = useState(false);
  const offline = useRef(false);
  const loading = useRef<Promise<void> | null>(null);

  const chooseTarget = useCallback(
    (next: number) => {
      picked.current = true;
      shared.target = next;
      setTargetState(next);
      setBreakArmed(false);
    },
    [shared],
  );

  /** 自分で作った船の一覧を入れ替える（列の 3D も作り直す） */
  const applyCustoms = useCallback(
    (next: string[], ref: string | null, used: number | null) => {
      customsRef.current = next;
      setCustoms(next);
      shared.customShapes = next.map((text, i) => {
        const blocks = decodeBlocks(text) ?? [];
        // 使っている船は、サーバーの印を名前にして覚えておく（世界の画面で、他の人と同じ形の名前になる）
        if (i === used && ref) {
          rememberCustomBlocks(ref, blocks);
          return { key: customKey(ref), blocks };
        }
        return { key: textKey(text), blocks };
      });
      shared.customVersion++;
    },
    [shared],
  );

  /** アカウントと、保存してある宇宙船を読む（「-START-」を押したとき。登録なしのアカウントは、ここで作る） */
  const loadShip = useCallback(() => {
    const work = (async () => {
      try {
        await ensureSession();
        const acc = await currentAccount();
        const ship = await shipApi.get();
        saved.current = ship;
        shared.hue = acc.kind === 'none' ? FALLBACK_HUE : hueFromId(acc.userId);
        // 自分で作った船を、列のマイ UFO に入れる
        const next = ship.design?.customs ?? [];
        const use = ship.design?.use;
        applyCustoms(next, ship.ref, typeof use === 'number' ? use : null);
        // 保存してある船があれば、それを選ぶ。なければ、アカウントから決まる船（世界の画面の最初の選択と同じ）
        if (!picked.current) {
          const choice = use ?? (acc.kind === 'none' ? 'saucer' : defaultHullFor(acc.userId));
          const next = targetForIndex(slotIndexOf(choice), shared.target, slotsFor(customsRef.current.length).length);
          shared.target = next;
          setTargetState(next);
        }
        offline.current = false;
      } catch (e) {
        console.error(e);
        offline.current = true;
      }
    })();
    loading.current = work;
    return work;
  }, [shared, applyCustoms]);

  /** 作る画面を閉じたあと（戻るボタン・CANCEL・SAVE） */
  const leaveBuild = useCallback(() => {
    if (stageRef.current !== 'build') return;
    shared.building = false;
    setBuildFrom(null);
    setStage('select');
  }, [shared, setStage]);

  // ---- 段階の移り変わり ----
  const start = useCallback(() => {
    if (stageRef.current !== 'title') return;
    rootRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    picked.current = false;
    setError(null);
    setStage('select');
    history.pushState({ stage: 'select' }, '');
    void loadShip();
  }, [loadShip, setStage]);

  const back = useCallback(() => {
    if (stageRef.current !== 'select' || goingRef.current) return;
    // 戻るボタンと同じ動きにして、履歴を余らせない
    if ((history.state as { stage?: string } | null)?.stage === 'select') history.back();
    else setStage('title');
  }, [setStage]);

  useEffect(() => {
    // 再読み込みで、履歴に残った「選ぶ画面」の印は消す（再読み込みは、いつも最初の画面から）
    history.replaceState(null, '');
    const onPop = () => {
      const inSelect = (history.state as { stage?: string } | null)?.stage === 'select';
      if (inSelect && stageRef.current === 'title') {
        setStage('select');
        picked.current = false;
        void loadShip();
      } else if (!inSelect && stageRef.current === 'select') {
        setStage('title');
      }
      // 作る画面で「戻る」：作る画面を閉じて、船を選ぶ段階へ
      if (stageRef.current === 'build' && (history.state as { stage?: string } | null)?.stage !== 'build') leaveBuild();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [loadShip, setStage, leaveBuild]);

  // 船を選ぶ段階の間だけ、UFO を出す。それ以外（タイトルへ戻る・月へ飛ぶ）では、左へ消える
  useEffect(() => {
    shared.ufoShown = stage === 'select';
  }, [shared, stage]);

  const openAuth = useCallback(
    (mode?: AuthMode) => {
      const now = stageRef.current;
      if (now === 'auth' || now === 'return' || goingRef.current) return;
      rootRef.current?.scrollTo({ top: 0, behavior: 'instant' });
      setAuthMode(mode);
      setBoxForced(false);
      setStage('auth');
      // SIGN IN・SIGN UP は月へ。ログイン中のユーザー名（mode が無い）は火星へ
      shared.view = mode ? 'moon' : 'mars';
    },
    [shared, setStage],
  );

  const closeAuth = useCallback(() => {
    if (stageRef.current !== 'auth') return;
    setAuthVersion((v) => v + 1);
    setStage('return');
    shared.view = 'earth';
  }, [shared, setStage]);

  // 飛んでいる間に 3D が読めないなどで着かないときも、箱は開く
  useEffect(() => {
    if (stage !== 'auth') return;
    const id = window.setTimeout(() => setBoxForced(true), AUTH_WAIT_MS);
    return () => clearTimeout(id);
  }, [stage]);
  const boxOpen = stage === 'auth' && (arrival === 'there' || earth3d === 'none' || boxForced);

  // 地球に着いたら、タイトル画面に戻る（3D を使っていなければ、すぐ）
  useEffect(() => {
    if (stage !== 'return') return;
    if (earth3d !== 'ready' || arrival === 'earth') {
      setStage('title');
      return;
    }
    const id = window.setTimeout(() => setStage('title'), RETURN_WAIT_MS);
    return () => clearTimeout(id);
  }, [stage, arrival, earth3d, setStage]);

  // キーボード（Space・PageDown など）でスクロールできるよう、スクロールする箱に焦点を置く（Tab の順には入れない）。
  // 箱が開いているときは、箱の中の入力に焦点があるので、奪わない
  useEffect(() => {
    if (stage === 'title' || stage === 'select') rootRef.current?.focus({ preventScroll: true });
  }, [stage]);

  // タイトル画面のホイールは、最初の画面も詳細の中も、1 つの動きで動かす（section-scroll.ts）。船を選ぶ間は、スクロールしない
  useEffect(() => {
    const root = rootRef.current;
    if (!root || stage !== 'title') return;
    return attachSectionWheel(root, () => root.querySelector<HTMLElement>('.top-hero')?.offsetHeight || root.clientHeight || 1);
  }, [stage]);

  /**
   * タイトル画面のスクロールの位置（背景の地球を動かすため）。progress：最初の画面の高さを 1 とした位置（0〜1。1 で詳細の画面）、
   * pastPx：1 を超えた分（px。地球を画面の外へ送る）。船を選ぶ間・月へ行く間は、スクロールできないので、いつも 0。
   * マイページ（火星の箱）では、箱のスクロールの位置（最初の画面の高さを 1。1 で下のコレクションの画面）。火星が、タイトル画面の地球と同じように動く（2026-11-13）
   */
  const stageForScroll = useRef(stage);
  stageForScroll.current = stage;
  const getScroll = useCallback((): ScrollState => {
    const root = rootRef.current;
    if (stageForScroll.current === 'auth') {
      const box = root?.querySelector<HTMLElement>('.top-auth-box.is-mypage');
      if (!box) return { progress: 0, pastPx: 0 };
      const first = box.querySelector<HTMLElement>('.top-auth-first')?.offsetHeight || box.clientHeight || 1;
      return { progress: Math.min(1, box.scrollTop / first), pastPx: Math.max(0, box.scrollTop - first) };
    }
    if (!root || stageForScroll.current !== 'title') return { progress: 0, pastPx: 0 };
    const heroHeight = root.querySelector<HTMLElement>('.top-hero')?.offsetHeight || root.clientHeight || 1;
    return { progress: Math.min(1, root.scrollTop / heroHeight), pastPx: Math.max(0, root.scrollTop - heroHeight) };
  }, []);

  // ---- 宇宙船を作る画面 ----
  /** 作る画面を開く。index：作り直す自分の船の番号（null なら新しく作る） */
  const openBuilder = useCallback(
    (index: number | null) => {
    if (stageRef.current !== 'select' || goingRef.current) return;
    if (index === null && customsRef.current.length >= MAX_CUSTOM_SHIPS) {
      setError(`マイ UFO は ${MAX_CUSTOM_SHIPS} つまでです。BREAK で消してから作れます`);
      return;
    }
    setBuildFrom({ index, initial: index === null ? null : (shared.customShapes[index]?.blocks ?? null) });
    setError(null);
    setStage('build');
    shared.building = true;
    history.pushState({ stage: 'build' }, '');
    },
    [shared, setStage],
  );

  const closeBuilder = useCallback(() => {
    if ((history.state as { stage?: string } | null)?.stage === 'build') history.back();
    else leaveBuild();
  }, [leaveBuild]);

  /** 作った船を保存して、その船を選んだ状態で閉じる（新しく作った船は、一覧の後ろに足す）。失敗したら例外（作る画面が理由を出す） */
  const saveBuild = useCallback(
    async (blocks: readonly Block[]) => {
      await loading.current;
      if (offline.current) throw new Error('サーバーにつながらない');
      const next = [...customsRef.current];
      const i = buildFrom?.index ?? next.length;
      next[i] = encodeBlocks(blocks);
      const ship = await shipApi.save({ v: SHIP_DESIGN_VERSION, use: i, customs: next });
      saved.current = ship;
      applyCustoms(ship.design?.customs ?? next, ship.ref, i);
      chooseTarget(targetForIndex(customSlotIndex(i), shared.target, slotsFor(next.length).length));
      closeBuilder();
    },
    [shared, buildFrom, applyCustoms, chooseTarget, closeBuilder],
  );

  /** 真ん中の自分の船を消す（最初から選べる船は消せない）。1 回目は確かめ、3 秒以内にもう一度押すと消す */
  const breakSelected = useCallback(async () => {
    if (stageRef.current !== 'select' || goingRef.current || shared.ufoBusy) return;
    const slot = itemsRef.current[indexOfTarget(shared.target, itemsRef.current.length)];
    if (slot?.kind !== 'custom') return;
    if (!breakArmed) {
      setBreakArmed(true);
      return;
    }
    setBreakArmed(false);
    try {
      await loading.current;
      if (offline.current) throw new Error('サーバーにつながらない');
      const i = slot.index;
      const next = customsRef.current.filter((_, k) => k !== i);
      // 使っている船を消したらソーサーに、後ろの船を使っていたら番号を 1 つ詰める
      const use = saved.current?.design?.use ?? 'saucer';
      const nextUse: ShipChoice = typeof use === 'number' ? (use === i ? 'saucer' : use > i ? use - 1 : use) : use;
      const ship = await shipApi.save({ v: SHIP_DESIGN_VERSION, use: nextUse, ...(next.length > 0 ? { customs: next } : {}) });
      saved.current = ship;
      applyCustoms(next, ship.ref, typeof nextUse === 'number' ? nextUse : null);
      // 消した船の 1 つ前（1 つ目なら、最初から選べる船の最後）を選ぶ
      const count = slotsFor(next.length).length;
      const prev = customSlotIndex(i) - 1;
      const t = targetForIndex(prev, shared.target, count);
      shared.dragPos = null;
      chooseTarget(t);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('マイ UFO を消せませんでした。もう一度お試しください');
    }
  }, [shared, breakArmed, applyCustoms, chooseTarget]);

  useEffect(() => {
    if (!breakArmed) return;
    const id = window.setTimeout(() => setBreakArmed(false), BREAK_CONFIRM_MS);
    return () => clearTimeout(id);
  }, [breakArmed]);

  // ---- 出発 ----
  const depart = useCallback(async () => {
    if (goingRef.current || stageRef.current !== 'select') return;
    const slot = itemsRef.current[indexOfTarget(shared.target, itemsRef.current.length)];
    // 「＋」で出発しようとしたら、新しく作る画面を開く
    if (!slot || slot.kind === 'new') return openBuilder(null);
    const choice: ShipChoice = slot.kind === 'preset' ? slot.hull : slot.index;
    goingRef.current = true;
    setGoing(true);
    setError(null);
    // ローディング画面を飛ぶ UFO は、選んだ船そのもの：いまの見た目で絵にして覚えておく（長くても 0.3 秒だけ待つ）
    const shape = slot.kind === 'custom' ? shared.customShapes[slot.index] : presetShape(slot.hull);
    const url = shared.snapshotUfo
      ? await Promise.race([shared.snapshotUfo(shape), new Promise<null>((r) => setTimeout(() => r(null), 300))])
      : null;
    if (url) rememberUfoLook(shape.key, shared.hue, url);
    // ローディング画面（ページが /play に変わっても、UFO は続きから。世界が動き出して、UFO が右の外へ消えたら切り替わる）
    beginLoading();
    try {
      await loading.current;
      // 選んだ船が保存してあるものと違うときだけ保存する（作った船のブロックは、ほかの船を選んでも残す）。
      // サーバーにつながらないときは保存せず、そのまま出発できる（世界の画面も、つながらないままで動く）
      const current = saved.current?.design ?? null;
      if (!offline.current && choice !== current?.use) {
        const list = customsRef.current;
        await shipApi.save({ v: SHIP_DESIGN_VERSION, use: choice, ...(list.length > 0 ? { customs: list } : {}) });
      }
      location.assign(playUrl(location.search));
    } catch (e) {
      console.error(e);
      hideLoading();
      setError('宇宙船を保存できませんでした。もう一度お試しください');
      goingRef.current = false;
      setGoing(false);
    }
  }, [shared, openBuilder]);

  const step = useCallback(
    (delta: number) => {
      if (stageRef.current !== 'select' || shared.ufoBusy) return;
      chooseTarget(shared.target + delta);
    },
    [shared, chooseTarget],
  );

  /** 船を押した：「＋」なら新しく作る、真ん中のマイ UFO なら作り直す、ほかは隣へ送る */
  const activate = useCallback(
    (offset: -1 | 0 | 1) => {
      const list = itemsRef.current;
      const slot = list[indexOfTarget(shared.target + offset, list.length)];
      if (slot?.kind === 'new') return openBuilder(null);
      if (offset === 0) {
        if (slot?.kind === 'custom') openBuilder(slot.index);
        return;
      }
      step(offset);
    },
    [shared, openBuilder, step],
  );

  const phase: TitlePhase = stage === 'title' ? 'title' : stage === 'select' ? 'select' : 'away';
  const centered = items[indexOfTarget(target, items.length)];
  const canBreak = stage === 'select' && !going && centered?.kind === 'custom';
  const picker = (
    <>
      <UfoPicker stage={shared} active={stage === 'select'} target={target} items={items} onTarget={chooseTarget} onActivate={activate} showNames={earth3d === 'none'} />
      <div className={`top-build${stage === 'select' ? ' is-open' : ''}`}>
        <button
          type="button"
          className={`top-button top-button-small top-break-button${breakArmed ? ' is-armed' : ''}`}
          onClick={() => void breakSelected()}
          disabled={!canBreak}
          tabIndex={stage === 'select' ? 0 : -1}
          title={centered?.kind === 'custom' ? 'このマイ UFO を消す' : '最初からある UFO は消せません'}
        >
          {breakArmed ? 'BREAK?' : 'BREAK'}
        </button>
        {breakArmed && <p className="top-break-hint">もう一度押すと、このマイ UFO を消します</p>}
      </div>
    </>
  );
  return (
    <div ref={rootRef} tabIndex={-1} className={`top${stage === 'title' ? ' is-title' : ' is-locked'}`}>
      <Backdrop getScroll={getScroll} stage={shared} onEarth3d={setEarth3d} />
      <TitleScreen
        phase={phase}
        going={going}
        error={error}
        authVersion={authVersion}
        onStart={start}
        onBack={back}
        onGo={() => void depart()}
        onStep={step}
        onAuth={openAuth}
        onSignedIn={(signedIn) => {
          shared.preloadMars = signedIn;
        }}
        picker={picker}
      />
      {stage === 'build' && buildFrom && <ShipBuilder initial={buildFrom.initial} onSave={saveBuild} onCancel={closeBuilder} />}
      {(stage === 'auth' || stage === 'return') && <AuthBox open={boxOpen} initialMode={authMode} onDone={closeAuth} onClose={closeAuth} />}
    </div>
  );
}
