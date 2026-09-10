import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ProductView } from '@loopscene/contracts';
import { apiFetch } from '../lib/api';
import { SCENE_LABELS } from '../lib/messages';
import { formatJpy, useSession } from '../lib/session';
import { AudioPlayer, ErrorNotice, Loading } from '../components/common';

interface Sample {
  id: string;
  scene: string;
  title: string;
  durationSeconds: number;
  url: string;
  demo: boolean;
}

/**
 * UI-01: scenes, playable samples, the main create entry point and pricing.
 * A visitor can listen before signing in; signing in is required only when a
 * generation is actually started.
 */
export default function Home() {
  const navigate = useNavigate();
  const { me, runtime } = useSession();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [provenance, setProvenance] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [s, p] = await Promise.all([
          apiFetch<{ items: Sample[]; provenance: string | null }>('/v1/samples'),
          apiFetch<{ items: ProductView[] }>('/v1/products'),
        ]);
        setSamples(s.items);
        setProvenance(s.provenance);
        setProducts(p.items);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Carries the chosen scene into the create page so it is not asked twice. */
  const startWithScene = (scene: string) => {
    const target = `/create?scene=${encodeURIComponent(scene)}`;
    navigate(me ? target : `/auth?next=${encodeURIComponent(target)}`);
  };

  const drop = products.find((p) => p.priceKey === 'drop_5');

  return (
    <div className="stack stack--loose">
      <section className="stack">
        <h1>
          シーンを選ぶ。気分を書く。
          <br />
          30秒のBGMができる。
        </h1>
        <p className="muted" style={{ fontSize: 18, maxWidth: '60ch' }}>
          ショート動画のための、歌詞なし・ボーカルなしのオリジナルBGM。
          試聴してから15秒／30秒に切り出して、そのままダウンロードできます。
        </p>

        {/* UI-01: exactly one primary action on the landing page. */}
        <div className="row">
          <Link className="btn btn--primary" to={me ? '/create' : '/auth?next=%2Fcreate'}>
            サウンドをつくる
          </Link>
          <Link className="btn btn--ghost" to="/pricing">
            料金を見る
          </Link>
        </div>

        {drop && (
          <p className="small muted" style={{ margin: 0 }}>
            {drop.displayName}：{formatJpy(drop.amountJpy)}（税込）で {drop.units} 回。
            {drop.validityDays && `購入後 ${drop.validityDays} 日間有効。`}
            自動更新はありません。
          </p>
        )}
      </section>

      <ErrorNotice error={error} />

      <section className="stack">
        <h2>シーンから選ぶ</h2>
        <div className="scene-grid">
          {Object.entries(SCENE_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="scene-card"
              onClick={() => startWithScene(key)}
            >
              <span className="scene-card__title">{label.title}</span>
              <span className="muted small">{label.description}</span>
              <span className="badge badge--accent" style={{ alignSelf: 'flex-start' }}>
                このシーンでつくる
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>サンプルを聴く</h2>
        {loading ? (
          <Loading />
        ) : samples.length === 0 ? (
          <p className="muted">現在再生できるサンプルはありません。</p>
        ) : (
          <div className="grid">
            {samples.map((s) => (
              <article key={s.id} className="card">
                <div className="row row--between">
                  <strong>{s.title}</strong>
                  <span className="badge">{s.durationSeconds}秒</span>
                </div>
                <AudioPlayer id={`sample-${s.id}`} url={s.url} label={s.title} />
              </article>
            ))}
          </div>
        )}

        {/* UI-01: the samples carry a lawful-source record. */}
        {provenance && (
          <div className="alert alert--info">
            <div className="alert__title">サンプル音源について</div>
            <div className="small">{provenance}</div>
          </div>
        )}
      </section>

      <section className="stack">
        <h2>できること・できないこと</h2>
        <div className="grid">
          <div className="card">
            <strong>できること</strong>
            <ul className="muted small" style={{ margin: 0, paddingLeft: '1.2em' }}>
              <li>シーンと気分から30秒のインストBGMを生成</li>
              <li>スマホでの試聴・15秒／30秒の切り出し・1秒フェードアウト</li>
              <li>MP3のダウンロードと、楽曲ごとの利用条件記録の確認</li>
              <li>作品は自分だけに表示（公開機能はありません）</li>
            </ul>
          </div>
          <div className="card">
            <strong>今回は対応していないこと</strong>
            <ul className="muted small" style={{ margin: 0, paddingLeft: '1.2em' }}>
              <li>歌詞・ボーカル・歌声の再現</li>
              <li>アーティスト名や既存曲を指定した生成</li>
              <li>参考曲・ハミング・音源ファイルのアップロード</li>
              <li>音楽配信（Spotify等）、Content ID登録、楽曲の再販売</li>
            </ul>
          </div>
        </div>
        {runtime && !runtime.features.commercialDeliveryEnabled && (
          <div className="alert alert--warn">
            <div className="alert__title">商用利用の許諾はまだ有効になっていません</div>
            <div className="small">
              現在は動作確認の範囲でご利用ください。利用できる範囲は楽曲ごとの利用条件記録に記載され、
              購入前にも <Link to="/pricing">料金ページ</Link> で確認できます。
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
