"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import CustomSelect from "@/app/components/CustomSelect";

const GENRES = [
  "Pop",
  "Rock",
  "Electronic",
  "Hip-Hop / Rap",
  "R&B / Soul",
  "Classical / Cine",
  "Country / Folk",
  "Metal",
];

type ProfileRow = {
  display_name: string | null;
};

function normalizeIsrc(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

export default function UploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [isrc, setIsrc] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accessChecked, setAccessChecked] = useState(false);
  const [canUpload, setCanUpload] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          router.replace("/account");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (profileError) throw profileError;

        if (!active) return;

        setCanUpload(true);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Access check failed.");
        router.replace("/account");
      } finally {
        if (active) {
          setAccessChecked(true);
        }
      }
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, [router]);

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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (profileError) throw profileError;

      const artistName =
        profile?.display_name?.trim() ||
        "AI Artist";
      const normalizedIsrc = normalizeIsrc(isrc);

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

      const audioUrl =
        supabase.storage.from("tracks").getPublicUrl(audioPath).data.publicUrl;

      const artworkUrl =
        supabase.storage.from("art").getPublicUrl(artPath).data.publicUrl;

      const { error: insertError } = await supabase.from("tracks").insert({
        title: title.trim(),
        genre: genre.trim(),
        isrc: normalizedIsrc,
        artist: artistName,
        audio_url: audioUrl,
        artwork_url: artworkUrl,
        user_id: user.id,
        is_published: true,
      });

      if (insertError) throw insertError;

      setMessage("Track uploaded successfully.");
      setTitle("");
      setGenre("");
      setIsrc("");
      setAudioFile(null);
      setArtFile(null);

      const audioInput = document.getElementById(
        "audio-upload"
      ) as HTMLInputElement | null;
      const artInput = document.getElementById(
        "art-upload"
      ) as HTMLInputElement | null;

      if (audioInput) audioInput.value = "";
      if (artInput) artInput.value = "";
    } catch (e: any) {
      console.error("Upload failed:", e);
      setError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (!accessChecked) {
    return (
      <main className="mx-auto max-w-xl px-6 pb-28 pt-8 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <p className="text-sm text-white/70">Checking upload access...</p>
        </div>
      </main>
    );
  }

  if (!canUpload) {
    return (
      <main className="mx-auto max-w-xl px-6 pb-28 pt-8 text-white">
        <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 backdrop-blur-xl">
          <p className="text-sm text-rose-200">
            Please log in to access the upload page.
          </p>
        </div>
      </main>
    );
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
        <div className="mb-4">
          <CustomSelect
            value={genre}
            onChange={setGenre}
            options={[
              { value: "", label: "Choose genre" },
              ...GENRES.map((item) => ({
                value: item,
                label: item,
              })),
            ]}
            className="w-full"
          />
        </div>

        <label className="mb-2 block text-sm text-white/70">ISRC (optional)</label>
        <input
          className="w-full rounded-xl bg-white/10 p-3 text-white ring-1 ring-white/10 outline-none"
          placeholder="EE-ABC-25-00001 or EEABC2500001"
          value={isrc}
          onChange={(e) => setIsrc(e.target.value)}
        />
        <p className="mb-4 mt-2 text-xs text-white/55">
          Optional. Use your own ISRC code for rights management and release continuity.
        </p>

        <div className="mb-4">
          <label className="mb-2 block text-sm text-white/70">
            Audio file (mp3/wav)
          </label>
          <input
            id="audio-upload"
            type="file"
            accept="audio/*"
            onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white/70 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"
          />
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm text-white/70">
            Artwork (jpg/png)
          </label>
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
