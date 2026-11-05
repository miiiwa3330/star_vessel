/**
 * 太陽系の天体の見た目（画像のファイル名と、画像が無いときに自動で描く模様）。
 *
 * 画像は Solar System Scope（CC BY 4.0）のファイル名のまま public/textures/ に置けば使われる。
 * 置いていない天体は、ここに書いた色で模様を自動で描く（src/world/surface.ts）。
 * 色は見た目のための値で、観測の値ではない（docs/tech/world-model.md の「天体の見た目」）。
 */
import type { Rgb, SurfaceLook } from '../world/surface';

/** public/textures/ に置くと使われる画像。地球と月は必ず置く（リポジトリに入っている） */
export const TEXTURE_FILES: Readonly<Record<string, string>> = {
  Earth: '2k_earth_daymap.jpg',
  // 地球の夜の灯りと雲（天体の id ではない。src/render/solar-system-view.ts が使う）
  EarthNight: '2k_earth_nightmap.jpg',
  EarthClouds: '2k_earth_clouds.jpg',
  Moon: '2k_moon.jpg',
  Mercury: '2k_mercury.jpg',
  Venus: '2k_venus_atmosphere.jpg',
  Mars: '2k_mars.jpg',
  Jupiter: '2k_jupiter.jpg',
  Saturn: '2k_saturn.jpg',
  Uranus: '2k_uranus.jpg',
  Neptune: '2k_neptune.jpg',
};

/** 必ずある画像（無ければ起動に失敗させる） */
export const REQUIRED_TEXTURES: readonly string[] = ['Earth', 'Moon'];

const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** 画像が無い天体の模様 */
export const SURFACE_LOOKS: Readonly<Record<string, SurfaceLook>> = {
  Mercury: { kind: 'rocky', colors: [rgb(0x6f6a64), rgb(0x9a9690), rgb(0xb8b2a8)], craters: 0.42 },
  Venus: { kind: 'banded', colors: [rgb(0xd9c48f), rgb(0xe8d6a8), rgb(0xf0e2bc)], bands: 3, turbulence: 0.9 },
  Mars: { kind: 'rocky', colors: [rgb(0x7a3a22), rgb(0xc1623b), rgb(0xd8925e)], craters: 0.3 },
  Jupiter: {
    kind: 'banded',
    colors: [rgb(0x8c6a4a), rgb(0xc9a27a), rgb(0xeee0c8), rgb(0xd8b98c), rgb(0xa77b56)],
    bands: 16,
    turbulence: 0.1,
  },
  Saturn: { kind: 'banded', colors: [rgb(0xc7a873), rgb(0xe3cf9a), rgb(0xf0e2bd)], bands: 14, turbulence: 0.06 },
  Uranus: { kind: 'banded', colors: [rgb(0x8cc8d2), rgb(0x9fd8e0), rgb(0xb0e2e8)], bands: 6, turbulence: 0.1 },
  Neptune: { kind: 'banded', colors: [rgb(0x34509e), rgb(0x4f73d8), rgb(0x7c9ae8)], bands: 8, turbulence: 0.3 },
  Pluto: { kind: 'rocky', colors: [rgb(0x8a6f58), rgb(0xcbb59a), rgb(0xeee4d4)], craters: 0.2 },
  // ガリレオ衛星（イオ・エウロパ・ガニメデ・カリスト）
  'S5.1': { kind: 'rocky', colors: [rgb(0x8a5a1c), rgb(0xd9c25a), rgb(0xf2e6a0)], craters: 0.15 },
  'S5.2': { kind: 'rocky', colors: [rgb(0x9a7a5a), rgb(0xd8ccb8), rgb(0xf4f0e8)], craters: 0.05 },
  'S5.3': { kind: 'rocky', colors: [rgb(0x5a5048), rgb(0x8f857a), rgb(0xc8beb0)], craters: 0.35 },
  'S5.4': { kind: 'rocky', colors: [rgb(0x3a342e), rgb(0x5f564c), rgb(0x9a9084)], craters: 0.5 },
  // 土星・海王星・冥王星の主な衛星（見た目のための色）
  'S6.6': { kind: 'banded', colors: [rgb(0xb0702a), rgb(0xd89a48), rgb(0xe8b468)], bands: 3, turbulence: 0.5 },
  'S6.2': { kind: 'rocky', colors: [rgb(0xc8d0d8), rgb(0xe8eef4), rgb(0xffffff)], craters: 0.1 },
  'S6.8': { kind: 'rocky', colors: [rgb(0x2a2420), rgb(0x8a8078), rgb(0xe8e4dc)], craters: 0.3 },
  'S8.1': { kind: 'rocky', colors: [rgb(0x9a8070), rgb(0xd8c0b0), rgb(0xf0e4dc)], craters: 0.1 },
  'S9.1': { kind: 'rocky', colors: [rgb(0x5a5450), rgb(0x8a8480), rgb(0xb8b0a8)], craters: 0.3 },
};

/** どの天体にも当てはまらないときの模様（灰色の岩） */
export const DEFAULT_LOOK: SurfaceLook = {
  kind: 'rocky',
  colors: [rgb(0x5e5a55), rgb(0x8f8a84), rgb(0xb4aea6)],
  craters: 0.4,
};

/** 環の色 */
export const RING_COLOR: Rgb = rgb(0xd8c8a4);
