"use client";

import { supabase } from "@/lib/supabaseClient";

export type UserPlaylist = {
  id: string;
  name: string;
  created_at: string;
  user_id: string;
};

export function monthStartDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function fetchUserPlaylists(userId: string) {
  const { data, error } = await supabase
    .from("playlists")
    .select("id,name,created_at,user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as UserPlaylist[]) ?? [];
}

export async function fetchUserLikedTrackIds(userId: string) {
  const { data, error } = await supabase
    .from("likes")
    .select("track_id")
    .eq("user_id", userId)
    .eq("month", monthStartDateString());

  if (error) throw error;
  return ((data ?? []) as Array<{ track_id: string }>)
    .map((row) => row.track_id)
    .filter((trackId) => typeof trackId === "string" && trackId.length > 0);
}

export async function likeTrack(userId: string, trackId: string) {
  const { error } = await supabase.from("likes").insert([
    {
      user_id: userId,
      track_id: trackId,
      month: monthStartDateString(),
    },
  ]);

  if (error) throw error;
}

export async function unlikeTrack(userId: string, trackId: string) {
  const { error } = await supabase
    .from("likes")
    .delete()
    .eq("user_id", userId)
    .eq("track_id", trackId)
    .eq("month", monthStartDateString());

  if (error) throw error;
}

export async function addTrackToPlaylist(playlistId: string, trackId: string) {
  const { error } = await supabase.from("playlist_tracks").insert([
    {
      playlist_id: playlistId,
      track_id: trackId,
    },
  ]);

  if (error) throw error;
}

export function broadcastTrackLikeChanged(trackId: string, liked: boolean) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("soundiox:track-like-changed", {
      detail: { trackId, liked },
    })
  );
}
