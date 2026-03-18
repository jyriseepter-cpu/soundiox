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

      // 🔥 SAFE FILE NAME (NO SPECIAL CHARS EVER)
      const audioExt = audioFile.name.split(".").pop();
      const artExt = artFile.name.split(".").pop();

      const audioFileName = `${Date.now()}.${audioExt}`;
      const artFileName = `${Date.now()}-art.${artExt}`;

      const audioPath = `tracks/${audioFileName}`;
      const artPath = `art/${artFileName}`;

      // 🔊 Upload audio
      const { error: audioError } = await supabase.storage
        .from("tracks")
        .upload(audioFileName, audioFile);

      if (audioError) {
        console.error(audioError);
        alert("Audio upload failed");
        return;
      }

      // 🖼 Upload artwork
      const { error: artError } = await supabase.storage
        .from("art")
        .upload(artFileName, artFile);

      if (artError) {
        console.error(artError);
        alert("Artwork upload failed");
        return;
      }

      // 🔗 Get public URLs
      const {
        data: { publicUrl: audioUrl },
      } = supabase.storage.from("tracks").getPublicUrl(audioFileName);

      const {
        data: { publicUrl: artworkUrl },
      } = supabase.storage.from("art").getPublicUrl(artFileName);

      // 💾 Insert track
      const { error: insertError } = await supabase.from("tracks").insert({
        title,
        genre,
        audio_url: audioUrl,
        artwork_url: artworkUrl,
        user_id: user.id,
        is_published: true,
      });

      if (insertError) {
        console.error(insertError);
        alert("Database insert failed");
        return;
      }

      alert("Upload successful 🚀");

      // reset
      setTitle("");
      setGenre("");
      setAudioFile(null);
      setArtFile(null);
    } catch (err) {
      console.error(err);
      alert("Unexpected error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl mb-4">Upload Track</h1>

      <input
        type="text"
        placeholder="Title"
        className="mb-3 p-2 bg-black/40 rounded w-full"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        type="text"
        placeholder="Genre"
        className="mb-3 p-2 bg-black/40 rounded w-full"
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
      />

      <input
        type="file"
        accept="audio/*"
        className="mb-3"
        onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
      />

      <input
        type="file"
        accept="image/*"
        className="mb-3"
        onChange={(e) => setArtFile(e.target.files?.[0] || null)}
      />

      <button
        onClick={handleUpload}
        disabled={uploading}
        className="bg-blue-500 px-4 py-2 rounded"
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>
    </div>
  );
}