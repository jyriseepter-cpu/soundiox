"use client";

import { useRef, useState } from "react";
import CustomSelect from "@/app/components/CustomSelect";
import { supabase } from "@/lib/supabaseClient";

const genreOptions = [
  { value: "", label: "Select genre" },
  { value: "Ambient", label: "Ambient" },
  { value: "Classical / Cinematic", label: "Classical / Cinematic" },
  { value: "Dance", label: "Dance" },
  { value: "Electronic", label: "Electronic" },
  { value: "Experimental", label: "Experimental" },
  { value: "Hip-Hop", label: "Hip-Hop" },
  { value: "House", label: "House" },
  { value: "Indie", label: "Indie" },
  { value: "Jazz", label: "Jazz" },
  { value: "Lo-fi", label: "Lo-fi" },
  { value: "Pop", label: "Pop" },
  { value: "R&B", label: "R&B" },
  { value: "Rock", label: "Rock" },
  { value: "Techno", label: "Techno" },
];

function normalizeIsrc(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function isValidIsrc(value: string) {
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value);
}

function generateFallbackIsrc() {
  const year = String(new Date().getFullYear()).slice(-2);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let middle = "";
  let tail = "";

  for (let i = 0; i < 3; i += 1) {
    middle += chars[Math.floor(Math.random() * chars.length)];
  }

  for (let i = 0; i < 7; i += 1) {
    tail += String(Math.floor(Math.random() * 10));
  }

  return `SX${year}${middle}${tail}`;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSelectedFile(file: File | null, fallback: string) {
  if (!file) return fallback;
  const size = formatFileSize(file.size);
  return size ? `${file.name} • ${size}` : file.name;
}

export default function UploadPage() {
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const artInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState("");
  const [isrc, setIsrc] = useState("");
  const [isrcError, setIsrcError] = useState("");
  const [genre, setGenre] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    const normalizedIsrc = normalizeIsrc(isrc);
    const finalIsrc = normalizedIsrc || generateFallbackIsrc();

    if (normalizedIsrc && !isValidIsrc(normalizedIsrc)) {
      setIsrcError("Please enter a valid ISRC, for example USRC17607839.");
      return;
    }

    setIsrcError("");

    if (!title.trim()) {
      alert("Please enter a title.");
      return;
    }
    if (!genre.trim()) {
      alert("Please choose a genre.");
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

      const audioExt = audioFile.name.split(".").pop();
      const artExt = artFile.name.split(".").pop();

      const audioFileName = `${Date.now()}.${audioExt}`;
      const artFileName = `${Date.now()}-art.${artExt}`;

      const { error: audioError } = await supabase.storage
        .from("tracks")
        .upload(audioFileName, audioFile);

      if (audioError) {
        console.error(audioError);
        alert("Audio upload failed");
        return;
      }

      const { error: artError } = await supabase.storage
        .from("art")
        .upload(artFileName, artFile);

      if (artError) {
        console.error(artError);
        alert("Artwork upload failed");
        return;
      }

      const {
        data: { publicUrl: audioUrl },
      } = supabase.storage.from("tracks").getPublicUrl(audioFileName);

      const {
        data: { publicUrl: artworkUrl },
      } = supabase.storage.from("art").getPublicUrl(artFileName);

      const { error: insertError } = await supabase.from("tracks").insert({
        title,
        isrc: finalIsrc,
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

      setTitle("");
      setIsrc("");
      setIsrcError("");
      setGenre("");
      setAudioFile(null);
      setArtFile(null);

      if (audioInputRef.current) audioInputRef.current.value = "";
      if (artInputRef.current) artInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      alert("Unexpected error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07090f] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_36%),rgba(255,255,255,0.04)] shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-6 py-6 sm:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
              Upload
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Release a new SoundioX track
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
              Add your title, choose a genre, upload your audio and artwork, then publish it to
              your profile and the discovery feed.
            </p>
          </div>

          <div className="grid gap-8 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_320px] lg:items-start">
            <section className="min-w-0">
              <div className="space-y-6 rounded-[28px] border border-white/10 bg-white/5 p-5 sm:p-6">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-white/80">
                    Title
                  </label>
                  <input
                    type="text"
                    placeholder="Midnight Radio"
                    className="h-[52px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-white/80">
                    ISRC (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. USRC17607839"
                    className="h-[52px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/40"
                    value={isrc}
                    onChange={(e) => {
                      setIsrc(normalizeIsrc(e.target.value));
                      if (isrcError) {
                        setIsrcError("");
                      }
                    }}
                  />
                  <p className="mt-2 text-xs leading-6 text-white/45">
                    Leave blank to auto-create an internal release code.
                  </p>
                  {isrcError ? (
                    <p className="mt-1 text-sm text-rose-300">{isrcError}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-white/80">
                    Genre
                  </label>
                  <CustomSelect
                    value={genre}
                    onChange={setGenre}
                    options={genreOptions}
                    className="w-full"
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-2 text-sm font-semibold text-white/85">Audio file</div>
                    <p className="mb-4 text-xs leading-6 text-white/50">
                      Upload the master audio file that listeners will hear on SoundioX.
                    </p>

                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    />

                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15"
                    >
                      {audioFile ? "Replace audio file" : "Choose audio file"}
                    </button>

                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                      {formatSelectedFile(audioFile, "No audio file selected")}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-2 text-sm font-semibold text-white/85">Artwork image</div>
                    <p className="mb-4 text-xs leading-6 text-white/50">
                      Add cover art to make the track feel complete in profiles and feeds.
                    </p>

                    <input
                      ref={artInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setArtFile(e.target.files?.[0] || null)}
                    />

                    <button
                      type="button"
                      onClick={() => artInputRef.current?.click()}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-4 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/15"
                    >
                      {artFile ? "Replace artwork image" : "Choose artwork image"}
                    </button>

                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                      {formatSelectedFile(artFile, "No artwork image selected")}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-white/10 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-xl text-xs leading-6 text-white/45">
                    Your upload will publish immediately after the files finish uploading and the
                    track record is saved successfully.
                  </p>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-8 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? "Uploading..." : "Upload track"}
                  </button>
                </div>
              </div>
            </section>

            <aside className="min-w-0">
              <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5 sm:p-6">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-white/45">
                    Checklist
                  </div>
                  <div className="mt-3 space-y-3 text-sm text-white/75">
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      Add a clear track title
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      Pick the closest genre
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      Upload audio and cover art
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4">
                  <div className="text-sm font-semibold text-cyan-100">Ready for release</div>
                  <p className="mt-2 text-xs leading-6 text-cyan-50/80">
                    SoundioX works best with polished artwork, a strong title, and a finished
                    audio file you are ready to publish.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
