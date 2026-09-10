import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatJst, useSession } from '../lib/session';
import { ErrorNotice } from '../components/common';

interface DeletionReceipt {
  ticket: string;
  retained: string[];
  removed: string[];
  note: string;
}

/**
 * SEC-11: account settings.
 *
 * Stopping renewal, unsubscribing from marketing and deleting the account are
 * three separate controls, and deletion states what is retained (and why)
 * before it is requested.
 */
export default function Account() {
  const { me, refreshMe } = useSession();
  const [error, setError] = useState<unknown>(null);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null);

  const toggleMarketing = async (optIn: boolean) => {
    setSavingMarketing(true);
    setError(null);
    try {
      await apiFetch('/v1/me/marketing', { method: 'POST', body: { optIn } });
      await refreshMe();
    } catch (err) {
      setError(err);
    } finally {
      setSavingMarketing(false);
    }
  };

  const requestDeletion = async () => {
    const ok = window.confirm(
      'アカウントの削除をリクエストします。\n\n' +
        'これは「自動更新の停止」や「メール配信停止」とは別の操作です。\n' +
        '本人確認のうえ実行され、取り消せません。\n\n続けますか？',
    );
    if (!ok) return;
    setError(null);
    try {
      setReceipt(await apiFetch<DeletionReceipt>('/v1/me/deletion-request', { method: 'POST', body: {} }));
    } catch (err) {
      setError(err);
    }
  };

  if (!me) return null;

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }} className="stack stack--loose">
      <h1 style={{ fontSize: 26 }}>アカウント設定</h1>

      <ErrorNotice error={error} />

      <section className="panel stack">
        <h2 style={{ fontSize: 18, margin: 0 }}>基本情報</h2>
        <div className="row row--between">
          <span className="muted">メールアドレス</span>
          <span>{me.email}</span>
        </div>
        <div className="row row--between">
          <span className="muted">年齢確認</span>
          <span>{me.ageConfirmed ? '確認済み（18歳以上）' : '未確認'}</span>
        </div>
        <div className="row row--between">
          <span className="muted">登録日</span>
          <span className="small">{formatJst(me.createdAt, false)}</span>
        </div>
      </section>

      <section className="panel stack">
        <h2 style={{ fontSize: 18, margin: 0 }}>お知らせメール</h2>
        <div className="checkbox-row">
          <input
            id="marketing"
            type="checkbox"
            checked={me.marketingOptIn}
            disabled={savingMarketing}
            onChange={(e) => void toggleMarketing(e.target.checked)}
          />
          <label htmlFor="marketing">新機能やキャンペーンのお知らせを受け取る</label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          配信の停止はアカウントの利用に影響しません。ログインや取引に関する重要なご連絡は、
          この設定にかかわらずお送りします。
        </p>
      </section>

      <section className="panel stack">
        <h2 style={{ fontSize: 18, margin: 0 }}>ご契約</h2>
        <p className="small muted" style={{ margin: 0 }}>
          月額プランの自動更新の停止は「請求」ページから行えます。これはアカウントの削除とは別の操作です。
        </p>
        <Link className="btn btn--secondary" to="/settings/billing">
          請求ページを開く
        </Link>
      </section>

      <section className="panel stack">
        <h2 style={{ fontSize: 18, margin: 0 }}>アカウントの削除</h2>

        {receipt ? (
          <div className="alert alert--info">
            <div className="alert__title">
              削除リクエストを受け付けました（受付番号: {receipt.ticket.slice(0, 8)}）
            </div>
            <div className="small stack stack--tight" style={{ marginTop: 'var(--s1)' }}>
              <div>
                <strong>削除されるもの</strong>
                <ul style={{ margin: '4px 0', paddingLeft: '1.2em' }}>
                  {receipt.removed.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>保管が続くもの</strong>
                <ul style={{ margin: '4px 0', paddingLeft: '1.2em' }}>
                  {receipt.retained.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <p style={{ margin: 0 }}>{receipt.note}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              アカウント、生成した楽曲、書き出しファイルが削除されます。
              法令上の保存義務がある取引記録と、権利申立で係争中の資料は、必要な範囲で分離して保管されます。
              保管の範囲と期間は
              <Link to="/legal/privacy">プライバシーポリシー</Link> に記載しています。
            </p>
            <button type="button" className="btn btn--danger" onClick={() => void requestDeletion()}>
              アカウントの削除をリクエストする
            </button>
          </>
        )}
      </section>
    </div>
  );
}
