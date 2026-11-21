/**
 * タイトル画面の起動（src/entry.ts から）。世界は読み込まない。
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { TopApp } from './TopApp';
import { finishLoading } from '../loading-screen';
import '@fontsource/monoton/400.css';
import '@fontsource/josefin-sans/300.css';
import './top.css';

// 世界の画面の部品は使わないので外す（空の canvas を残さない）
document.getElementById('view')?.remove();
document.getElementById('ui')?.remove();
createRoot(document.getElementById('top')!).render(createElement(TopApp));
// 世界の「タイトルへ」から来たときのローディング画面は、タイトル画面を描いてから、UFO が右の端に着いたときに消す
requestAnimationFrame(() => requestAnimationFrame(() => finishLoading()));
