"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const GENRES = [
  "Pop",
  "Rock",
  "Electronic",
  "Hip-Hop / Rap",
  "R&B / Soul",
  "Classical / Cine",
  "Country / Folk",
  "Metal",
  "Ambient",
  "House",
  "Techno",
  "Drum & Bass",
  "Lo-fi",
  "Jazz",
  "Other",
];

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleUpload() {
    setMessage("");
    setError("");

    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }

    if (!genre.trim()) {
      setError("Please choose a genre.");
      return;
    }

    if (!audioFile) {
      setError("Please choose an audio file.");
      return;
    }

    if (!artFile) {
      setError("Please choose an artwork image.");
      return;
    }

    setUploading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setError("Please log in first.");
        return;
      }

      const ts = Date.now();
      const safeAudioName = audioFile.name.replace(/\s+/g, "_");
      const safeArtName = artFile.name.replace(/\s+/g, "_");

      const audioPath = `${user.id}/${ts}-${safeAudioName}`;
      const artPath = `${user.id}/${ts}-${safeArtName}`;

      const { error: upAudioError } = await supabase.storage
        .from("tracks")
        .upload(audioPath, audioFile, {
          upsert: false,
        });

      if (upAudioError) throw upAudioError;

      const { error: upArtError } = await supabase.storage
        .from("art")
        .upload(artPath, artFile, {
          upsert: false,
        });

      if (upArtError) throw upArtError;

      const audioUrl = supabase.storage.from("tracks").getPublicUrl(audioPath).data.publicUrl;
      const artworkUrl = supabase.storage.from("art").getPublicUrl(artPath).data.publicUrl;

      const displayArtist =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "AI Artist";

      const { error: insertError } = await supabase.from("tracks").insert({
        title: title.trim(),
        genre: genre.trim(),
        artist: displayArtist,
        audio_url: audioUrl,
        artwork_url: artworkUrl,
        user_id: user.id,
        is_published: true,
      });

      if (insertError) throw insertError;

      setMessage("Track uploaded successfully.");
      setTitle("");
      setGenre("");
      setAudioFile(null);
      setArtFile(null);

      const audioInput = document.getElementById("audio-upload") as HTMLInputElement | null;
      const artInput = document.getElementById("art-upload") as HTMLInputElement | null;

      if (audioInput) audioInput.value = "";
      if (artInput) artInput.value = "";
    } catch (e: any) {
      console.error("Upload failed:", e);
      setError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 pb-28 pt-8 text-white">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <h1 className="mb-2 text-2xl font-bold">Upload Track</h1>
        <p className="mb-6 text-sm text-white/60">
          Every track must have its own genre so it can appear correctly in charts,
          playlists and search.
        </p>

        {message ? (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <label className="mb-2 block text-sm text-white/70">Title</label>
        <input
          className="mb-4 w-full rounded-xl bg-white/10 p-3 text-white ring-1 ring-white/10 outline-none"
          placeholder="Track title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="mb-2 block text-sm text-white/70">Genre</label>
        <select
          className="mb-4 w-full rounded-xl bg-white/10 p-3 text-white ring-1 ring-white/10 outline-none"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        >
          <option value="">Choose genre</option>
          {GENRES.map((item) => (
            <option key={item} value={item} className="bg-[#10131c] text-white">
              {item}
            </option>
          ))}
        </select>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-white/70">Audio file (mp3/wav)</label>
          <input
            id="audio-upload"
            type="file"
            accept="audio/*"
            onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white/70 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"
          />
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm text-white/70">Artwork (jpg/png)</label>
          <input
            id="art-upload"
            type="file"
            accept="image/*"
            onChange={(e) => setArtFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white/70 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-6 py-3 font-semibold text-white ring-1 ring-white/10 disabled:opacity-60"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>

        <p className="mt-4 text-xs text-white/60">
          Buckets must exist and be public: <b>tracks</b>, <b>art</b>, <b>avatars</b>.
        </p>
      </div>
    </main>
  );
}