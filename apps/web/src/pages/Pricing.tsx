import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ProductView } from '@loopscene/contracts';
import { apiFetch } from '../lib/api';
import { formatJpy, useSession } from '../lib/session';
import { Badge, ErrorNotice, Loading } from '../components/common';

/**
 * UI-10: pricing.
 *
 * Every product states its tax-inclusive price, unit count, validity, renewal
 * behaviour and cancellation terms in the same visual weight. There are no
 * countdown discounts, no pre-ticked renewals and no "Pro copyright" tiers —
 * both products carry exactly the same music licence.
 */
export default function Pricing() {
  const navigate = useNavigate();
  const { me, runtime } = useSession();
  const [products, setProducts] = useState<ProductView[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ items: ProductView[] }>('/v1/products');
        setProducts(res.items);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const choose = (priceKey: string) => {
    const target = `/checkout/confirm?price=${encodeURIComponent(priceKey)}`;
    navigate(me ? target : `/auth?next=${encodeURIComponent(target)}`);
  };

  return (
    <div className="stack stack--loose">
      <div className="stack stack--tight">
        <h1 style={{ fontSize: 30 }}>料金</h1>
        <p className="muted">
          表示はすべて税込価格です。1回 = 技術的に正常な30秒音源1つ。
        </p>
      </div>

      <ErrorNotice error={error} />
      {loading && <Loading />}

      <div className="grid">
        {products.map((p) => (
          <article key={p.priceKey} className="card" style={{ gap: 'var(--s2)' }}>
            <div className="row row--between">
              <h2 style={{ fontSize: 20, margin: 0 }}>{p.displayName}</h2>
              {p.autoRenew ? <Badge tone="badge--warn">自動更新あり</Badge> : <Badge>買い切り</Badge>}
            </div>

            <div>
              <div style={{ fontSize: 32, fontWeight: 700 }} className="num">
                {formatJpy(p.amountJpy)}
              </div>
              <div className="small muted">税込{p.autoRenew ? ' / 月' : ''}</div>
            </div>

            <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
              <li>
                <strong className="num">{p.units}</strong> 回の生成（30秒音源）
              </li>
              {p.validityDays ? (
                <li>購入後 {p.validityDays} 日間有効</li>
              ) : (
                <li>各請求期間ごとに {p.units} 回。未使用分の繰り越しはありません</li>
              )}
              <li>
                {p.autoRenew
                  ? '毎月自動更新。いつでもオンラインで停止でき、停止後も当期の終了まで利用できます'
                  : '自動更新はありません'}
              </li>
              <li>試聴・カット・再ダウンロードは無料</li>
              <li>技術的な失敗・供給元の拒否・審査不通過では消費されません</li>
            </ul>

            {p.available ? (
              <button type="button" className="btn btn--primary" onClick={() => choose(p.priceKey)}>
                この内容で進む
              </button>
            ) : (
              <>
                <button type="button" className="btn btn--secondary" disabled>
                  現在受付していません
                </button>
                <p className="small muted" style={{ margin: 0 }}>
                  月額プランは、単発パックでの再購入の実績を確認したうえで公開します。
                </p>
              </>
            )}
          </article>
        ))}
      </div>

      {/* UI-09: what the licence covers is visible BEFORE purchase, not after. */}
      <section className="panel stack">
        <h2 style={{ fontSize: 18, margin: 0 }}>生成した音源の利用条件（購入前にご確認ください）</h2>
        <div className="grid">
          <div className="stack stack--tight">
            <strong className="small">対象として想定している用途</strong>
            <ul className="small muted" style={{ margin: 0, paddingLeft: '1.2em' }}>
              <li>ご自身のSNS向けショート動画のBGM</li>
              <li>上記動画の収益化（供給元との契約で認められた範囲）</li>
            </ul>
          </div>
          <div className="stack stack--tight">
            <strong className="small">今回含まれない用途</strong>
            <ul className="small muted" style={{ margin: 0, paddingLeft: '1.2em' }}>
              <li>ブランド広告・クライアント案件への納品</li>
              <li>楽曲単体の再販売、素材ライブラリへの登録</li>
              <li>Spotify等の音楽配信、Content IDなどの排他的権利主張</li>
            </ul>
          </div>
        </div>
        {runtime && !runtime.features.commercialDeliveryEnabled && (
          <div className="alert alert--warn">
            <div className="alert__title">商用利用の許諾は現在未取得です</div>
            <div className="small">
              供給元との契約が締結されるまで、実際に付与される範囲は動作確認の目的に限られます。
              各楽曲に付与された条件は、生成時点の内容で「利用条件記録」に保存されます。
            </div>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          楽曲ごとの利用条件記録は、当社の利用条件と生成元情報を示すものです。
          著作権登録・権利者証明・独占的所有権・非侵害の保証ではありません。
        </p>
      </section>

      <section className="panel stack">
        <h2 style={{ fontSize: 18, margin: 0 }}>キャンセル・返金について</h2>
        <ul className="small muted" style={{ margin: 0, paddingLeft: '1.2em' }}>
          <li>月額プランは、当期の終了時点で自動更新を停止できます（オンラインで完結します）</li>
          <li>技術的な失敗で消費された回数は返却されます</li>
          <li>誤課金は原状回復のうえ返金します</li>
          <li>未使用かつ購入後7日以内のお申し出については、返金の可否を個別にご案内します</li>
        </ul>
        <p className="small" style={{ margin: 0, color: 'var(--warning)' }}>
          上記の返金の取扱いは検討中の運用方針です。法令に基づく権利を制限するものではありません。
          正式な条件は
          <Link to="/legal/tokushoho">特定商取引法に基づく表記</Link> と
          <Link to="/legal/terms">利用規約</Link> をご確認ください。
        </p>
      </section>
    </div>
  );
}
