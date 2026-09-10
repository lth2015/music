import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../lib/session';

/**
 * App shell.
 *
 * The mode banner is rendered from the server's runtime descriptor and is part
 * of the document flow, not a dismissible toast — §3.1 requires a demo
 * deployment to say so continuously, and a banner you can close is a banner
 * users stop seeing.
 */
function ModeBanner() {
  const { runtime } = useSession();
  if (!runtime) return null;

  if (runtime.demo) {
    return (
      <div className="mode-banner" role="status">
        <strong>デモモード</strong>：音源は動作確認用の合成音、支払いは擬似処理です。
        実際の課金は発生せず、商用利用の許諾も付与されません。
      </div>
    );
  }
  if (!runtime.features.commercialDeliveryEnabled) {
    return (
      <div className="mode-banner" role="status">
        <strong>プレビュー提供中</strong>：商用利用の許諾は未取得です。
        生成した音源は動作確認の範囲でご利用ください。
      </div>
    );
  }
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  const { me, entitlements, signOut, runtime } = useSession();

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      <ModeBanner />

      <header className="site-header">
        <div className="container container--wide site-header__inner">
          <Link to="/" className="brand">
            LOOPSCENE
          </Link>

          <nav className="nav" aria-label="メインナビゲーション">
            {me ? (
              <>
                <NavLink to="/create">つくる</NavLink>
                <NavLink to="/library">作品</NavLink>
                <NavLink to="/pricing">料金</NavLink>
                <NavLink to="/settings/billing">請求</NavLink>
                {(me.role === 'admin' || me.role === 'support') && <NavLink to="/admin">管理</NavLink>}
                {entitlements && (
                  <span className="badge badge--accent" title="残りの生成回数">
                    残り <span className="num">{entitlements.availableUnits}</span> 回
                  </span>
                )}
                <button type="button" className="btn btn--ghost" onClick={signOut}>
                  ログアウト
                </button>
              </>
            ) : (
              <>
                <NavLink to="/pricing">料金</NavLink>
                <NavLink to="/help/rights">権利について</NavLink>
                <Link to="/auth" className="btn btn--primary">
                  ログイン
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main">
        <div className="container">{children}</div>
      </main>

      <footer className="site-footer">
        <div className="container">
          {/* UI-01: pricing and the legal pages are always reachable from the footer. */}
          <nav aria-label="フッターナビゲーション">
            <Link to="/pricing">料金</Link>
            <Link to="/legal/terms">利用規約</Link>
            <Link to="/legal/privacy">プライバシーポリシー</Link>
            <Link to="/legal/tokushoho">特定商取引法に基づく表記</Link>
            <Link to="/help/rights">権利申立・お問い合わせ</Link>
          </nav>
          <p style={{ margin: 0 }}>
            LOOPSCENE は30秒のインスト（歌詞・ボーカルなし）BGMを生成するサービスです。
            生成物の利用条件は楽曲ごとの「利用条件記録」でご確認ください。
          </p>
          {runtime && (
            <p className="small" style={{ marginTop: 'var(--s1)', marginBottom: 0 }}>
              動作モード: <span className="num">{runtime.mode}</span> / 音楽:{' '}
              <span className="num">{runtime.adapters.music}</span> / 決済:{' '}
              <span className="num">{runtime.adapters.payments}</span>
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
