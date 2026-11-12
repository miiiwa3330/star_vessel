import './keyboard-guide.css';

/**
 * 操作の説明の図（2026-11-12 にオーナーの指示）。キーボードとマウスの絵の、使うキーから線を伸ばして説明する。
 * ゲームメニュー（Esc）の「？ 操作」と、タイトル画面の詳細（CONTROLS）の両方で使う。
 * 使うキーはオレンジ、使わないキーは薄い線。線は、説明のあるキーの上を通らないよう、キーの間のすき間を通して外へ出す。
 * 中身は src/controls/flight.ts の操作と同じ（変えたら、ここも直す）
 */

/** キーの大きさ（図の座標）。1 キーの幅 P、キーの高さ H */
const P = 40;
const H = 36;
/** キーボードの左上 */
const X0 = 200;
const Y0 = 120;
/** 左右の説明の文字の端 */
const LX = X0 - 26;
const RX = X0 + 15 * P + 26;

type KeyDef = [id: string, label: string, width: number, hot?: boolean];
/** 1 段ずつ。幅はキーの数（1 = ふつうのキー）。空の id はすき間 */
const ROWS: KeyDef[][] = [
  [
    ['Esc', 'Esc', 1, true],
    ['', '', 0.5],
    ['F1', 'F1', 1], ['F2', 'F2', 1, true], ['F3', 'F3', 1, true], ['F4', 'F4', 1],
    ['', '', 0.25],
    ['F5', 'F5', 1, true], ['F6', 'F6', 1], ['F7', 'F7', 1], ['F8', 'F8', 1],
    ['', '', 0.25],
    ['F9', 'F9', 1], ['F10', 'F10', 1], ['F11', 'F11', 1], ['F12', 'F12', 1],
  ],
  [
    ['`', '`', 1], ['1', '1', 1, true], ['2', '2', 1, true], ['3', '3', 1, true], ['4', '4', 1, true], ['5', '5', 1, true], ['6', '6', 1], ['7', '7', 1],
    ['8', '8', 1], ['9', '9', 1], ['0', '0', 1], ['-', '−', 1, true], ['=', '＋', 1, true], ['Back', 'Delete', 2],
  ],
  [
    ['Tab', 'Tab', 1.5], ['Q', 'Q', 1, true], ['W', 'W', 1, true], ['E', 'E', 1, true], ['R', 'R', 1], ['T', 'T', 1, true],
    ['Y', 'Y', 1], ['U', 'U', 1], ['I', 'I', 1], ['O', 'O', 1], ['P', 'P', 1], ['[', '[', 1], [']', ']', 1], ['\\', '\\', 1.5],
  ],
  [
    ['Caps', 'Caps', 1.75], ['A', 'A', 1, true], ['S', 'S', 1, true], ['D', 'D', 1, true], ['F', 'F', 1], ['G', 'G', 1],
    ['H', 'H', 1], ['J', 'J', 1], ['K', 'K', 1], ['L', 'L', 1], [';', ';', 1], ["'", "'", 1], ['Enter', 'Enter', 2.25, true],
  ],
  [
    ['Shift', 'Shift', 2.25, true], ['Z', 'Z', 1], ['X', 'X', 1], ['C', 'C', 1, true], ['V', 'V', 1, true], ['B', 'B', 1],
    ['N', 'N', 1], ['M', 'M', 1, true], [',', ',', 1], ['.', '.', 1], ['/', '/', 1], ['Shift2', 'Shift', 2.75],
  ],
  [
    ['Ctrl', 'Ctrl', 1.5, true], ['Alt', 'Alt', 1.25, true], ['Cmd', '⌘', 1.25], ['Space', 'Space', 5.75, true],
    ['Cmd2', '⌘', 1.25], ['Alt2', 'Alt', 1.25], ['Fn', 'Fn', 1.25], ['Ctrl2', 'Ctrl', 1.5],
  ],
];

interface Key {
  id: string;
  label: string;
  hot: boolean;
  x: number;
  y: number;
  w: number;
  cx: number;
  cy: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const rowTop = (r: number) => Y0 + (r === 0 ? 0 : (r + 0.25) * P);
const KEYS: Key[] = ROWS.flatMap((row, r) => {
  let at = 0;
  const out: Key[] = [];
  for (const [id, label, width, hot] of row) {
    if (id) {
      const x = X0 + at * P + 2;
      const w = width * P - 4;
      const y = rowTop(r);
      out.push({ id, label, hot: !!hot, x, y, w, cx: x + w / 2, cy: y + H / 2, top: y, bottom: y + H, left: x, right: x + w });
    }
    at += width;
  }
  return out;
});
const key = (id: string) => KEYS.find((k) => k.id === id)!;
/** r 段目のすぐ上のすき間の高さ（1 段目の上は、ほかより広い） */
const gapAbove = (r: number) => (r === 1 ? (Y0 + H + rowTop(1)) / 2 : rowTop(r) - 2);
const gapBelow = (r: number) => gapAbove(r + 1);

interface Callout {
  /** 線（キーの側から順に）。複数のキーに 1 つの説明を付けるときは、線を複数 */
  lines: [number, number][][];
  text: string[];
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

/** キーの上の端からまっすぐ上へ */
const upTo = (k: Key, y: number, x = k.cx): [number, number][] => (x === k.cx ? [[k.cx, k.top], [k.cx, y]] : [[k.cx, k.top], [k.cx, y + 14], [x, y]]);
/** すき間 gy を通って、キーボードの左（右）の外へ。最後に ly へ寄せる */
const toLeft = (k: Key, gy: number, ly: number): [number, number][] => [
  [k.cx, gy < k.cy ? k.top : k.bottom],
  [k.cx, gy],
  [X0 - 10, gy],
  [LX + 6, ly],
];
const toRight = (k: Key, gy: number, ly: number): [number, number][] => [
  [k.cx, gy < k.cy ? k.top : k.bottom],
  [k.cx, gy],
  [X0 + 15 * P + 10, gy],
  [RX - 6, ly],
];
/** すき間 gy を通って横の x へ寄せてから、まっすぐ下へ */
const downVia = (k: Key, gy: number, x: number, y: number): [number, number][] => [[k.cx, k.bottom], [k.cx, gy], [x, gy], [x, y]];

const BOTTOM1 = 404;
const BOTTOM2 = 438;
const TOP1 = 92;

const CALLOUTS: Callout[] = [
  // 上：1 段目
  { lines: [upTo(key('Esc'), TOP1 + 6)], text: ['メニュー'], x: key('Esc').cx, y: TOP1, anchor: 'middle' },
  // F2 と F3 は隣どうしなので、F2 の説明は一段上に出す（名前が重ならないように）
  { lines: [upTo(key('F2'), TOP1 - 26, key('F2').cx - 18)], text: ['写真'], x: key('F2').cx - 18, y: TOP1 - 32, anchor: 'middle' },
  { lines: [upTo(key('F3'), TOP1 + 6, key('F3').cx + 12)], text: ['左上の表示'], x: key('F3').cx + 12, y: TOP1, anchor: 'middle' },
  { lines: [upTo(key('F5'), TOP1 + 6)], text: ['視点（V でも）'], x: key('F5').cx + 20, y: TOP1, anchor: 'middle' },
  // 左：1〜5・Q・W・A・Shift・Ctrl
  {
    lines: [
      toLeft(key('5'), gapAbove(1), 126),
      ...(['1', '2', '3', '4'] as const).map((id): [number, number][] => [[key(id).cx, key(id).top], [key(id).cx, gapAbove(1)]]),
    ],
    text: ['1〜5：下のボタン', 'コレクション・星の見え方', '星座・ワープを作る・写真'],
    x: LX,
    y: 130,
    anchor: 'end',
  },
  { lines: [toLeft(key('Q'), gapAbove(2), 196)], text: ['左に傾く'], x: LX, y: 200, anchor: 'end' },
  { lines: [toLeft(key('W'), gapBelow(2), 240)], text: ['前へ', '2 回押しでダッシュ'], x: LX, y: 236, anchor: 'end' },
  { lines: [toLeft(key('A'), gapBelow(3), 290)], text: ['左へ'], x: LX, y: 294, anchor: 'end' },
  { lines: [[[key('Shift').left, key('Shift').cy], [LX + 6, 322]]], text: ['下降'], x: LX, y: 326, anchor: 'end' },
  { lines: [[[key('Ctrl').left, key('Ctrl').cy], [LX + 6, 356]]], text: ['ダッシュ'], x: LX, y: 360, anchor: 'end' },
  // 右：＋−・E・D・Enter・S
  {
    lines: [toRight(key('-'), gapAbove(1), 160), [[key('=').cx, key('=').top], [key('=').cx, gapAbove(1)]]],
    text: ['速さ'],
    x: RX,
    y: 164,
    anchor: 'start',
  },
  { lines: [toRight(key('E'), gapAbove(2), 200)], text: ['右に傾く'], x: RX, y: 204, anchor: 'start' },
  { lines: [toRight(key('D'), gapAbove(3), 236)], text: ['右へ'], x: RX, y: 240, anchor: 'start' },
  { lines: [[[key('Enter').right, key('Enter').cy], [RX - 6, 272]]], text: ['チャット（T でも）'], x: RX, y: 276, anchor: 'start' },
  { lines: [toRight(key('S'), gapBelow(3), 308)], text: ['後ろへ'], x: RX, y: 312, anchor: 'start' },
  // 下：C・Space・M・Alt
  { lines: [downVia(key('C'), gapBelow(4), key('Cmd').cx, BOTTOM1 - 16)], text: ['星座'], x: key('Cmd').cx, y: BOTTOM1, anchor: 'middle' },
  { lines: [[[key('Space').cx, key('Space').bottom], [key('Space').cx, BOTTOM1 - 16]]], text: ['上昇'], x: key('Space').cx, y: BOTTOM1, anchor: 'middle' },
  { lines: [downVia(key('M'), gapBelow(4), key('Cmd2').cx, BOTTOM1 - 16)], text: ['マップ'], x: key('Cmd2').cx, y: BOTTOM1, anchor: 'middle' },
  { lines: [[[key('Alt').cx, key('Alt').bottom], [key('Alt').cx, BOTTOM2 - 16]]], text: ['＋ホイール：視点の距離'], x: key('Alt').cx, y: BOTTOM2, anchor: 'middle' },
];

/** マウスの絵（別の図）。中心 MX、上の端 MY */
const MX = 210;
const MY = 150;
const MW = 104;
const MH = 176;
const MOUSE_CALLOUTS: Callout[] = [
  { lines: [[[MX, MY + 38], [MX, 86]]], text: ['ホイール：速さ', 'Ctrl＋ホイール：10 倍ずつ'], x: MX, y: 50, anchor: 'middle' },
  { lines: [[[MX - 26, MY + 30], [MX - 70, MY + 30], [MX - 84, MY + 14]]], text: ['クリック', '照準の先を選ぶ'], x: MX - 88, y: MY + 2, anchor: 'end' },
  { lines: [[[MX + 26, MY + 30], [MX + 70, MY + 30], [MX + 84, MY + 14]]], text: ['右ドラッグ', '回り込む（三人称）'], x: MX + 88, y: MY + 2, anchor: 'start' },
  { lines: [[[MX, MY + MH], [MX, 372]]], text: ['動かす：向きを変える'], x: MX, y: 392, anchor: 'middle' },
];

function Callouts({ items }: { items: Callout[] }) {
  return (
    <>
      {items.map((c) => (
        <g key={c.text.join()}>
          {c.lines.map((pts, i) => (
            <g key={i}>
              <polyline className="kb-line" points={pts.map(([x, y]) => `${x},${y}`).join(' ')} />
              <circle className="kb-dot" cx={pts[0][0]} cy={pts[0][1]} r={2.4} />
            </g>
          ))}
          <text className="kb-text" x={c.x} y={c.y} textAnchor={c.anchor}>
            {c.text.map((t, i) => (
              <tspan key={t} x={c.x} dy={i === 0 ? 0 : 17} className={i === 0 ? undefined : 'kb-sub'}>
                {t}
              </tspan>
            ))}
          </text>
        </g>
      ))}
    </>
  );
}

export function KeyboardGuide() {
  return (
    <div className="kb-guide">
      <div className="kb-scroll">
        <div className="kb-figures">
          <svg className="kb-keyboard" viewBox="0 0 1010 460" role="img" aria-label="キーボードの操作の図">
            <title>キーボードの操作</title>
            {KEYS.map((k) => (
              <g key={k.id} className={k.hot ? 'kb-key is-hot' : 'kb-key'}>
                <rect x={k.x} y={k.y} width={k.w} height={H} rx={6} />
                <text x={k.cx} y={k.cy + 4.5} textAnchor="middle">
                  {k.label}
                </text>
              </g>
            ))}
            <Callouts items={CALLOUTS} />
          </svg>
          <svg className="kb-mouse" viewBox="0 0 420 460" role="img" aria-label="マウスの操作の図">
            <title>マウスの操作</title>
            <g className="kb-key is-hot">
              <rect x={MX - MW / 2} y={MY} width={MW} height={MH} rx={MW / 2} />
            </g>
            <line className="kb-mouse-seam" x1={MX} y1={MY} x2={MX} y2={MY + 74} />
            <line className="kb-mouse-seam" x1={MX - MW / 2 + 4} y1={MY + 74} x2={MX + MW / 2 - 4} y2={MY + 74} />
            <rect className="kb-mouse-wheel" x={MX - 6} y={MY + 22} width={12} height={30} rx={6} />
            <Callouts items={MOUSE_CALLOUTS} />
          </svg>
        </div>
      </div>
      <ul className="kb-touch">
        <li>
          <span className="kb-touch-head">スマホ</span>
          ドラッグ：向きを変える ／ 左下の十字：前後左右（前を 2 回押しでダッシュ） ／ 右下：上昇・下降 ／ タップ：天体を選ぶ ／ マップを押す：大きくする
        </li>
        <li>
          <span className="kb-touch-head">マップ</span>
          上が進む方向 ／ ●自分より上 ○下 ／ ◆ワープホール ／ ▲ほかのプレイヤー ／ 大きくしたマップでは、点を押すとその天体を選べる
        </li>
      </ul>
    </div>
  );
}
