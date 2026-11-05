import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { currentAccount, ensureSession, type Account } from '../net/auth';
import { shipApi } from '../net/ship-repository';
import { AccountPanel } from './AccountPanel';
import { playUrl } from './routes';
import { defaultDesignFor, HULL_TYPES, HULLS, SHIP_DESIGN_VERSION, type HullType } from '../world/ship-design';
import { hueFromId } from '../world/ship-schema';

// 3D の描画（three.js）は大きいので、準備画面を開いてから読み込む
const ShipPreview = lazy(() => import('./ShipPreview'));

/** サーバーにつながらないときの、船の色（見た目のための仮の値） */
const FALLBACK_HUE = 200;

/**
 * 準備画面（要件 F48）。宇宙船を選び、必要ならアカウントを登録して、「出発する」で世界（/play）へ。
 * 開いたとき、登録なしのアカウントを作る（船の色がアカウントで決まるので、本当の色で見せるため。どのみち出発すれば作る）。
 */
export function ReadyScreen({ onBack }: { onBack: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [hull, setHull] = useState<HullType>(HULL_TYPES[0]);
  /** 自分で船を選んだか（選んだあとの登録・ログインの読み直しで、選んだ船を上書きしないため） */
  const picked = useRef(false);
  const [savedHull, setSavedHull] = useState<HullType | null>(null);
  const [offline, setOffline] = useState(false);
  const [departing, setDeparting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** アカウントと、保存してある宇宙船を読む（開いたとき・登録・ログイン・ログアウトのあと） */
  const load = useCallback(async () => {
    try {
      await ensureSession();
      const acc = await currentAccount();
      setAccount(acc);
      const saved = await shipApi.get();
      setSavedHull(saved?.hull ?? null);
      // 保存してある船があれば、それを選ぶ（ログインしたアカウントの船が、匿名のときに選んだ船より優先される。サーバーの引き継ぎと同じ）。
      // なければ、自分で選んだ船を残し、選んでいなければ、世界の画面と同じく、アカウントから決まる船を最初に選んでおく
      if (saved) setHull(saved.hull);
      else if (!picked.current) setHull(acc.kind === 'none' ? HULL_TYPES[0] : defaultDesignFor(acc.userId).hull);
      setOffline(false);
    } catch (e) {
      console.error(e);
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 一度読めたあとに読み直しが失敗しても、アカウントの部品は残す（回復コードを見せている途中で消さないため）
  const noServer = offline && !account;

  const depart = async () => {
    if (departing) return;
    setDeparting(true);
    setError(null);
    try {
      // 選んだ船が保存してあるものと違うときだけ保存する（選び直さなければ、世界の画面の最初の選択も出ない）
      // サーバーにつながらないときは保存せず、そのまま出発できる（世界の画面も、つながらないままで動く）
      if (!noServer && hull !== savedHull) await shipApi.save({ v: SHIP_DESIGN_VERSION, hull });
      location.assign(playUrl(location.search));
    } catch (e) {
      console.error(e);
      setError('宇宙船を保存できませんでした。もう一度お試しください');
      setDeparting(false);
    }
  };

  const hue = account && account.kind !== 'none' ? hueFromId(account.userId) : FALLBACK_HUE;
  return (
    <main className="top-ready-screen">
      <div className="top-card">
        <header className="top-card-head">
          <h1 className="top-heading">出発の準備</h1>
          <button type="button" className="top-button top-button-small top-button-quiet" onClick={onBack}>
            タイトルへ
          </button>
        </header>

        <section className="top-section" aria-labelledby="top-ship-title">
          <h2 id="top-ship-title" className="top-section-title">宇宙船</h2>
          <div className="top-ship-stage">
            <Suspense fallback={null}>
              <ShipPreview hull={hull} hue={hue} />
            </Suspense>
          </div>
          <div className="top-ship-options" role="radiogroup" aria-label="船体">
            {HULL_TYPES.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={hull === h}
                className={`top-ship-option${hull === h ? ' is-selected' : ''}`}
                onClick={() => {
                  picked.current = true;
                  setHull(h);
                }}
              >
                <span className="top-ship-option-name">{HULLS[h].nameJa}</span>
                <span className="top-muted top-small">{HULLS[h].descriptionJa}</span>
              </button>
            ))}
          </div>
          <p className="top-hint">色は、プレイヤーごとに決まります。形は、あとから何度でも変えられます。</p>
        </section>

        {noServer ? (
          <p className="top-error" role="alert">サーバーにつながらないため、アカウントと宇宙船の保存は使えません。</p>
        ) : (
          account && <AccountPanel account={account} onChanged={() => void load()} />
        )}

        <div className="top-depart">
          {error && <p className="top-error" role="alert">{error}</p>}
          <button type="button" className="top-button top-button-primary" onClick={depart} disabled={departing}>
            {departing ? '出発しています…' : '出発する'}
          </button>
        </div>
      </div>
    </main>
  );
}
