import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PROMPT_MAX_CODEPOINTS, type JobView } from '@loopscene/contracts';
import { ApiError, apiFetch, newIdempotencyKey } from '../lib/api';
import { JOB_PHASE_LABELS, SCENE_LABELS } from '../lib/messages';
import { useSession } from '../lib/session';
import { ErrorNotice, StageIndicator } from '../components/common';

const DRAFT_KEY = 'loopscene.draft';

interface Draft {
  scene: string;
  prompt: string;
  energy: number;
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/**
 * UI-03 / UI-04: the create studio.
 *
 * Scene, mood text, energy; duration is fixed at 30s and output is instrumental
 * only, both stated rather than offered as choices we cannot honour. The cost
 * of the run and the real remaining balance are shown before submitting, and
 * the draft survives a failed submission so nothing is retyped.
 */
export default function Create() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { entitlements, refreshEntitlements, runtime } = useSession();

  const draft = useMemo(loadDraft, []);
  const [scene, setScene] = useState(params.get('scene') ?? draft?.scene ?? 'night_walk');
  const [prompt, setPrompt] = useState(draft?.prompt ?? '');
  const [energy, setEnergy] = useState(draft?.energy ?? 0.4);
  const [error, setError] = useState<unknown>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * One idempotency key per composed request. It is regenerated only when the
   * user changes the inputs, so every retry of the *same* request reuses it and
   * cannot create a second job or a second charge (GEN-01).
   */
  const idempotencyKey = useRef(newIdempotencyKey());
  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey();
  }, [scene, prompt, energy]);

  // Keep the draft so an interrupted attempt is not lost (UI-04/UI-12).
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ scene, prompt, energy }));
    } catch {
      /* private browsing */
    }
  }, [scene, prompt, energy]);

  // Restore an in-flight job after a reload or re-login (GEN-10).
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ items: JobView[] }>('/v1/jobs');
        if (res.items[0]) setJob(res.items[0]);
      } catch {
        /* not fatal: the form still works */
      }
    })();
  }, []);

  // Status polling with a ceiling, never a long-held request (§4.2).
  useEffect(() => {
    if (!job || ['DELIVERED', 'FAILED', 'REJECTED', 'CANCELLED'].includes(job.state)) return;
    let cancelled = false;
    let delay = 1500;

    const tick = async () => {
      if (cancelled) return;
      try {
        const next = await apiFetch<JobView>(`/v1/jobs/${job.jobId}`);
        if (cancelled) return;
        setJob(next);
        if (next.state === 'DELIVERED') {
          await refreshEntitlements();
          navigate(`/projects/${next.projectId}`);
          return;
        }
        if (['FAILED', 'REJECTED', 'CANCELLED'].includes(next.state)) {
          await refreshEntitlements();
          return;
        }
      } catch {
        /* transient: back off and try again */
      }
      // Back off up to 8s so a long job does not hammer the API.
      delay = Math.min(delay * 1.4, 8000);
      timer = setTimeout(() => void tick(), delay);
    };

    let timer = setTimeout(() => void tick(), delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job, navigate, refreshEntitlements]);

  const promptLength = [...prompt].length;
  const overLimit = promptLength > PROMPT_MAX_CODEPOINTS;
  const available = entitlements?.availableUnits ?? 0;
  const canSubmit = !submitting && !overLimit && available > 0;
  const busy = job !== null && !['DELIVERED', 'FAILED', 'REJECTED', 'CANCELLED'].includes(job.state);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<JobView>('/v1/generations', {
        method: 'POST',
        idempotencyKey: idempotencyKey.current,
        body: { scene, prompt, energy, durationSeconds: 30, vocalMode: 'instrumental' },
      });
      setJob(res);
      await refreshEntitlements();
    } catch (err) {
      setError(err);
      // The draft is intentionally kept so a balance top-up can resume here.
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      const res = await apiFetch<{ cancelled: boolean; state: string; reason: string | null }>(
        `/v1/jobs/${job.jobId}/cancel`,
        { method: 'POST' },
      );
      if (res.cancelled) {
        setJob(null);
        await refreshEntitlements();
      } else {
        // GEN-12: never claim a cancellation that did not happen.
        setError(new ApiError('JOB_NOT_CANCELLABLE', res.reason ?? 'already submitted', 409));
      }
    } catch (err) {
      setError(err);
    }
  };

  if (busy && job) {
    const phase = JOB_PHASE_LABELS[job.phase] ?? JOB_PHASE_LABELS['queued']!;
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }} className="stack stack--loose">
        <h1 style={{ fontSize: 28 }}>{phase.label}</h1>
        <div className="panel stack">
          <p className="muted" style={{ margin: 0 }}>
            {phase.detail}
          </p>
          <StageIndicator phase={job.phase} delayed={job.estimate?.delayed ?? false} />
          <hr className="divider" />
          <div className="row row--between">
            <span className="small muted">
              このページを離れても処理は続きます。作品一覧から戻れます。
            </span>
            <button type="button" className="btn btn--ghost" onClick={() => void cancel()}>
              取り消す
            </button>
          </div>
        </div>
        <ErrorNotice error={error} />
        <Link className="btn btn--secondary" to="/library">
          作品一覧を見る
        </Link>
      </div>
    );
  }

  return (
    <div className="split">
      <form className="stack stack--loose" onSubmit={submit}>
        <div className="stack stack--tight">
          <h1 style={{ fontSize: 30 }}>サウンドをつくる</h1>
          <p className="muted">
            30秒・歌詞なし・ボーカルなしのインストBGMを1曲生成します。
          </p>
        </div>

        <ErrorNotice error={error} />

        {job && ['FAILED', 'REJECTED', 'CANCELLED'].includes(job.state) && (
          <div className="alert alert--warn">
            <div className="alert__title">前回の生成は完了しませんでした</div>
            <div className="small">
              回数は消費されていません。内容を変えてもう一度お試しください。
            </div>
          </div>
        )}

        <fieldset className="stack">
          <legend>シーン</legend>
          <div className="scene-grid">
            {Object.entries(SCENE_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="scene-card"
                aria-pressed={scene === key}
                onClick={() => setScene(key)}
              >
                <span className="scene-card__title">{label.title}</span>
                <span className="muted small">{label.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="prompt">どんな気分にしたいですか？（任意）</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例：静かな夜の帰り道、少し切ない気持ち。シンセとやわらかいドラム。"
            aria-describedby="prompt-help prompt-count"
            aria-invalid={overLimit}
          />
          <div className={`char-count ${overLimit ? 'char-count--over' : ''}`} id="prompt-count">
            <span className="num">{promptLength}</span> / {PROMPT_MAX_CODEPOINTS}
          </div>
          <p id="prompt-help" className="small muted" style={{ margin: 0 }}>
            気分・楽器・テンポの言葉で書いてください。空欄の場合は選んだシーンの雰囲気で作成します。
            アーティスト名・曲名・歌詞の指定はできません。
          </p>
        </div>

        <div>
          <label htmlFor="energy">エネルギー</label>
          <input
            id="energy"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={energy}
            onChange={(e) => setEnergy(Number(e.target.value))}
            aria-valuetext={energy < 0.34 ? '落ち着いた' : energy > 0.66 ? '力強い' : '中間'}
          />
          <div className="row row--between small muted">
            <span>落ち着いた</span>
            <span>力強い</span>
          </div>
        </div>

        <div className="sticky-actions">
          <button type="submit" className="btn btn--primary btn--block" disabled={!canSubmit}>
            {submitting ? '送信中…' : available > 0 ? '1回つかって作成する' : '残り回数がありません'}
          </button>
          {available === 0 && (
            <p className="small" style={{ margin: 'var(--s1) 0 0', textAlign: 'center' }}>
              <Link to="/pricing">料金ページ</Link> から回数を追加してください。入力内容は保存されています。
            </p>
          )}
        </div>
      </form>

      <aside className="stack sticky-side">
        {/* UI-03: consumption and the real remaining balance shown before submitting. */}
        <div className="panel panel--tight stack stack--tight">
          <h2 style={{ fontSize: 17, margin: 0 }}>今回の消費</h2>
          <div className="row row--between">
            <span className="muted">この生成</span>
            <strong className="num">1 回</strong>
          </div>
          <div className="row row--between">
            <span className="muted">現在の残り</span>
            <strong className="num">{available} 回</strong>
          </div>
          <hr className="divider" />
          <ul className="small muted" style={{ margin: 0, paddingLeft: '1.2em' }}>
            <li>1回 = 技術的に正常な30秒音源1つ</li>
            <li>別バージョンが欲しい場合はもう1回消費します</li>
            <li>試聴・カット・再ダウンロードは無料です</li>
            <li>技術的な失敗や審査不通過では消費されません</li>
          </ul>
        </div>

        <div className="panel panel--tight stack stack--tight">
          <h2 style={{ fontSize: 17, margin: 0 }}>この生成の条件</h2>
          <div className="row row--between small">
            <span className="muted">長さ</span>
            <span className="num">30秒（固定）</span>
          </div>
          <div className="row row--between small">
            <span className="muted">形式</span>
            <span>インスト（歌詞・ボーカルなし）</span>
          </div>
          <div className="row row--between small">
            <span className="muted">ダウンロード</span>
            <span>MP3{runtime?.features.wavExportEnabled ? ' / WAV' : ''}</span>
          </div>
          {runtime && !runtime.features.commercialDeliveryEnabled && (
            <p className="small" style={{ margin: 0, color: 'var(--warning)' }}>
              現在は商用利用の許諾が未取得のため、動作確認の範囲でのご利用となります。
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
