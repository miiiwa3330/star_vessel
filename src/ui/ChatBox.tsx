import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_CHARS, CHAT_STAMPS, filterChatLog } from '../world/chat';
import { EMOJI_GROUPS } from './emoji-list';
import { hudActions, hudStore, type ChatFocus, type ChatLogItem } from './hud-store';

/** ふだん（入力欄を使っていないとき）に出しておく履歴の数（古いものは、入力欄を開くと遡れる） */
const SHOWN_LINES = 6;
/** ふだんの表示で、届いてから薄くしはじめるまで（ms）と、消すまで（ms）。消すと、すりガラスの面もその分縮む */
const LINE_FADE_MS = 14_000;
const LINE_HIDE_MS = 15_200;
/** キーボードの無いスマホでは、Enter の案内を出さない */
const touchOnly = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** 押しても入力欄からフォーカスを外さない（外れると、チャットが閉じてしまう。スマホではキーボードも出さない） */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/**
 * チャット（要件 F6）。画面の左下に、1 枚のすりガラスの面で、上に履歴、細い線で分けて下にスタンプと入力欄。
 * 近くのプレイヤー（船が見えている相手）に届き、送った人の船の上にも吹き出しが出る。
 * 履歴は、しばらくすると薄くなって消える（入力欄を使っている間は、全部出す）。マインクラフトのチャットと同じ考え方。
 * スタンプ（絵文字 8 つ）は常に並べ、押すとそのまま送る。入力欄の右の ☺ は、もっと多くの絵文字から選んで入力欄に足すとき用。
 * PC は Enter か T で入力欄を開き、Enter で送る・Esc でやめる（どちらも操縦に戻る）。
 * スマホは開閉式（2026-11-21）：左の列のチャットのボタンで開く・閉じる。閉じている間に届いた発言は、ボタンの点で知らせる
 */
export function ChatBox({
  ready,
  log,
  focus,
  open,
  underPanel = false,
  collapsed = false,
}: {
  ready: boolean;
  log: ChatLogItem[];
  focus: ChatFocus | null;
  open: boolean;
  underPanel?: boolean;
  /** スマホで閉じているとき（開閉式。2026-11-21）。PC では使わない（CSS がスマホのときだけ隠す） */
  collapsed?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [liked, setLiked] = useState<string | null>(null);
  const likeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => () => clearTimeout(likeTimer.current), []);
  useEffect(() => {
    if (open && document.activeElement !== input.current) input.current?.focus();
    // PC では、チャットを閉じたら絵文字の一覧も閉じる
    if (!open && !touchOnly) setPicker(false);
  }, [open]);
  const visibleLog = filterChatLog(log, focus);
  // ふだんの表示で、古くなった行を消すための時計（消す行が無いときは止める）
  const latest = visibleLog[0]?.at ?? 0;
  useEffect(() => {
    setNow(Date.now());
    if (Date.now() - latest > LINE_HIDE_MS) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - latest > LINE_HIDE_MS) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [latest]);
  const close = () => {
    if (hudStore.get().overlay === 'chat') hudActions.setOverlay(null);
    input.current?.blur();
  };
  const sendStamp = (t: string) => {
    if (!hudActions.sendChat(t)) return;
    setLiked(null);
    requestAnimationFrame(() => setLiked(t));
    clearTimeout(likeTimer.current);
    likeTimer.current = setTimeout(() => setLiked(null), 380);
    setPicker(false);
    close();
  };
  const addEmoji = (e: string) => {
    if ((text + e).length > CHAT_MAX_CHARS) return;
    setText(text + e);
    input.current?.focus();
  };
  const shown = open ? visibleLog : visibleLog.filter((l) => now - l.at < LINE_HIDE_MS).slice(0, SHOWN_LINES);
  return (
    <div className={`hud-chat${open ? ' is-open' : ''}${underPanel ? ' is-under-panel' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      {focus && (
        <div className="hud-chat-focus">
          <span className="hud-chat-focus-target">
            <span className="hud-chat-focus-dot" style={{ background: `hsl(${focus.hue} 80% 70%)` }} aria-hidden="true" />
            <span className="hud-chat-focus-name" style={{ color: `hsl(${focus.hue} 80% 70%)` }}>
              {focus.name ?? 'ゲスト'}
            </span>
            <span className="hud-chat-focus-label">の会話</span>
          </span>
          <button
            type="button"
            className="hud-chat-focus-clear"
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={() => hudActions.clearChatFocus()}
          >
            解除
          </button>
        </div>
      )}
      {shown.length > 0 && (
        <ol className="hud-chat-log" aria-label="チャットの履歴" aria-live="polite">
          {[...shown].reverse().map((l) => (
            <li key={l.key} className={`hud-chat-line${!open && now - l.at > LINE_FADE_MS ? ' is-fading' : ''}`}>
              <span className="hud-chat-name" style={{ color: `hsl(${l.hue} 80% 70%)` }}>
                {l.prefix && <span className="hud-chat-dir">{l.prefix}</span>}
                {l.name ?? 'ゲスト'}
              </span>
              <span className="hud-chat-text">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="hud-chat-compose">
        {picker && ready && (
          <div className="hud-chat-picker" role="group" aria-label="絵文字">
            {EMOJI_GROUPS.map((g) => (
              <div key={g.name} className="hud-chat-picker-group">
                <div className="hud-chat-picker-name">{g.name}</div>
                <div className="hud-chat-emoji-grid">
                  {g.list.map((e) => (
                    <button key={e} type="button" className="hud-chat-emoji" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => addEmoji(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="hud-chat-stamps" role="group" aria-label="スタンプ（押すと送る）">
          {CHAT_STAMPS.map((t) => (
            <button
              key={t}
              type="button"
              className={`hud-chat-emoji is-stamp${liked === t ? ' is-liked' : ''}`}
              title="押すと送る"
              disabled={!ready}
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => sendStamp(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <form
          className="hud-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() === '') {
              close();
              return;
            }
            if (hudActions.sendChat(text)) {
              setText('');
              setPicker(false);
              close();
            }
          }}
        >
          <input
            ref={input}
            className="hud-chat-input"
            type="text"
            value={text}
            maxLength={CHAT_MAX_CHARS}
            enterKeyHint="send"
            autoComplete="off"
            disabled={!ready}
            placeholder={ready ? (touchOnly ? 'チャット' : 'Enter でチャット') : '宇宙の部屋につながると話せます'}
            aria-label="チャット"
            onChange={(e) => setText(e.target.value)}
            onFocus={() => {
              if (hudStore.get().overlay !== 'chat') hudActions.setOverlay('chat');
            }}
            // ほかの場所を押して入力欄から外れたら、チャットを閉じて操縦に戻る
            onBlur={() => {
              if (hudStore.get().overlay === 'chat') hudActions.setOverlay(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
          <button
            type="button"
            className={`hud-chat-picker-toggle${picker ? ' is-selected' : ''}`}
            aria-label="絵文字"
            title="絵文字（選ぶと入力欄に足す）"
            aria-expanded={picker}
            disabled={!ready}
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={() => {
              // PC は、チャットを開いてから一覧を出す（カーソルが出て、押せるようになる）
              if (!touchOnly && !open) hudActions.setOverlay('chat');
              setPicker((v) => !v);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
              <circle cx="9" cy="10" r="0.6" fill="currentColor" />
              <circle cx="15" cy="10" r="0.6" fill="currentColor" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
