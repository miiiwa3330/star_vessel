/**
 * クレジット（出典とライセンスの表記）。タイトル画面の詳細の、いちばん下にまとめて出す。
 * 以前は、世界の画面の左下の「クレジット」と、タイトル画面の下の端の 1 行に分かれていたが、2026-11-06 にオーナーの指示で、
 * ここにまとめた（世界の画面からは、クレジットを消した）。外部のデータ・画像・書体を足したら、ここに足す（docs/tech/credits.md と同じ内容）。
 * CC BY・CC BY-SA の表記のため、リンクを付ける。
 */
interface Link {
  text: string;
  href: string;
}
interface Entry {
  /** 何についての出典か（「星」「人工衛星」など） */
  what: string;
  /** 出典へのリンクと、ライセンス。上から順に並べる */
  links: Link[];
}

const CC = (kind: string, version: string): Link => ({ text: `CC ${kind} ${version}`, href: `https://creativecommons.org/licenses/${kind.toLowerCase()}/${version}/` });

const ENTRIES: readonly Entry[] = [
  { what: '星', links: [{ text: 'HYG v4.4', href: 'https://codeberg.org/astronexus/hyg' }, CC('BY-SA', '4.0')] },
  { what: '星（近く）', links: [{ text: 'ESA Gaia DR3', href: 'https://www.cosmos.esa.int/gaia' }, { text: 'CC BY-SA 3.0 IGO', href: 'https://www.cosmos.esa.int/web/gaia-users/license' }] },
  { what: '系外惑星', links: [{ text: 'Open Exoplanet Catalogue', href: 'https://github.com/OpenExoplanetCatalogue/open_exoplanet_catalogue' }, { text: 'MIT', href: 'https://opensource.org/license/mit' }, { text: 'NASA Exoplanet Archive', href: 'https://exoplanetarchive.ipac.caltech.edu/' }] },
  { what: '衛星・小惑星・探査機・彗星', links: [{ text: 'NASA/JPL', href: 'https://ssd.jpl.nasa.gov/' }] },
  { what: '衛星の名前', links: [{ text: 'Wikidata', href: 'https://www.wikidata.org/' }, { text: 'CC0', href: 'https://creativecommons.org/publicdomain/zero/1.0/' }] },
  { what: '人工衛星', links: [{ text: 'SatNOGS DB', href: 'https://db.satnogs.org/' }, CC('BY-SA', '4.0')] },
  { what: '星団・白色矮星・パルサー・ブラックホール', links: [{ text: 'VizieR', href: 'https://vizier.cfa.harvard.edu/' }, { text: 'Hunt & Reffert 2023 ほか', href: 'https://vizier.cfa.harvard.edu/' }] },
  { what: '星雲', links: [{ text: 'SIMBAD', href: 'https://simbad.cfa.harvard.edu/' }, { text: 'OpenNGC', href: 'https://github.com/mattiaverga/OpenNGC' }, CC('BY-SA', '4.0')] },
  { what: '銀河', links: [{ text: 'Karachentsev ほか 2013（VizieR）', href: 'https://vizier.cfa.harvard.edu/' }] },
  { what: '星座の線', links: [{ text: 'd3-celestial', href: 'https://github.com/ofrohn/d3-celestial' }, { text: 'BSD 3-Clause', href: 'https://opensource.org/license/bsd-3-clause' }] },
  { what: '地球・天体の画像', links: [{ text: 'Solar System Scope', href: 'https://www.solarsystemscope.com/textures/' }, CC('BY', '4.0')] },
  { what: '書体', links: [{ text: 'Monoton', href: 'https://fonts.google.com/specimen/Monoton' }, { text: 'Josefin Sans', href: 'https://fonts.google.com/specimen/Josefin+Sans' }, { text: 'DotGothic16', href: 'https://fonts.google.com/specimen/DotGothic16' }, { text: 'OFL 1.1', href: 'https://openfontlicense.org/' }] },
];

export function Credits() {
  return (
    <section className="top-credits" aria-labelledby="top-credits-title">
      <p className="top-eyebrow">CREDITS</p>
      <h2 id="top-credits-title" className="top-credits-title">データ・画像・書体の出典</h2>
      <dl className="top-credits-list">
        {ENTRIES.map((e) => (
          <div key={e.what} className="top-credits-row">
            <dt>{e.what}</dt>
            <dd>
              {e.links.map((l, i) => (
                <span key={l.text + l.href}>
                  {i > 0 && '、'}
                  <a href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.text}
                  </a>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
