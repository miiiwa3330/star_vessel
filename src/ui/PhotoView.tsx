import { useMemo } from 'react';
import type { Photo } from './hud-store';

/**
 * 撮った写真（要件 F61。2026-11-12）。画面の真ん中に大きく見せ、「保存する」で端末に保存し、
 * 共有できる端末（スマホなど）では「共有する」で、ほかのアプリへ渡す。写真はサーバーに送らない。
 * 閉じるのは、まわりを押すか Esc（× は置かない）。閉じると写真はブラウザから消える
 */
export function PhotoView({ photo }: { photo: Photo }) {
  const file = useMemo(() => new File([photo.blob], photo.fileName, { type: photo.blob.type || 'image/png' }), [photo]);
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  return (
    <div className="hud-panel hud-modal hud-photo" role="dialog" aria-label="写真">
      <p className="hud-eyebrow">PHOTO</p>
      <img className="hud-photo-image" src={photo.url} alt="撮った写真" width={photo.width} height={photo.height} />
      <div className="hud-photo-actions">
        <a className="hud-button" href={photo.url} download={photo.fileName}>
          保存する
        </a>
        {canShare && (
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              navigator.share({ files: [file], title: 'STAR VESSEL' }).catch((e: unknown) => {
                // 共有の画面を閉じただけのときは何もしない
                if (!(e instanceof DOMException && e.name === 'AbortError')) console.error(e);
              });
            }}
          >
            共有する
          </button>
        )}
      </div>
    </div>
  );
}
