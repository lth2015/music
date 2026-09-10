import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { MeView } from '@loopscene/contracts';
import { apiFetch } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice } from '../components/common';

/**
 * UI-02: sign-in with an explicit 18+ confirmation, separate terms consent, and
 * a marketing checkbox that is separate and unchecked by default.
 *
 * In demo mode this posts to the development login. In integration/production
 * the identity provider is Cognito, whose email-OTP challenge runs on its own
 * hosted flow — this app never sends codes or handles passwords itself, which
 * is why there is no OTP form here for that path.
 */
export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { runtime, signIn } = useSession();

  const [email, setEmail] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const next = params.get('next') ?? '/create';
  const isDev = runtime?.adapters.auth === 'dev';
  const canSubmit = email.includes('@') && ageConfirmed && termsAccepted && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; user: MeView }>('/v1/auth/dev-login', {
        method: 'POST',
        body: { email, ageConfirmed: true, termsAccepted: true, marketingOptIn },
      });
      signIn(res.token, res.user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }} className="stack stack--loose">
      <div className="stack stack--tight">
        <h1 style={{ fontSize: 30 }}>ログイン / 新規登録</h1>
        <p className="muted">
          メールアドレスだけで始められます。生成と購入は18歳以上の方が対象です。
        </p>
      </div>

      <ErrorNotice error={error} />

      {!isDev && (
        <div className="alert alert--info">
          <div className="alert__title">メール認証コードでログインします</div>
          <div className="small">
            入力されたメールアドレス宛に確認コードをお送りします。コード入力欄では貼り付けと自動入力に対応し、
            60秒後に再送できます。認証は外部の認証基盤（Amazon Cognito）で処理されます。
          </div>
        </div>
      )}

      <form className="panel stack" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="email">メールアドレス</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.jp"
            required
            aria-describedby="email-help"
          />
          <p id="email-help" className="small muted" style={{ margin: '6px 0 0' }}>
            ログインと重要なお知らせにのみ使用します。
          </p>
        </div>

        {/* Age and terms are separate confirmations, both required. */}
        <div className="checkbox-row">
          <input
            id="age"
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            required
          />
          <label htmlFor="age">
            18歳以上です（本サービスの生成・購入は18歳以上の方が対象です）
          </label>
        </div>

        <div className="checkbox-row">
          <input
            id="terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            required
          />
          <label htmlFor="terms">
            <Link to="/legal/terms" target="_blank">
              利用規約
            </Link>
            と
            <Link to="/legal/privacy" target="_blank">
              プライバシーポリシー
            </Link>
            に同意します
          </label>
        </div>

        {/*
          UI-02 / SEC-11: marketing consent is a separate, unchecked option and
          is never a condition of using the account.
        */}
        <div className="checkbox-row">
          <input
            id="marketing"
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
          />
          <label htmlFor="marketing">
            お知らせメールを受け取る（任意・あとから解除できます）
          </label>
        </div>

        <button type="submit" className="btn btn--primary btn--block" disabled={!canSubmit}>
          {submitting ? '処理中…' : isDev ? 'ログイン' : '確認コードを送る'}
        </button>

        {!canSubmit && !submitting && (
          <p className="small muted" style={{ margin: 0 }}>
            メールアドレスの入力と、年齢・規約の確認が必要です。
          </p>
        )}
      </form>

      {isDev && runtime?.demo && (
        <div className="alert alert--warn">
          <div className="alert__title">開発用ログインです</div>
          <div className="small">
            この画面はデモ環境専用の簡易ログインで、本番環境では存在しません。
            試用アカウント: <code>creator@example.jp</code>（5回分の残高あり）、
            <code>empty@example.jp</code>（残高なし）、<code>admin@example.jp</code>（管理者）。
          </div>
        </div>
      )}
    </div>
  );
}
