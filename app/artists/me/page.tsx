"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import CustomSelect from "@/app/components/CustomSelect";
import { SOUNDIOX_GENRE_OPTIONS, isSoundioXGenre } from "@/lib/genres";

type ProfileRow = {
  id: string;
  display_name: string | null;
  bio: string | null;
  country: string | null;
};

type TrackRow = {
  id: string;
  title: string | null;
  genre: string | null;
  isrc?: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  created_at?: string | null;
  is_published?: boolean | null;
  is_promo?: boolean | null;
};

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function toPublicUrlMaybe(raw: string | null) {
  if (!raw) return null;
  if (isAbsoluteUrl(raw)) return raw;
  return raw;
}

function extractStoragePathFromPublicUrl(url: string | null) {
  if (!url) return null;
  if (!isAbsoluteUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/";
    const idx = parsed.pathname.indexOf(marker);

    if (idx === -1) return null;

    const afterMarker = parsed.pathname.slice(idx + marker.length);
    const slashIndex = afterMarker.indexOf("/");

    if (slashIndex === -1) return null;

    const encodedPath = afterMarker.slice(slashIndex + 1);
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

function getOfficialGenreLabel(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  return isSoundioXGenre(raw) ? raw : "";
}

export default function MyArtistPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");

  const [upTitle, setUpTitle] = useState("");
  const [upGenre, setUpGenre] = useState("");
  const [upAudio, setUpAudio] = useState<File | null>(null);
  const [upArtwork, setUpArtwork] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [copiedIsrcTrackId, setCopiedIsrcTrackId] = useState<string | null>(null);

  const canUpload = useMemo(() => {
    return !!upTitle.trim() && !!upGenre.trim() && !!upAudio && !!userId;
  }, [upTitle, upGenre, upAudio, userId]);

  async function loadAll() {
    setLoading(true);
    setErr(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const uid = userRes?.user?.id ?? null;

    if (userErr || !uid) {
      setUserId(null);
      setProfile(null);
      setTracks([]);
      setErr("You must be logged in to view your artist profile.");
      setLoading(false);
      return;
    }

    setUserId(uid);

    const { data: p, error: pErr } = await supabase
      .from("profiles")
      .select("id,display_name,bio,country")
      .eq("id", uid)
      .maybeSingle();

    if (pErr) {
      setErr(pErr.message);
    } else {
      setProfile((p ?? null) as ProfileRow | null);
      setDisplayName((p?.display_name ?? "").toString());
      setBio((p?.bio ?? "").toString());
      setCountry((p?.country ?? "").toString());
    }

    const { data: t, error: tErr } = await supabase
      .from("tracks")
      .select(
        "id,title,genre,isrc,audio_url,artwork_url,created_at,is_published,is_promo"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (tErr) {
      setErr(tErr.message);
    } else {
      setTracks(((t ?? []) as TrackRow[]) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function saveProfile() {
    if (!userId) return;
    setErr(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        country: country.trim() || null,
      })
      .eq("id", userId);

    if (error) {
      setErr(error.message);
      return;
    }

    await loadAll();
  }

  async function uploadTrack() {
    if (!userId || !canUpload || !upAudio) return;

    setUploading(true);
    setUploadMsg(null);
    setErr(null);

    try {
      if (!isSoundioXGenre(upGenre.trim())) {
        throw new Error("Please select one of the official SoundioX genres.");
      }

      const audioBucket = "tracks";
      const artBucket = "tracks";

      const audioExt = upAudio.name.split(".").pop() || "mp3";
      const audioPath = `audio/${userId}/${Date.now()}-${crypto.randomUUID()}.${audioExt}`;

      const { error: audioUpErr } = await supabase.storage
        .from(audioBucket)
        .upload(audioPath, upAudio, {
          cacheControl: "3600",
          upsert: false,
          contentType: upAudio.type || "audio/mpeg",
        });

      if (audioUpErr) throw new Error(`Audio upload failed: ${audioUpErr.message}`);

      const audioPublic = supabase.storage.from(audioBucket).getPublicUrl(audioPath).data.publicUrl;

      let artworkPublic: string | null = null;

      if (upArtwork) {
        const artExt = upArtwork.name.split(".").pop() || "jpg";
        const artPath = `art/${userId}/${Date.now()}-${crypto.randomUUID()}.${artExt}`;

        const { error: artUpErr } = await supabase.storage
          .from(artBucket)
          .upload(artPath, upArtwork, {
            cacheControl: "3600",
            upsert: false,
            contentType: upArtwork.type || "image/jpeg",
          });

        if (artUpErr) throw new Error(`Artwork upload failed: ${artUpErr.message}`);

        artworkPublic = supabase.storage.from(artBucket).getPublicUrl(artPath).data.publicUrl;
      }

      const { error: insErr } = await supabase.from("tracks").insert({
        title: upTitle.trim(),
        genre: upGenre.trim(),
        audio_url: audioPublic,
        artwork_url: artworkPublic,
        user_id: userId,
        is_published: true,
        is_promo: false,
      });

      if (insErr) throw new Error(`Track insert failed: ${insErr.message}`);

      setUpTitle("");
      setUpGenre("");
      setUpAudio(null);
      setUpArtwork(null);
      setUploadMsg("Uploaded ✅");

      await loadAll();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setErr(message);
    } finally {
      setUploading(false);
    }
  }

  function startEditingTrack(track: TrackRow) {
    setEditingTrackId(track.id);
    setEditTitle((track.title ?? "").toString());
    setErr(null);
    setUploadMsg(null);
  }

  function cancelEditingTrack() {
    setEditingTrackId(null);
    setEditTitle("");
  }

  async function saveTrackTitle(trackId: string) {
    if (!userId) return;
    if (!editTitle.trim()) {
      setErr("Track title cannot be empty.");
      return;
    }

    setSavingTrackId(trackId);
    setErr(null);

    const { error } = await supabase
      .from("tracks")
      .update({ title: editTitle.trim() })
      .eq("id", trackId)
      .eq("user_id", userId);

    if (error) {
      setErr(error.message);
      setSavingTrackId(null);
      return;
    }

    setTracks((prev) =>
      prev.map((track) =>
        track.id === trackId ? { ...track, title: editTitle.trim() } : track
      )
    );

    setEditingTrackId(null);
    setEditTitle("");
    setSavingTrackId(null);
  }

  async function copyIsrc(trackId: string, isrc: string) {
    try {
      await navigator.clipboard.writeText(isrc);
      setCopiedIsrcTrackId(trackId);
      window.setTimeout(() => {
        setCopiedIsrcTrackId((current) => (current === trackId ? null : current));
      }, 1800);
    } catch (error) {
      console.error("isrc copy failed:", error);
    }
  }

  async function deleteTrack(track: TrackRow) {
    if (!userId) return;

    const confirmDelete = window.confirm(
      `Delete "${(track.title ?? "Untitled").toString()}"? This cannot be undone.`
    );

    if (!confirmDelete) return;

    setDeletingTrackId(track.id);
    setErr(null);

    try {
      const audioPath = extractStoragePathFromPublicUrl(track.audio_url);
      const artworkPath = extractStoragePathFromPublicUrl(track.artwork_url);

      const { error: deleteRowError } = await supabase
        .from("tracks")
        .delete()
        .eq("id", track.id)
        .eq("user_id", userId);

      if (deleteRowError) {
        throw new Error(deleteRowError.message);
      }

      if (audioPath) {
        const { error: audioRemoveError } = await supabase.storage
          .from("tracks")
          .remove([audioPath]);

        if (audioRemoveError) {
          console.warn("audio storage delete warning:", audioRemoveError.message);
        }
      }

      if (artworkPath) {
        const { error: artworkRemoveError } = await supabase.storage
          .from("tracks")
          .remove([artworkPath]);

        if (artworkRemoveError) {
          console.warn("artwork storage delete warning:", artworkRemoveError.message);
        }
      }

      setTracks((prev) => prev.filter((item) => item.id !== track.id));

      if (editingTrackId === track.id) {
        cancelEditingTrack();
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Delete failed";
      setErr(message);
    } finally {
      setDeletingTrackId(null);
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-10">
        <div className="mx-auto max-w-6xl text-white/80">Loading…</div>
      </main>
    );
  }

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">My Artist Profile</h1>
            <div className="mt-1 text-sm text-white/60">
              Manage your bio and upload tracks from here.
            </div>
          </div>

          {!userId ? (
            <Link
              href="/login"
              className="rounded-xl bg-white/10 px-5 py-2.5 font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
            >
              Login
            </Link>
          ) : null}
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-sm text-white/80 ring-1 ring-white/10">
            {err}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur">
            <div className="text-white">
              <div className="text-lg font-semibold">Profile</div>
              <div className="text-sm text-white/70">This is what listeners will see.</div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs text-white/60">Display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/20 px-4 py-3 text-white ring-1 ring-white/10 outline-none"
                  placeholder="Artist name"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/20 px-4 py-3 text-white ring-1 ring-white/10 outline-none"
                  placeholder="e.g. Estonia"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-xl bg-black/20 px-4 py-3 text-white ring-1 ring-white/10 outline-none"
                  placeholder="Short bio..."
                />
              </div>

              <button
                onClick={() => void saveProfile()}
                className="rounded-xl bg-white/10 px-5 py-2.5 font-semibold text-white transition ring-1 ring-white/10 hover:bg-white/15"
                disabled={!userId}
              >
                Save Profile
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur">
      <div className="text-white">
        <div className="text-lg font-semibold">Upload new track</div>
        <div className="text-sm text-white/70">Title + Genre are required.</div>
      </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs text-white/60">Title</label>
                <input
                  value={upTitle}
                  onChange={(e) => setUpTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/20 px-4 py-3 text-white ring-1 ring-white/10 outline-none"
                  placeholder="Track title"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">Genre</label>
                <div className="mt-1">
                  <CustomSelect
                    value={upGenre}
                    onChange={setUpGenre}
                    options={SOUNDIOX_GENRE_OPTIONS}
                    className="w-full"
                  />
                </div>
                <div className="mt-2 text-xs text-white/50">
                  Choose one of the official SoundioX genres.
                </div>
              </div>

              <div>
                <label className="text-xs text-white/60">Audio file</label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setUpAudio(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-white/80"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">Artwork (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUpArtwork(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-white/80"
                />
              </div>

              <button
                onClick={() => void uploadTrack()}
                disabled={!canUpload || uploading}
                className="rounded-xl bg-gradient-to-r from-cyan-400 via-sky-500 to-fuchsia-500 px-5 py-2.5 font-semibold text-white transition hover:brightness-110 active:brightness-95 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>

              {uploadMsg ? <div className="text-sm text-white/70">{uploadMsg}</div> : null}

              <div className="text-xs text-white/50">
                Note: bucket names are set to <b>tracks</b> for both audio and artwork.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <div className="text-lg font-semibold">My tracks</div>
              <div className="text-sm text-white/70">
                {tracks.length} track{tracks.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {tracks.length === 0 ? (
              <div className="text-sm text-white/70">No tracks yet. Upload your first one.</div>
            ) : (
              tracks.map((t) => {
                const isEditing = editingTrackId === t.id;
                const isSaving = savingTrackId === t.id;
                const isDeleting = deletingTrackId === t.id;

                return (
                  <div
                    key={t.id}
                    className="rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={toPublicUrlMaybe(t.artwork_url) ?? "/logo-new.png"}
                          alt=""
                          className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
                        />
                        <div className="min-w-0 leading-tight">
                          {isEditing ? (
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 outline-none"
                              placeholder="Track title"
                            />
                          ) : (
                            <div className="truncate text-sm font-semibold text-white">
                              {(t.title ?? "Untitled").toString()}
                            </div>
                          )}

                          <div className="truncate text-xs text-white/70">
                            {(profile?.display_name ?? "Artist").toString()} •{" "}
                            {getOfficialGenreLabel(t.genre) || "—"}
                          </div>
                          {t.isrc ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/55">
                              <span className="font-medium text-white/75">ISRC: {t.isrc}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!t.isrc) return;
                                  void copyIsrc(t.id, t.isrc);
                                }}
                                className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15"
                              >
                                {copiedIsrcTrackId === t.id ? "Copied" : "Copy ISRC"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveTrackTitle(t.id)}
                              disabled={isSaving}
                              className="rounded-xl bg-cyan-400/15 px-3 py-2 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-300/20 transition hover:bg-cyan-400/20 disabled:opacity-60"
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelEditingTrack}
                              disabled={isSaving}
                              className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingTrack(t)}
                              disabled={isDeleting}
                              className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-60"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => void deleteTrack(t)}
                              disabled={isDeleting}
                              className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 ring-1 ring-rose-300/20 transition hover:bg-rose-500/20 disabled:opacity-60"
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>

                            <Link
                              href="/discover"
                              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                            >
                              View
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
