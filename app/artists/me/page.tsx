"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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
  audio_url: string | null;
  artwork_url: string | null;
  created_at?: string | null;
  is_published?: boolean | null;
};

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(u);
}

function toPublicUrlMaybe(raw: string | null) {
  if (!raw) return null;
  if (isAbsoluteUrl(raw)) return raw;
  // kui sul on DB-s relative path (nt /art/xx.jpg), jäta nii — browser leiab kui see on public path
  return raw;
}

export default function MyArtistPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // edit profile form
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");

  // upload form
  const [upTitle, setUpTitle] = useState("");
  const [upGenre, setUpGenre] = useState("");
  const [upAudio, setUpAudio] = useState<File | null>(null);
  const [upArtwork, setUpArtwork] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

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

    // load profile
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

    // load my tracks
    const { data: t, error: tErr } = await supabase
      .from("tracks")
      .select("id,title,genre,audio_url,artwork_url,created_at,is_published")
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
      // 1) upload AUDIO
      // Muuda bucket name’i vastavalt: "tracks" / "audio" jne
     const audioBucket = "tracks";
const artBucket = "tracks"; // kasutame sama bucketit

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

      // 2) upload ARTWORK (optional)
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

      // 3) insert TRACK row
      const { error: insErr } = await supabase.from("tracks").insert({
        title: upTitle.trim(),
        genre: upGenre.trim(),
        audio_url: audioPublic,
        artwork_url: artworkPublic,
        user_id: userId,
        is_published: true,
      });

      if (insErr) throw new Error(`Track insert failed: ${insErr.message}`);

      setUpTitle("");
      setUpGenre("");
      setUpAudio(null);
      setUpArtwork(null);
      setUploadMsg("Uploaded ✅");

      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
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
            <div className="mt-1 text-white/60 text-sm">
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

        {/* PROFILE */}
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
                className="rounded-xl px-5 py-2.5 font-semibold text-white transition
                           bg-white/10 ring-1 ring-white/10 hover:bg-white/15"
                disabled={!userId}
              >
                Save Profile
              </button>
            </div>
          </div>

          {/* UPLOAD */}
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
                <input
                  value={upGenre}
                  onChange={(e) => setUpGenre(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-black/20 px-4 py-3 text-white ring-1 ring-white/10 outline-none"
                  placeholder="e.g. Pop / Metal / Electronic..."
                />
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
                className="rounded-xl px-5 py-2.5 font-semibold text-white transition
                           bg-gradient-to-r from-cyan-400 via-sky-500 to-fuchsia-500
                           hover:brightness-110 active:brightness-95 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>

              {uploadMsg ? <div className="text-sm text-white/70">{uploadMsg}</div> : null}

              <div className="text-xs text-white/50">
                Note: bucket names are set to <b>tracks</b> (audio) and <b>artwork</b> (image). If your buckets are different,
                tell me their names and I’ll adjust.
              </div>
            </div>
          </div>
        </div>

        {/* MY TRACKS */}
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
              tracks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={toPublicUrlMaybe(t.artwork_url) ?? "/logo-new.png"}
                      alt=""
                      className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
                    />
                    <div className="leading-tight">
                      <div className="text-sm font-semibold text-white">{(t.title ?? "Untitled").toString()}</div>
                      <div className="text-xs text-white/70">
                        {(profile?.display_name ?? "Artist").toString()} • {(t.genre ?? "—").toString()}
                      </div>
                    </div>
                  </div>

                  <Link
                    href="/discover"
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                  >
                    View
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}