import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatJst } from '../lib/session';
import { ErrorNotice } from '../components/common';

/**
 * SEC-10: the rights-complaint entry point.
 *
 * Deliberately public and free — a rights holder is never asked to create an
 * account or pay in order to raise a claim. The confirmation is explicit that a
 * suspension is not a finding of infringement, and that files already
 * downloaded elsewhere cannot be technically recalled.
 */
export default function Rights() {
  const [form, setForm] = useState({
    trackId: '',
    reporterName: '',
    reporterEmail: '',
    claimType: 'copyright' as 'copyright' | 'neighboring_rights' | 'name_or_voice' | 'other',
    description: '',
  });
  const [result, setResult] = useState<{ caseNumber: string; receivedAt: string; notice: string } | null>(
    null,
  );
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ caseNumber: string; receivedAt: string; notice: string }>(
        '/v1/rights-cases',
        {
          method: 'POST',
          body: {
            ...(form.trackId.trim() ? { trackId: form.trackId.trim() } : {}),
            reporterName: form.reporterName,
            reporterEmail: form.reporterEmail,
            claimType: form.claimType,
            description: form.description,
            evidenceUrls: [],
          },
        },
      );
      setResult(res);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto' }} className="stack stack--loose">
        <h1 style={{ fontSize: 26 }}>お申し立てを受け付けました</h1>
        <section className="panel stack">
          <div className="row row--between">
            <span className="muted">受付番号</span>
            <strong className="num">{result.caseNumber}</strong>
          </div>
          <div className="row row--between">
            <span className="muted">受付日時</span>
            <span>{formatJst(result.receivedAt)}</span>
          </div>
          <hr className="divider" />
          <p className="small" style={{ margin: 0 }}>
            {result.notice}
          </p>
        </section>
        <p className="small muted">
          受付番号は控えてください。進捗の確認や追加資料の送付にご利用いただけます。
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }} className="stack stack--loose">
      <div className="stack stack--tight">
        <h1 style={{ fontSize: 26 }}>権利申立・お問い合わせ</h1>
        <p className="muted">
          権利者の方からのお申し立てを受け付けます。アカウント登録やお支払いは不要です。
        </p>
      </div>

      <div className="alert alert--info">
        <div className="alert__title">お申し立ての取扱いについて</div>
        <ul className="small" style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
          <li>1営業日以内に受領のご連絡をします</li>
          <li>相当の根拠がある場合、確認のあいだ対象楽曲の配布を一時停止します</li>
          <li>一時停止は侵害の認定を意味しません。利用者側にも説明と反論の機会があります</li>
          <li>すでに外部に保存されたファイルを技術的に回収することはできません</li>
        </ul>
      </div>

      <ErrorNotice error={error} />

      <form className="panel stack" onSubmit={submit}>
        <div>
          <label htmlFor="claimType">お申し立ての種類</label>
          <select
            id="claimType"
            value={form.claimType}
            onChange={(e) => setForm({ ...form, claimType: e.target.value as typeof form.claimType })}
          >
            <option value="copyright">著作権（詞・曲）</option>
            <option value="neighboring_rights">著作隣接権（録音・実演）</option>
            <option value="name_or_voice">氏名・声・肖像に関するもの</option>
            <option value="other">その他</option>
          </select>
        </div>

        <div>
          <label htmlFor="reporterName">お名前 / 団体名</label>
          <input
            id="reporterName"
            type="text"
            required
            value={form.reporterName}
            onChange={(e) => setForm({ ...form, reporterName: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="reporterEmail">ご連絡先メールアドレス</label>
          <input
            id="reporterEmail"
            type="email"
            required
            value={form.reporterEmail}
            onChange={(e) => setForm({ ...form, reporterEmail: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="trackId">対象の楽曲ID（分かる場合）</label>
          <input
            id="trackId"
            type="text"
            value={form.trackId}
            onChange={(e) => setForm({ ...form, trackId: e.target.value })}
            placeholder="利用条件記録に記載されているID"
          />
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            分からない場合は空欄で構いません。内容の説明から特定します。
          </p>
        </div>

        <div>
          <label htmlFor="description">お申し立ての内容</label>
          <textarea
            id="description"
            required
            minLength={10}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="対象となる権利、ご自身の権利の根拠、問題と考える点をご記入ください。"
          />
        </div>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? '送信中…' : 'お申し立てを送信する'}
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          ご入力いただいた情報は、お申し立ての調査と連絡のためにのみ利用します。詳しくは
          <Link to="/legal/privacy">プライバシーポリシー</Link> をご覧ください。
        </p>
      </form>

      <section className="panel stack">
        <h2 style={{ fontSize: 18, margin: 0 }}>利用者の方へ</h2>
        <p className="small muted" style={{ margin: 0 }}>
          生成できない・停止されたという通知を受け取った場合も、必ずしも違法性が認定されたわけではありません。
          入力内容の判定に誤りがあると思われる場合や、ご自身のオリジナリティに関する説明がある場合は、
          同じフォームからご連絡ください。
        </p>
      </section>
    </div>
  );
}
