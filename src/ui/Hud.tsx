import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MapIcon } from './icons';
import '@fontsource/monoton/400.css';
import '@fontsource/josefin-sans/300.css';
import '@fontsource/dotgothic16/400.css';
import { formatCoordinates, formatDistanceEn, formatSpeed } from './format';
import { STAR_LIMIT_NAMES_JA } from '../world/stars';
import { hudActions, hudStore, type ScanHud } from './hud-store';
import { Radar } from './Radar';
import { RadarPanel } from './RadarPanel';
import { PhotoView } from './PhotoView';
import { MAX_WARPS_PER_PLAYER } from '../world/warp-schema';
import { filterChatLog } from '../world/chat';
import { ChatBox } from './ChatBox';
import { InfoCard, WarpCard } from './InfoCard';
import { CollectionPanel } from './CollectionPanel';
import { StarMap } from './StarMap';
import { AimLabel } from './AimLabel';
import { PauseMenu } from './PauseMenu';
import { TouchPad } from './TouchPad';
import './hud.css';

export function Hud() {
  const s = useSyncExternalStore(hudStore.subscribe, hudStore.get);
  const utc = s.date.toISOString().replace('T', ' ').slice(0, 19);
  const o = s.overlay;
  // レーダー・マップ・コレクション・写真は、まわり（この下の見えない面）を押すと閉じる（× は置かない。2026-11-12）
  const backdrop = o === 'radar' || o === 'map' || o === 'collection' || o === 'photo';
  // 画面を大きく使うもの（マップ・コレクション）の間は、情報のカードを出さない（重なるため）
  const wide = o === 'map' || o === 'collection';
  const myWarps = s.warps.filter((w) => w.mine).length;
  const selectedWarp = o === 'radar' && s.selectedWarp ? (s.warps.find((w) => w.id === s.selectedWarp) ?? null) : null;
  const visibleChatLog = filterChatLog(s.chatLog, s.chatFocus);
  // 写真の構え（5・F2）：画面の表示をすべて消して、シャッターの線だけを出す（2026-11-13）
  if (s.photoMode) {
    return (
      <>
        <PhotoFinder />
        {s.shutter > 0 && <div key={s.shutter} className="hud-shutter" aria-hidden="true" />}
      </>
    );
  }
  return (
    <>
      {/* ゲームメニュー：画面全体をすりガラスにし、メニューのボタンのほかは押せない */}
      {o === 'menu' && <PauseMenu />}
      {backdrop && <div className="hud-backdrop" aria-hidden="true" onClick={() => hudActions.setOverlay(null)} />}
      <div className={`hud-left${wide ? ' is-over' : ''}`}>
        {/* タイトルを押すと、ゲームメニュー（2026-11-21。スマホには Esc が無いので、ここから開く。PC でも同じ） */}
        <header className="hud-brand">
          <button type="button" className="hud-brand-button" aria-label="メニューを開く" onClick={() => hudActions.setOverlay('menu')}>
            STAR VESSEL
          </button>
        </header>
        {/* 左上の表示は英語（2026-11-12 にオーナーの指示） */}
        {/* 左上の表示は、最初は隠して「＊」だけ。「＊」・X キーで出し、表示を押す・X キーで隠す（2026-11-21。PC・スマホとも） */}
        {!s.statusVisible && !wide && (
          <button type="button" className="hud-status-toggle" aria-label="左上の情報を出す（X）" title="左上の情報を出す（X）" onClick={() => hudActions.toggleStatus()}>
            ＊
          </button>
        )}
        {s.statusVisible && !wide && (
          <div className="hud-status" lang="en" title="押すと隠す（X）" onClick={() => hudActions.toggleStatus()}>
            <div>UTC {utc}</div>
            <div>
              {formatDistanceEn(s.altitudeKm)} above {s.anchorName}
            </div>
            <div>Speed {formatSpeed(s.speedKmS)}</div>
            <Coordinates v={s.fromEarthKm} />
            {s.region && <div>{s.region}</div>}
            {s.deepRegion && <div>{s.deepRegion}</div>}
            {s.nearbyShips !== null && <div>Players nearby: {s.nearbyShips}</div>}
            <div className="hud-muted">Renderer: {s.backend}</div>
            {s.status && <div className="hud-warn">{s.status}</div>}
          </div>
        )}
        {/* 情報のカード：PC は画面の上の真ん中（position: fixed）、スマホはこの列の中（右上のレーダーに重ならないように） */}
        {/* レーダーで選んだワープホールは、TARGET と同じ場所に、同じ形のカードで出す（どちらか一方） */}
        {wide ? null : selectedWarp ? <WarpCard warp={selectedWarp} docked /> : s.infoCard && <InfoCard card={s.infoCard} docked={o === 'radar'} />}
      </div>
      {s.notice && <div className="hud-panel hud-notice">{s.notice}</div>}
      {/* レーダー：押すと（R キーでも）画面の真ん中に大きく出す。範囲・出すものは、大きくしたレーダーで変えたものをそのまま使う */}
      {o !== 'radar' && (
        <div className="hud-dock">
          <ScanStatus scan={s.scan} />
          <button
            type="button"
            className="hud-radar-button"
            aria-label="レーダーを大きくする（R）"
            title="レーダーを大きくする（R）"
            onClick={(e) => {
              hudActions.setOverlay('radar');
              e.currentTarget.blur();
            }}
          >
            <Radar blips={s.radar} rangeKm={s.radarRangeKm} layers={s.radarLayers} />
          </button>
        </div>
      )}
      {o === 'radar' && <RadarPanel blips={s.radar} rangeKm={s.radarRangeKm} layers={s.radarLayers} selectedKey={s.selectedKey} selectedWarp={s.selectedWarp} withCard={selectedWarp !== null || s.infoCard !== null} />}
      <ChatBox ready={s.chatReady} log={s.chatLog} focus={s.chatFocus} open={o === 'chat'} underPanel={o === 'radar' || o === 'photo' || wide} collapsed={!s.chatOpen} />
      {o === 'map' && <StarMap points={s.mapPoints} selfKm={s.mapSelfKm} focusKey={s.mapFocus} />}
      {o === 'collection' && <CollectionPanel visits={s.visits} />}
      {o === 'photo' && s.photo && <PhotoView photo={s.photo} />}
      {/* シャッターの光（写真を撮るたびに作り直して、もう一度光らせる） */}
      {s.shutter > 0 && <div key={s.shutter} className="hud-shutter" aria-hidden="true" />}
      {/* PC で、入ったばかり・カーソルを消せなかったとき（ゲームメニューは出さず、クリックを待つ） */}
      {s.pointerLock && !s.locked && o === null && <div className="hud-lock-hint">クリックで操縦をはじめる</div>}
      <div className={`hud-hotbar${s.itemsOpen ? ' is-open' : ''}`} role="toolbar" aria-label="メニュー">
        <button
          type="button"
          className={`hud-button hud-icon-button${o === 'collection' ? ' is-selected' : ''}`}
          aria-label={`コレクション（${s.visits.length}）`}
          title={`コレクション（${s.visits.length}）・1`}
          aria-pressed={o === 'collection'}
          onClick={(e) => {
            hudActions.toggleOverlay('collection');
            e.currentTarget.blur();
          }}
        >
          <HotkeyNumber n={1} />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" />
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H19" />
            <path d="m12 7 1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 13l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4L12 7Z" />
          </svg>
        </button>
        <button
          type="button"
          className="hud-button hud-icon-button"
          aria-label={`星の見え方：${STAR_LIMIT_NAMES_JA[s.starLimit]}`}
          title={`星の見え方：${STAR_LIMIT_NAMES_JA[s.starLimit]}・2`}
          onClick={(e) => {
            hudActions.cycleStarLimit();
            e.currentTarget.blur();
          }}
        >
          <HotkeyNumber n={2} />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3Z" />
            <path d="M19 3v3M20.5 4.5h-3M5 17v2M6 18H4" />
          </svg>
        </button>
        <button
          type="button"
          className={`hud-button hud-icon-button${s.constellations ? ' is-selected' : ''}`}
          aria-label={`星座：${s.constellations ? '表示中' : '非表示'}`}
          title={`星座：${s.constellations ? '表示中' : '非表示'}・3`}
          aria-pressed={s.constellations}
          onClick={(e) => {
            hudActions.toggleConstellations();
            e.currentTarget.blur();
          }}
        >
          <HotkeyNumber n={3} />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="5" cy="6" r="1.8" fill="currentColor" />
            <circle cx="12" cy="9" r="1.8" fill="currentColor" />
            <circle cx="19" cy="5" r="1.8" fill="currentColor" />
            <circle cx="15" cy="18" r="1.8" fill="currentColor" />
            <path d="M6.6 6.7 10.4 8.3M13.6 8.1 17.4 5.9M12.6 10.7 14.4 16.3" />
          </svg>
        </button>
        {/* ワープホールのボタン：ふだんは作る。自分のワープホールのそばでは、消すボタンになる（2026-11-12） */}
        <button
          type="button"
          className={`hud-button hud-icon-button${s.warpHere ? ' is-remove' : ''}`}
          aria-label={s.warpHere ? `ここのワープホール ${s.warpHere.code} を消す` : `ここにワープホールを作る（${myWarps}/${MAX_WARPS_PER_PLAYER}）`}
          title={
            s.warpHere
              ? `ここのワープホール ${s.warpHere.code} を消す・4`
              : `ここにワープホールを作る（${myWarps}/${MAX_WARPS_PER_PLAYER}）・4。ワープはレーダーから`
          }
          disabled={!s.warpsReady}
          onClick={(e) => {
            hudActions.pressWarpButton();
            e.currentTarget.blur();
          }}
        >
          <HotkeyNumber n={4} />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <ellipse cx="11" cy="13" rx="8" ry="4" transform="rotate(-25 11 13)" />
            <ellipse cx="11" cy="13" rx="4.2" ry="2" transform="rotate(-25 11 13)" />
            <path d={s.warpHere ? 'M16.5 5h5' : 'M19 2.5v5M16.5 5h5'} />
          </svg>
        </button>
        <button
          type="button"
          className="hud-button hud-icon-button"
          aria-label="写真を撮る構えに入る"
          title="写真・5（F2 でも）。Enter で撮る"
          onClick={(e) => {
            hudActions.togglePhotoMode();
            e.currentTarget.blur();
          }}
        >
          <HotkeyNumber n={5} />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4V8Z" />
            <circle cx="12" cy="13.2" r="3.4" />
          </svg>
        </button>
        <button
          type="button"
          className={`hud-button hud-icon-button${o === 'map' ? ' is-selected' : ''}`}
          aria-label="マップ"
          title="マップ（訪れた場所）・6（M でも）"
          aria-pressed={o === 'map'}
          onClick={(e) => {
            hudActions.toggleOverlay('map');
            e.currentTarget.blur();
          }}
        >
          <HotkeyNumber n={6} />
          <MapIcon />
        </button>
        {/* スマホ：チャットは開閉式。このボタンで開く・閉じる（PC はいつも左下に出している） */}
        <ChatToggle open={s.chatOpen} log={visibleChatLog} />
        {/* スマホ：アイコンは「＋」にまとめる。いちばん下の「＋」で開き、「−」で閉じる（2026-11-21） */}
        <ItemsToggle open={s.itemsOpen} chatOpen={s.chatOpen} log={visibleChatLog} />
      </div>

      {/* スマホの操縦：下の真ん中のバーチャルパッドと、右の速さのバー。画面を開いている間は隠す */}
      <TouchPad hidden={o !== null} speedKmS={s.speedKmS} />
      {o !== 'menu' && <AimLabel aim={s.aimLabel} constellation={s.aimConstellation} />}
    </>
  );
}

/** 閉じている間に、新しい発言が届いたか（チャットのボタンと「＋」の点に使う） */
function useUnread(open: boolean, log: readonly { key: number }[]): boolean {
  const latest = log[0]?.key ?? 0;
  const seen = useRef(latest);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (open) {
      seen.current = latest;
      setTick((t) => t + 1);
    }
  }, [open, latest]);
  return !open && latest > seen.current;
}

/** スマホ：アイコンをまとめた「＋」。押すと開いて「−」になる。閉じている間にチャットが届いたら点を付ける */
function ItemsToggle({ open, chatOpen, log }: { open: boolean; chatOpen: boolean; log: readonly { key: number }[] }) {
  const unread = useUnread(chatOpen || open, log);
  return (
    <button
      type="button"
      className="hud-button hud-icon-button hud-items-toggle"
      aria-label={open ? 'アイコンをしまう' : 'アイコンを出す'}
      aria-expanded={open}
      onClick={(e) => {
        hudActions.toggleItems();
        e.currentTarget.blur();
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d={open ? 'M5 12h14' : 'M12 5v14M5 12h14'} />
      </svg>
      {unread && <span className="hud-chat-unread" aria-hidden="true" />}
    </button>
  );
}

/**
 * スマホのチャットの開閉のボタン（左の列のいちばん下）。閉じている間に新しい発言が届いたら、点を付ける
 */
function ChatToggle({ open, log }: { open: boolean; log: readonly { key: number }[] }) {
  const unread = useUnread(open, log);
  return (
    <button
      type="button"
      className={`hud-button hud-icon-button hud-touch-only hud-chat-toggle${open ? ' is-selected' : ''}`}
      aria-label={open ? 'チャットを閉じる' : unread ? 'チャットを開く（新しい発言があります）' : 'チャットを開く'}
      aria-pressed={open}
      onClick={(e) => {
        hudActions.toggleChat();
        e.currentTarget.blur();
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H9l-4 3.5V16H4V5Z" />
        <path d="M8 9.5h8M8 12.5h5" />
      </svg>
      {unread && <span className="hud-chat-unread" aria-hidden="true" />}
    </button>
  );
}

/**
 * 写真の構えの間の表示：真ん中の「＋」と、四すみのかぎ（シャッターの線）。写真には写らない（写るのは宇宙の canvas だけ）。
 * PC は Enter で撮り、5・F2・Esc でやめる。スマホはキーが無いので、下の真ん中にシャッター、右下のかぎの内側に × を出す
 */
function PhotoFinder() {
  return (
    <div className="hud-finder">
      <div className="hud-finder-frame" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="hud-finder-plus" aria-hidden="true" />
      <p className="hud-finder-hint hud-keyboard-only" role="status">
        Enter で撮る ・ 5 でやめる
      </p>
      {/* スマホ：シャッターは下の真ん中、やめるのは右下のかぎ（」）の内側の × （2026-11-21） */}
      <button type="button" className="hud-finder-shutter hud-touch-only" aria-label="シャッター" onClick={() => hudActions.takePhoto()} />
      <button type="button" className="hud-finder-close hud-touch-only" aria-label="写真の構えをやめる" onClick={() => hudActions.togglePhotoMode()}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * レーダーの上の「SCAN: OK」（2026-11-22 にオーナーの指示）。字は左上の表示と同じ緑のピクセル調（DotGothic16）。
 * OK はいつも見えているが、スキャンできる天体が範囲にあるときだけ光る。スキャンの間は SCANNING と進み具合、
 * 終わると SUCCESS（もうコレクションにある天体なら ALREADY）、視点を変えるなどで失敗すると赤で FAILURE。どちらもしばらくして OK に戻る
 */
function ScanStatus({ scan }: { scan: ScanHud }) {
  const value =
    scan.phase === 'scanning' ? `SCANNING ${scan.percent}%` : scan.phase === 'success' ? 'SUCCESS' : scan.phase === 'already' ? 'ALREADY' : scan.phase === 'failure' ? 'FAILURE' : 'OK';
  const lit = scan.phase !== 'idle' || scan.available;
  return (
    <div className="hud-scan" lang="en" role="status" aria-live="polite" aria-label={`スキャン：${value}`}>
      SCAN: <span className={`hud-scan-value is-${scan.phase}${lit ? ' is-lit' : ''}`}>{value}</span>
    </div>
  );
}

/** 下のボタンの数字（PC だけ。マインクラフトのホットバーと同じく、数字のキーで押せる） */
function HotkeyNumber({ n }: { n: number }) {
  return (
    <span className="hud-hotkey hud-keyboard-only" aria-hidden="true">
      {n}
    </span>
  );
}

/** 地球を原点にした座標（天の赤道の向き。X が春分点、Z が天の北極） */
function Coordinates({ v }: { v: { x: number; y: number; z: number } }) {
  const c = formatCoordinates(v);
  return (
    <div className="hud-coords" title="Earth-centered coordinates (X: vernal equinox, Z: celestial north pole)">
      <span>X {c.x}</span> <span>Y {c.y}</span> <span>Z {c.z}</span> <span className="hud-muted">{c.unit}</span>
    </div>
  );
}
