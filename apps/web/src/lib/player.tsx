import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A single shared <audio> element.
 *
 * UI-01 and UI-05 require that only one track ever plays at a time. Rather than
 * asking every player component to remember to stop its siblings, there is
 * exactly one audio element for the whole app, so starting a new track
 * inherently stops the previous one. Nothing here ever autoplays (UI-14) —
 * playback only starts from a user gesture.
 */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface PlayerState {
  /** Identifies what is loaded, so each card knows whether it is the active one. */
  activeId: string | null;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
}

interface PlayerApi extends PlayerState {
  toggle(id: string, url: string): void;
  seek(seconds: number): void;
  stop(): void;
  /** Fires once per track when 10s of audio has actually been heard (§11.1). */
  onTenSeconds(handler: (id: string) => void): () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listeners = useRef(new Set<(id: string) => void>());
  const reported = useRef(new Set<string>());
  const [state, setState] = useState<PlayerState>({
    activeId: null,
    status: 'idle',
    currentTime: 0,
    duration: 0,
  });

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
      // The activation metric counts real listening, not a click on play.
      const id = audio.dataset['trackId'];
      if (id && audio.currentTime >= 10 && !reported.current.has(id)) {
        reported.current.add(id);
        for (const l of listeners.current) l(id);
      }
    };
    const onLoaded = () => setState((s) => ({ ...s, duration: audio.duration || 0 }));
    const onPlay = () => setState((s) => ({ ...s, status: 'playing' }));
    const onPause = () => setState((s) => (s.status === 'playing' ? { ...s, status: 'paused' } : s));
    const onEnded = () => setState((s) => ({ ...s, status: 'paused', currentTime: 0 }));
    const onWaiting = () => setState((s) => ({ ...s, status: 'loading' }));
    const onError = () => setState((s) => ({ ...s, status: 'error' }));

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', onError);
      audio.pause();
    };
  }, []);

  const toggle = useCallback((id: string, url: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.activeId === id) {
      if (audio.paused) void audio.play().catch(() => setState((s) => ({ ...s, status: 'error' })));
      else audio.pause();
      return;
    }

    // Switching tracks: loading a new source stops whatever was playing.
    audio.pause();
    audio.src = url;
    audio.dataset['trackId'] = id;
    audio.currentTime = 0;
    setState({ activeId: id, status: 'loading', currentTime: 0, duration: 0 });
    void audio.play().catch(() => setState((s) => ({ ...s, status: 'error' })));
  }, [state.activeId]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || Number.isNaN(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setState({ activeId: null, status: 'idle', currentTime: 0, duration: 0 });
  }, []);

  const onTenSeconds = useCallback((handler: (id: string) => void) => {
    listeners.current.add(handler);
    return () => listeners.current.delete(handler);
  }, []);

  const api = useMemo<PlayerApi>(
    () => ({ ...state, toggle, seek, stop, onTenSeconds }),
    [state, toggle, seek, stop, onTenSeconds],
  );

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside a PlayerProvider');
  return ctx;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
