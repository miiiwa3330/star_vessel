import { Credits } from './Credits';

/**
 * サービスの詳細（タイトル画面の、スクロールした先の画面）。書いてあることは、docs/concept/README.md（体験の核・世界観）と、
 * README.md・docs/product/requirements.md（できること・データの数）から。文章は仮（オーナーの確認待ち）。
 * 数は、実際に入っているデータの数（README.md）。変わったら、ここも直す。
 */
const CORES = [
  { no: '01', title: '一人称で宇宙を進む', body: '操縦席から見た宇宙を、自分で動かして進みます。近くは速さを自由に変えて自分で操縦し、遠くはワープホールで一気に飛べます。' },
  { no: '02', title: '本物の宇宙が、いま動いている', body: '惑星の位置・公転・自転は、現実のいまの時刻と同じです。地球の昼と夜も、現実と一致しています。' },
  { no: '03', title: 'ひとりじゃない', body: 'いま同時に遊んでいる世界中のプレイヤーが、宇宙船として同じ宇宙に見えます。スタンプで、あいさつもできます。' },
  { no: '04', title: 'みんな地球から始まる', body: '出発点は、全員同じ地球です。そこから、天の川銀河の外まで、遠くへ行けます。' },
] as const;

const DATA = [
  ['約 100 万個', '本物の星（HYG と Gaia DR3）。いまの位置まで動かしてあります'],
  ['約 90 万個', '太陽系の小惑星。衛星は 460 個、彗星は約 4,000 個'],
  ['約 6,600 個', '実在の系外惑星（TRAPPIST-1 など）。軌道も本物です'],
  ['約 1,700 機', '地球のまわりの本物の人工衛星（ISS など）と、探査機 18 機'],
  ['約 6,900 個', '実在の星団。星雲は約 2,300 個、ほかの銀河は 862 個'],
] as const;

const PLAY = [
  ['宇宙船を選ぶ', '3 種類の UFO から選べます。ほかのプレイヤーにも、その形で見えます'],
  ['ワープホールを置く', '行った場所に置けます（1 人 3 個まで）。全員で共有され、どこからでも飛べます'],
  ['天体を調べる', '近づいた天体の情報がカードで出ます。訪れた天体は、コレクションに記録されます'],
  ['星座をたどる', '星座の線は本物の星の 3 次元の位置を結ぶので、遠くへ行くと、形が崩れていきます'],
] as const;

export function ServiceDetails() {
  return (
    <section className="top-details" aria-labelledby="top-details-title">
      <div className="top-details-inner">
        <p className="top-eyebrow">ABOUT</p>
        <h2 id="top-details-title" className="top-details-title">地球から飛び立ち、同じ宇宙を旅する。</h2>
        <p className="top-details-lead">
          STAR VESSEL は、世界中のプレイヤーと同じ宇宙を、自分の宇宙船の一人称視点で旅する Web サービスです。位置と動きは本物、見た目は軽く。
          すべてを作り込まず、実在のデータがある範囲はそれを使い、ない範囲は本物の銀河の形に沿って自動で作ります。
        </p>

        <ol className="top-cores">
          {CORES.map((c) => (
            <li key={c.no} className="top-core">
              <span className="top-core-no">{c.no}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </li>
          ))}
        </ol>

        <p className="top-eyebrow">REAL DATA</p>
        <h2 className="top-details-title">本物のデータでできた宇宙</h2>
        <dl className="top-data">
          {DATA.map(([n, t]) => (
            <div key={n} className="top-data-row">
              <dt>{n}</dt>
              <dd>{t}</dd>
            </div>
          ))}
        </dl>
        <p className="top-details-note">遠くは光の点で見え、近づくと実際の大きさの形になります。</p>

        <p className="top-eyebrow">PLAY</p>
        <h2 className="top-details-title">できること</h2>
        <dl className="top-data top-play">
          {PLAY.map(([n, t]) => (
            <div key={n} className="top-data-row">
              <dt>{n}</dt>
              <dd>{t}</dd>
            </div>
          ))}
        </dl>

        <p className="top-eyebrow">ACCOUNT</p>
        <h2 className="top-details-title">登録しなくても、始められます</h2>
        <p className="top-details-lead">
          記録を残したい人だけ、あとから、ユーザー名とパスワード（またはパスキー）で登録できます。メールアドレスは集めません。
          ワープホール・宇宙船・訪れた天体の記録は、ほかの端末でも、続きから遊べます。
        </p>

        <p className="top-details-note">いまは「世界の創造」の段階で、操縦などは仮のものです。探索のほかの遊びは、世界ができてから考えます。</p>

        <Credits />
      </div>
    </section>
  );
}
