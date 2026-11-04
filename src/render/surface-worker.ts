/**
 * 天体の模様を描く Web Worker。模様を描く計算は重い（512×256 で数十 ms）ので、
 * 恒星系に入ったときに画面が止まらないよう、描画のループとは別のスレッドで描く。
 */
import { flipRows, paintSurface, type SurfaceLook } from '../world/surface';

export interface PaintRequest {
  id: number;
  look: SurfaceLook;
  seed: number;
  width: number;
  height: number;
}

self.onmessage = (e: MessageEvent<PaintRequest>) => {
  const { id, look, seed, width, height } = e.data;
  const img = flipRows(paintSurface(look, seed, width, height));
  (self as unknown as Worker).postMessage({ id, data: img.data, width, height }, [img.data.buffer]);
};
