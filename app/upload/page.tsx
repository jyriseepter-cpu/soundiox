"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!title.trim()) {
      alert("Please enter a title.");
      return;
    }
    if (!audioFile) {
      alert("Please choose an audio file.");
      return;
    }
    if (!artFile) {
      alert("Please choose an artwork image.");
      return;
    }

    setUploading(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        alert("Please log in first.");
        return;
      }

      const ts = Date.now();
      const safeAudioName = audioFile.name.replace(/\s+/g, "_");
      const safeArtName = artFile.name.replace(/\s+/g, "_");

      const audioPath = `tracks/${user.id}/${ts}-${safeAudioName}`;
      const artPath = `art/${user.id}/${ts}-${safeArtName}`;

      // 1) Upload audio
      const upAudio = await supabase.storage.from("tracks").upload(audioPath, audioFile, {
        upsert: false,
      });
      if (upAudio.error) throw upAudio.error;

      // 2) Upload artwork
      const upArt = await supabase.storage.from("art").upload(artPath, artFile, {
        upsert: false,
      });
      if (upArt.error) throw upArt.error;

      // 3) Public URLs
      const audioUrl = supabase.storage.from("tracks").getPublicUrl(audioPath).data.publicUrl;
      const artworkUrl = supabase.storage.from("art").getPublicUrl(artPath).data.publicUrl;

      // 4) Insert DB row
      const ins = await supabase.from("tracks").insert({
        title: title.trim(),
        genre: genre.trim() || null,
        artist: "AI Artist",
        audio_url: audioUrl,
        artwork_url: artworkUrl,
        user_id: user.id,
        is_published: true,
      });

      if (ins.error) throw ins.error;

      alert("✅ Track uploaded!");
      setTitle("");
      setGenre("");
      setAudioFile(null);
      setArtFile(null);
    } catch (e: any) {
      console.error("Upload failed:", e);
      alert(`Upload failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-6 text-white">
      <h1 className="mb-6 text-2xl font-bold">Upload Track</h1>

      <label className="mb-2 block text-sm text-white/70">Title</label>
      <input
        className="mb-4 w-full rounded-xl bg-white/10 p-3 ring-1 ring-white/10"
        placeholder="Track title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="mb-2 block text-sm text-white/70">Genre</label>
      <input
        className="mb-4 w-full rounded-xl bg-white/10 p-3 ring-1 ring-white/10"
        placeholder="Genre (optional)"
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
      />

      <div className="mb-4">
        <label className="mb-2 block text-sm text-white/70">Audio file (mp3/wav)</label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm text-white/70">Artwork (jpg/png)</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setArtFile(e.target.files?.[0] ?? null)}
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
        Note: Buckets must exist: <b>tracks</b> and <b>art</b> (public).
      </p>
    </main>
  );
}