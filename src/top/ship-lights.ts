/**
 * タイトル画面の背景の、船の光（要件 F53）。遠くの船は、世界の画面と同じく、航行灯のような光の点で見せる。
 * 船の色（色相）の光の点と、進んできた向きを示す短い尾。現れる・消えるときは、明るさをなめらかに変える。
 * 背景が透明（後ろに星空がある）なので、光を足すときは、透明度も光の強さに合わせて足す（additiveBlend）。
 */
import * as THREE from 'three/webgpu';
import type { TrackedShip } from './ship-tracks';

/** 光の点の大きさ（画面の高さに対する割合）。画面の高さ 700px で約 28px の光の広がり */
const GLOW_SCREEN_FRACTION = 0.04;
/** 尾の長さ（秒）。この秒数ぶん、速度のまま進んだ距離 */
const TRAIL_S = 12;
const TRAIL_POINTS = 14;

/**
 * 光を足す加算合成にする。色は「色 × 透明度」を足し、透明度も足す。
 * 後ろが透明な canvas は、色が透明度を超えない形（色 × 透明度 ≤ 透明度）で書かないと、色が消される。
 * 透明度を 0 のままにして色だけを足す設定にすると、光が全部消えた（2026-11-06 に確かめた）
 */
export function additiveBlend(m: THREE.Material): void {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneFactor;
}

function glowTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // 芯をくっきり、まわりをやわらかく
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.1, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Light {
  sprite: THREE.Sprite;
  trail: THREE.Line;
  positions: Float32Array;
  colors: Float32Array;
}

const colorOf = (hue: number): THREE.Color => new THREE.Color().setHSL(((hue % 360) + 360) % 360 / 360, 0.85, 0.66);

export class ShipLights {
  readonly group = new THREE.Group();
  private readonly lights = new Map<string, Light>();
  private readonly glow = glowTexture();

  /**
   * 船を描き直す。光の点が、camera から見て、画面の高さの GLOW_SCREEN_FRACTION の大きさに見えるように、距離に合わせて大きさを変える。
   * 尾の色は、先（船）が明るく、後ろへ向かって消える
   */
  update(ships: readonly TrackedShip[], camera: THREE.PerspectiveCamera): void {
    const seen = new Set<string>();
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    for (const s of ships) {
      seen.add(s.id);
      const l = this.lights.get(s.id) ?? this.create(s.id);
      const color = colorOf(s.hue);
      const p = s.position;
      l.sprite.position.set(p.x, p.y, p.z);
      const dist = camera.position.distanceTo(l.sprite.position);
      l.sprite.scale.setScalar(dist * 2 * tanHalf * GLOW_SCREEN_FRACTION * (0.6 + 0.4 * s.fade));
      const mat = l.sprite.material as THREE.SpriteNodeMaterial;
      mat.color.copy(color).multiplyScalar(s.fade);
      // 尾
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const k = i / (TRAIL_POINTS - 1);
        const back = k * TRAIL_S;
        l.positions[i * 3] = p.x - s.velocity.x * back;
        l.positions[i * 3 + 1] = p.y - s.velocity.y * back;
        l.positions[i * 3 + 2] = p.z - s.velocity.z * back;
        l.colors[i * 4] = color.r;
        l.colors[i * 4 + 1] = color.g;
        l.colors[i * 4 + 2] = color.b;
        l.colors[i * 4 + 3] = (1 - k) ** 1.6 * 0.7 * s.fade;
      }
      const geo = l.trail.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.computeBoundingSphere();
    }
    for (const [id, l] of this.lights) {
      if (seen.has(id)) continue;
      this.group.remove(l.sprite, l.trail);
      (l.sprite.material as THREE.Material).dispose();
      l.trail.geometry.dispose();
      (l.trail.material as THREE.Material).dispose();
      this.lights.delete(id);
    }
  }

  private create(id: string): Light {
    const mat = new THREE.SpriteNodeMaterial({ map: this.glow });
    additiveBlend(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.frustumCulled = false;
    const positions = new Float32Array(TRAIL_POINTS * 3);
    // 色は 4 つ（赤・緑・青・透明度）。尾の先ほど透明にして、後ろの星空に黒い線が残らないようにする
    const colors = new Float32Array(TRAIL_POINTS * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    const lineMat = new THREE.LineBasicNodeMaterial({ vertexColors: true });
    additiveBlend(lineMat);
    const trail = new THREE.Line(geo, lineMat);
    trail.frustumCulled = false;
    this.group.add(sprite, trail);
    const l = { sprite, trail, positions, colors };
    this.lights.set(id, l);
    return l;
  }

  get count(): number {
    return this.lights.size;
  }

  dispose(): void {
    this.update([], new THREE.PerspectiveCamera());
    this.glow.dispose();
  }
}
