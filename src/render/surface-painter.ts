/**
 * 天体の模様を Web Worker（surface-worker.ts）で描いて、three.js の画像にする。
 * Worker が使えないところ（テストなど）では、その場で描く。
 */
import * as THREE from 'three/webgpu';
import { flipRows, paintSurface, type SurfaceLook } from '../world/surface';
import { imageToTexture } from './surface-texture';
import type { PaintRequest } from './surface-worker';

type Done = (t: THREE.DataTexture) => void;

export class SurfacePainter {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, Done>();

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./surface-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; data: Uint8Array; width: number; height: number }>) => {
        const done = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        done?.(imageToTexture({ width: e.data.width, height: e.data.height, data: e.data.data }));
      };
    } catch (err) {
      console.warn('模様を描く Worker が使えないので、その場で描きます', err);
      this.worker = null;
    }
  }

  paint(look: SurfaceLook, seed: number, width: number, height: number): Promise<THREE.DataTexture> {
    if (!this.worker) return Promise.resolve(imageToTexture(flipRows(paintSurface(look, seed, width, height))));
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      const req: PaintRequest = { id, look, seed, width, height };
      this.worker!.postMessage(req);
    });
  }
}
