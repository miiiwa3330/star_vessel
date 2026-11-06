/**
 * タイトル画面の「いま何をしているか」を、画面の部品（React）と 3D の描画（earth-scene.ts）が共有する入れ物。
 * 毎フレーム読む値（カメラの行き先・UFO の位置）を React の再描画に通すと重いので、普通のオブジェクトにして、
 * 部品が書き、描画が毎フレーム読む。描画が決める値（どこに着いたか）は、listener で部品に知らせる。
 */
export type StageView = 'earth' | 'moon' | 'mars';
/** カメラの様子。there：行き先（月・火星）に着いている。flying：地球と行き先の間を飛んでいる途中 */
export type StageArrival = 'earth' | 'there' | 'flying';

export class TopStage {
  /** カメラの行き先 */
  view: StageView = 'earth';
  /** カメラが着いた先（描画が書く） */
  arrival: StageArrival = 'earth';

  /** UFO を出すか（false なら、左へ消えていく） */
  ufoShown = false;
  /** 選んでいる船の目標。整数で、輪を何周してもよい（ufo-carousel.ts） */
  target = 0;
  /** ドラッグ中の位置。ドラッグしていなければ null */
  dragPos: number | null = null;
  /** 船体の色（色相）。船を選ぶ前に、アカウントの色が分かる */
  hue = 200;
  /** UFO の列の、画面での位置（css px）。出ていなければ null */
  getRect: (() => { left: number; top: number; width: number; height: number } | null) | null = null;
  /** 描画が書く：UFO の列の、いまの位置（小数）と速さ（ドラッグから指を離したときの続きに使う） */
  pos = 0;
  vel = 0;
  /** 描画が書く：UFO を 3D で描けているか（描けなければ、名前の文字で選ぶ） */
  ufoDrawn = false;
  /** 描画が書く：UFO の出入りの途中か（途中は、選べない） */
  ufoBusy = false;
  /** 火星の準備を先に済ませるか（サインインしているとき。ユーザー名から火星へ行く） */
  preloadMars = false;
  /** 描画が書く：行き先への飛行の速さ（0〜1。飛行の真ん中で 1）。星空が、放射状に伸びて流れる（Backdrop） */
  warp = 0;

  private readonly listeners = new Set<() => void>();

  /** 描画が書いた値が変わったとき、部品に知らせる */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  setArrival(next: StageArrival): void {
    if (this.arrival === next) return;
    this.arrival = next;
    this.emit();
  }
}
