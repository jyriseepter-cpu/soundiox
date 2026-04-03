"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabaseClient";

export type Track = {
  id: string;
  title?: string | null;
  name?: string | null;
  artist?: string | null;
  genre?: string | null;

  audio_url?: string | null;
  artwork_url?: string | null;

  // legacy/other possible fields
  audioUrl?: string | null;
  url?: string | null;
  file_url?: string | null;
  image_url?: string | null;
  cover_url?: string | null;

  created_at?: string | null;

  [key: string]: any;
};

type PlayerContextValue = {
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  isShuffleEnabled: boolean;

  currentTime: number;
  duration: number;
  seek: (timeSeconds: number) => void;

  playTrack: (track: Track, allTracks?: Track[]) => Promise<void>;
  setTrackOnly: (track: Track, allTracks?: Track[]) => void;

  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  shuffleQueue: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function toAbsoluteUrl(raw: string) {
  const u = (raw || "").toString().trim();
  if (!u) return "";

  if (isAbsoluteUrl(u)) return u;
  if (u.startsWith("/")) return u;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!base) return u;

  return `${base}/storage/v1/object/public/${u}`;
}

function pickAudioSrc(t: Track) {
  const raw =
    (t as any).audio_url ||
    (t as any).audioUrl ||
    (t as any).url ||
    (t as any).file_url ||
    "";

  return toAbsoluteUrl(raw);
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queue, setQueue] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  const incrementPlays = async (trackId: string) => {
    try {
      const { error } = await supabase.rpc("increment_track_plays", {
        track_id_input: trackId,
      });

      if (error) {
        console.error("increment_track_plays error:", error);
      }
    } catch (e) {
      console.error("Increment plays failed:", e);
    }
  };

  const loadTrack = (track: Track) => {
    const a = audioRef.current;
    if (!a) return false;

    const src = pickAudioSrc(track);
    if (!src) return false;

    if (a.src !== src) {
      a.src = src;
    }

    a.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);

    return true;
  };

  const loadAndPlay = async (track: Track) => {
    const a = audioRef.current;
    if (!a) return;

    const src = pickAudioSrc(track);
    if (!src) return;

    const sameSrc = a.src === src;

    if (!sameSrc) {
      a.src = src;
    }

    a.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);

    try {
      await a.play();
    } catch (e) {
      console.error("Audio play failed:", e);
      throw e;
    }
  };

  const goRelative = async (delta: number) => {
    const q = queueRef.current;
    const cur = currentTrackRef.current;

    if (!q || q.length === 0) return;

    const idx =
      cur == null ? -1 : q.findIndex((t) => String(t.id) === String(cur.id));

    let nextIdx = idx >= 0 ? idx + delta : 0;

    if (nextIdx < 0) nextIdx = q.length - 1;
    if (nextIdx >= q.length) nextIdx = 0;

    const nextTrack = q[nextIdx];
    if (!nextTrack) return;

    setCurrentTrack(nextTrack);
    currentTrackRef.current = nextTrack;

    await loadAndPlay(nextTrack);
    void incrementPlays(String(nextTrack.id));
  };

  useEffect(() => {
    if (audioRef.current) return;

    const a = new Audio();
    a.preload = "metadata";
    audioRef.current = a;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(a.currentTime || 0);
    const onLoadedMeta = () => {
      setDuration(Number.isFinite(a.duration) ? a.duration : 0);
      setCurrentTime(a.currentTime || 0);
    };
    const onDurationChange = () => {
      setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    };
    const onEnded = async () => {
      await goRelative(+1);
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("loadedmetadata", onLoadedMeta);
    a.addEventListener("durationchange", onDurationChange);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("loadedmetadata", onLoadedMeta);
      a.removeEventListener("durationchange", onDurationChange);
      a.removeEventListener("ended", onEnded);
      a.pause();
      audioRef.current = null;
    };
  }, []);

  const setTrackOnly = (track: Track, allTracks?: Track[]) => {
    if (Array.isArray(allTracks) && allTracks.length) {
      setQueue(allTracks);
      queueRef.current = allTracks;
      setIsShuffleEnabled(false);
    } else if (!queueRef.current.length) {
      setQueue([track]);
      queueRef.current = [track];
      setIsShuffleEnabled(false);
    }

    setCurrentTrack(track);
    currentTrackRef.current = track;

    loadTrack(track);
  };

  const playTrack = async (track: Track, allTracks?: Track[]) => {
    if (Array.isArray(allTracks) && allTracks.length) {
      setQueue(allTracks);
      queueRef.current = allTracks;
      setIsShuffleEnabled(false);
    } else if (!queueRef.current.length) {
      setQueue([track]);
      queueRef.current = [track];
      setIsShuffleEnabled(false);
    }

    setCurrentTrack(track);
    currentTrackRef.current = track;

    await loadAndPlay(track);
    void incrementPlays(String(track.id));
  };

  const play = async () => {
    const a = audioRef.current;
    if (!a) return;

    if (!currentTrackRef.current && queueRef.current.length > 0) {
      const first = queueRef.current[0];
      setCurrentTrack(first);
      currentTrackRef.current = first;
      loadTrack(first);
    }

    await a.play();
  };

  const pause = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
  };

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;

    if (!currentTrackRef.current && queueRef.current.length > 0) {
      const first = queueRef.current[0];
      setCurrentTrack(first);
      currentTrackRef.current = first;
      loadTrack(first);
    }

    if (a.paused) {
      await a.play();
    } else {
      a.pause();
    }
  };

  const next = async () => {
    await goRelative(+1);
  };

  const prev = async () => {
    await goRelative(-1);
  };

  const shuffleQueue = () => {
    const q = queueRef.current;
    const cur = currentTrackRef.current;

    if (!q.length) return;

    if (isShuffleEnabled) {
      setIsShuffleEnabled(false);
      return;
    }

    const rest = cur
      ? q.filter((track) => String(track.id) !== String(cur.id))
      : [...q];

    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = rest[i];
      rest[i] = rest[j];
      rest[j] = tmp;
    }

    const nextQueue = cur ? [cur, ...rest] : rest;
    setQueue(nextQueue);
    queueRef.current = nextQueue;
    setIsShuffleEnabled(true);
  };

  const seek = (timeSeconds: number) => {
    const a = audioRef.current;
    if (!a) return;

    const dur = Number.isFinite(a.duration) ? a.duration : 0;
    const t = Math.max(0, Math.min(timeSeconds, dur || timeSeconds));
    a.currentTime = t;
    setCurrentTime(t);
  };

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentTrack,
      isPlaying,
      isShuffleEnabled,
      currentTime,
      duration,
      seek,
      playTrack,
      setTrackOnly,
      play,
      pause,
      toggle,
      next,
      prev,
      shuffleQueue,
    }),
    [queue, currentTrack, isPlaying, isShuffleEnabled, currentTime, duration]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return ctx;
}
