import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TrackView } from '@loopscene/contracts';
import { apiFetch } from '../lib/api';
import { MOOD_LABELS, SCENE_LABELS, TRACK_STATE_LABELS } from '../lib/messages';
import { formatJst } from '../lib/session';
import { AudioPlayer, Badge, EmptyState, ErrorNotice, Loading } from '../components/common';

type Filter = 'all' | 'processing' | 'deliverable' | 'suspended';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'すべて' },
  { key: 'processing', label: '処理中' },
  { key: 'deliverable', label: 'ダウンロード可' },
  { key: 'suspended', label: '確認中' },
];

/**
 * UI-08: the private library.
 *
 * Only the signed-in account's tracks are ever returned — this is enforced in
 * the query, not by hiding buttons. Empty, loading and failure states are all
 * handled, and deletion explains its consequences before it happens.
 */
export default function Library() {
  const [tracks, setTracks] = useState<TrackView[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('state', filter);
      if (search.trim()) params.set('q', search.trim());
      const res = await apiFetch<{ items: TrackView[] }>(`/v1/tracks?${params.toString()}`);
      setTracks(res.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const remove = async (track: TrackView) => {
    const ok = window.confirm(
      `「${track.title}」を削除します。\n\n` +
        '・クラウド上の音源と書き出しファイルが削除されます\n' +
        '・再ダウンロードはできなくなります\n' +
        '・購入履歴と注文の記録は残ります\n\n' +
        '削除しますか？',
    );
    if (!ok) return;
    setDeleting(track.trackId);
    setError(null);
    try {
      await apiFetch(`/v1/tracks/${track.trackId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="stack stack--loose">
      <div className="row row--between">
        <h1 style={{ fontSize: 28, margin: 0 }}>作品</h1>
        <Link className="btn btn--primary" to="/create">
          つくる
        </Link>
      </div>

      <div className="stack stack--tight">
        <div className="row" role="group" aria-label="状態で絞り込む">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`btn ${filter === f.key ? 'btn--primary' : 'btn--ghost'}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="search" className="visually-hidden">
            タイトルで検索
          </label>
          <input
            id="search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="タイトルで検索"
          />
        </div>
      </div>

      <ErrorNotice error={error} onRetry={() => void load()} />

      {loading ? (
        <Loading label="作品を読み込み中" />
      ) : tracks.length === 0 ? (
        <EmptyState
          title={search || filter !== 'all' ? '該当する作品がありません' : 'まだ作品がありません'}
          description={
            search || filter !== 'all'
              ? '条件を変えてもう一度お試しください。'
              : 'シーンを選んで、最初の30秒BGMをつくってみましょう。'
          }
          action={
            <Link className="btn btn--primary" to="/create">
              つくる
            </Link>
          }
        />
      ) : (
        <div className="grid">
          {tracks.map((track) => {
            const state = TRACK_STATE_LABELS[track.state] ?? { label: track.state, tone: '' };
            return (
              <article key={track.trackId} className="card">
                <div className="row row--between">
                  <strong>{track.title}</strong>
                  <Badge tone={state.tone}>{state.label}</Badge>
                </div>

                <div className="row small muted">
                  <span>{SCENE_LABELS[track.scene]?.title ?? track.scene}</span>
                  {track.mood && (
                    <>
                      <span>・</span>
                      <span>{MOOD_LABELS[track.mood] ?? track.mood}</span>
                    </>
                  )}
                  <span>・</span>
                  <span>{formatJst(track.createdAt, false)}</span>
                </div>

                <AudioPlayer
                  id={`lib-${track.trackId}`}
                  url={track.previewUrl}
                  label={track.title}
                  compact
                />

                {track.state === 'suspended' && (
                  <p className="small" style={{ margin: 0, color: 'var(--warning)' }}>
                    権利申立の確認中です。確認中は新しいダウンロードリンクを発行できません。
                    停止は侵害の認定を意味しません。
                  </p>
                )}

                <div className="row">
                  {track.state === 'deliverable' && (
                    <Link className="btn btn--secondary" to={`/tracks/${track.trackId}/export`}>
                      カット・DL
                    </Link>
                  )}
                  <Link className="btn btn--ghost" to={`/projects/${track.projectId}`}>
                    プロジェクト
                  </Link>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => void remove(track)}
                    disabled={deleting === track.trackId}
                  >
                    {deleting === track.trackId ? '削除中…' : '削除'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
