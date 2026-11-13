import { useCallback, useEffect, useRef, useState } from 'react';
import { currentAccount, ensureSession } from '../net/auth';
import { shipApi } from '../net/ship-repository';
import { defaultDesignFor, HULL_TYPES, SHIP_DESIGN_VERSION, type HullType } from '../world/ship-design';
import { hueFromId } from '../world/ship-schema';
import type { AccountMode } from './AccountPanel';
import type { AuthMode } from './AuthLinks';
import { AuthBox } from './AuthBox';
import { Backdrop, type Earth3dState, type ScrollState } from './Backdrop';
import { playUrl } from './routes';
import { attachSectionWheel } from './section-scroll';
import { TitleScreen, type TitlePhase } from './TitleScreen';
import { TopStage } from './top-stage';
import { hullOfTarget, targetForIndex } from './ufo-carousel';
import { UfoPicker } from './UfoPicker';

/**
 * タイトル画面の中の段階。
 *   title：最初の画面（下へスクロールできる）
 *   select：「-START-」のあと。宇宙船を選ぶ（スクロールできない）
 *   auth：SIGN IN・SIGN UP のあとは月へ、ユーザー名のあとは火星へ、カメラが飛ぶ。着いたらアカウントの箱が開く
 *   return：箱を閉じたあと。カメラが地球へ戻る。着いたら title
 */
type Stage = 'title' | 'select' | 'auth' | 'return';

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
  const savedHull = useRef<HullType | null>(null);
  const offline = useRef(false);
  const loading = useRef<Promise<void> | null>(null);

  const chooseTarget = useCallback(
    (next: number) => {
      picked.current = true;
      shared.target = next;
      setTargetState(next);
    },
    [shared],
  );

  /** アカウントと、保存してある宇宙船を読む（「-START-」を押したとき。登録なしのアカウントは、ここで作る） */
  const loadShip = useCallback(() => {
    const work = (async () => {
      try {
        await ensureSession();
        const acc = await currentAccount();
        const saved = await shipApi.get();
        savedHull.current = saved?.hull ?? null;
        shared.hue = acc.kind === 'none' ? FALLBACK_HUE : hueFromId(acc.userId);
        // 保存してある船があれば、それを選ぶ。なければ、アカウントから決まる船（世界の画面の最初の選択と同じ）
        if (!picked.current) {
          const hull = saved?.hull ?? (acc.kind === 'none' ? HULL_TYPES[0] : defaultDesignFor(acc.userId).hull);
          const next = targetForIndex(HULL_TYPES.indexOf(hull), shared.target);
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
  }, [shared]);

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
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [loadShip, setStage]);

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

  // ---- 出発 ----
  const depart = useCallback(async () => {
    if (goingRef.current || stageRef.current !== 'select') return;
    goingRef.current = true;
    setGoing(true);
    setError(null);
    try {
      await loading.current;
      const hull = hullOfTarget(shared.target);
      // 選んだ船が保存してあるものと違うときだけ保存する（選び直さなければ、世界の画面の最初の選択も出ない）。
      // サーバーにつながらないときは保存せず、そのまま出発できる（世界の画面も、つながらないままで動く）
      if (!offline.current && hull !== savedHull.current) await shipApi.save({ v: SHIP_DESIGN_VERSION, hull });
      location.assign(playUrl(location.search));
    } catch (e) {
      console.error(e);
      setError('宇宙船を保存できませんでした。もう一度お試しください');
      goingRef.current = false;
      setGoing(false);
    }
  }, [shared]);

  const step = useCallback(
    (delta: number) => {
      if (stageRef.current !== 'select' || shared.ufoBusy) return;
      chooseTarget(shared.target + delta);
    },
    [shared, chooseTarget],
  );

  const phase: TitlePhase = stage === 'title' ? 'title' : stage === 'select' ? 'select' : 'away';
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
        picker={<UfoPicker stage={shared} active={stage === 'select'} target={target} onTarget={chooseTarget} showNames={earth3d === 'none'} />}
      />
      {(stage === 'auth' || stage === 'return') && <AuthBox open={boxOpen} initialMode={authMode} onDone={closeAuth} onClose={closeAuth} />}
    </div>
  );
}
