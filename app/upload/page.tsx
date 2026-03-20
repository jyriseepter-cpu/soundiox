"use client";

import { useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
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

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

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

function formatSupabaseError(error: SupabaseErrorLike) {
  const parts = [
    error.code ? `code=${error.code}` : null,
    error.message ? `message=${error.message}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ].filter(Boolean);

  return parts.join(" | ");
}

function sanitizeBaseName(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function shouldCompressToMp3(file: File) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  return (
    type.includes("wav") ||
    type.includes("wave") ||
    type.includes("aiff") ||
    type.includes("flac") ||
    name.endsWith(".wav") ||
    name.endsWith(".wave") ||
    name.endsWith(".aif") ||
    name.endsWith(".aiff") ||
    name.endsWith(".flac")
  );
}

function toArrayBuffer(
  data: Uint8Array | ArrayBuffer | string
): ArrayBuffer {
  if (data instanceof Uint8Array) {
    return data.slice().buffer;
  }

  if (data instanceof ArrayBuffer) {
    return data.slice(0);
  }

  return new TextEncoder().encode(data).buffer;
}

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let currentTextSetter: ((value: string) => void) | null = null;
let currentProgressSetter: ((value: number | null) => void) | null = null;

async function getFfmpeg(setProcessingText?: (value: string) => void) {
  if (ffmpegSingleton) {
    currentTextSetter = setProcessingText ?? null;
    return ffmpegSingleton;
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpeg = new FFmpeg();

      ffmpeg.on("log", ({ message }) => {
        if (message && currentTextSetter) {
          currentTextSetter(message);
        }
      });

      ffmpeg.on("progress", ({ progress }) => {
        if (!currentProgressSetter) return;
        const percent = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));
        currentProgressSetter(percent);
        if (currentTextSetter) {
          currentTextSetter(`Compressing audio... ${percent}%`);
        }
      });

      const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      ffmpegSingleton = ffmpeg;
      return ffmpeg;
    })();
  }

  currentTextSetter = setProcessingText ?? null;
  return ffmpegLoadPromise;
}

async function compressAudioToMp3(
  inputFile: File,
  setProcessingText: (value: string) => void,
  setProcessingProgress: (value: number | null) => void
) {
  currentTextSetter = setProcessingText;
  currentProgressSetter = setProcessingProgress;

  const ffmpeg = await getFfmpeg(setProcessingText);

  const safeBaseName = sanitizeBaseName(inputFile.name) || "track";
  const inputExt = inputFile.name.split(".").pop()?.toLowerCase() || "wav";
  const inputName = `input.${inputExt}`;
  const outputName = `${safeBaseName}.mp3`;

  setProcessingText("Preparing audio engine...");
  setProcessingProgress(0);

  await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

  setProcessingText("Converting to MP3 192 kbps...");

  await ffmpeg.exec([
    "-i",
    inputName,
    "-vn",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-b:a",
    "192k",
    outputName,
  ]);

  const outputData = await ffmpeg.readFile(outputName);
  const outputBuffer = toArrayBuffer(outputData);

  try {
    await ffmpeg.deleteFile(inputName);
  } catch {}

  try {
    await ffmpeg.deleteFile(outputName);
  } catch {}

  setProcessingProgress(100);
  setProcessingText("Compression finished.");

  currentProgressSetter = null;

  return new File([outputBuffer], outputName, {
    type: "audio/mpeg",
    lastModified: Date.now(),
  });
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
  const [processingAudio, setProcessingAudio] = useState(false);
  const [processingText, setProcessingText] = useState("");
  const [processingProgress, setProcessingProgress] = useState<number | null>(null);

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
    setProcessingAudio(false);
    setProcessingText("");
    setProcessingProgress(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        alert("Please log in first.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle<{ display_name: string | null }>();

      if (profileError) {
        console.warn("profile lookup warning before track insert:", profileError);
      }

      const emailFallback =
        typeof user.email === "string" && user.email.includes("@")
          ? user.email.split("@")[0]
          : null;

      const artistName =
        profile?.display_name?.trim() || emailFallback || `artist-${user.id.slice(0, 8)}`;

      let uploadAudioFile = audioFile;

      if (shouldCompressToMp3(audioFile)) {
        setProcessingAudio(true);
        setProcessingText("Preparing audio compression...");
        uploadAudioFile = await compressAudioToMp3(
          audioFile,
          setProcessingText,
          setProcessingProgress
        );
      }

      const audioExt = uploadAudioFile.name.split(".").pop()?.toLowerCase() || "mp3";
      const artExt = artFile.name.split(".").pop()?.toLowerCase() || "jpg";

      const timestamp = Date.now();
      const audioFileName = `${timestamp}.${audioExt}`;
      const artFileName = `${timestamp}-art.${artExt}`;

      const { error: audioError } = await supabase.storage
        .from("tracks")
        .upload(audioFileName, uploadAudioFile, {
          contentType: uploadAudioFile.type || "audio/mpeg",
          upsert: false,
        });

      if (audioError) {
        const formattedAudioError = formatSupabaseError(audioError);
        console.error("audio upload error:", audioError);
        alert(`Audio upload failed: ${formattedAudioError || "Unknown storage error."}`);
        return;
      }

      const { error: artError } = await supabase.storage
        .from("art")
        .upload(artFileName, artFile, {
          contentType: artFile.type || "image/jpeg",
          upsert: false,
        });

      if (artError) {
        const formattedArtError = formatSupabaseError(artError);
        console.error("artwork upload error:", artError);
        alert(`Artwork upload failed: ${formattedArtError || "Unknown storage error."}`);
        return;
      }

      const {
        data: { publicUrl: audioUrl },
      } = supabase.storage.from("tracks").getPublicUrl(audioFileName);

      const {
        data: { publicUrl: artworkUrl },
      } = supabase.storage.from("art").getPublicUrl(artFileName);

      const insertPayload = {
        title: title.trim(),
        artist: artistName,
        isrc: finalIsrc,
        genre: genre.trim(),
        audio_url: audioUrl,
        artwork_url: artworkUrl,
        user_id: user.id,
        is_published: true,
        plays_all_time: 0,
        plays_this_month: 0,
      };

      const { error: insertError } = await supabase.from("tracks").insert(insertPayload);

      if (insertError) {
        const formattedInsertError = formatSupabaseError(insertError);
        console.error("tracks insert error:", insertError);
        alert(
          `Database insert failed: ${
            formattedInsertError || "Unknown Supabase error. This may be an RLS policy issue."
          }`
        );
        return;
      }

      alert("Upload successful 🚀");

      setTitle("");
      setIsrc("");
      setIsrcError("");
      setGenre("");
      setAudioFile(null);
      setArtFile(null);
      setProcessingAudio(false);
      setProcessingText("");
      setProcessingProgress(null);

      if (audioInputRef.current) audioInputRef.current.value = "";
      if (artInputRef.current) artInputRef.current.value = "";
    } catch (err: unknown) {
      console.error("unexpected upload error:", err);
      const message = err instanceof Error ? err.message : String(err);
      alert(`Unexpected error: ${message}`);
    } finally {
      setUploading(false);
      setProcessingAudio(false);
      currentProgressSetter = null;
      currentTextSetter = null;
    }
  }

  const actionLabel = processingAudio
    ? "Processing audio..."
    : uploading
      ? "Uploading..."
      : "Upload track";

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
                  <label className="mb-2 block text-sm font-semibold text-white/80">Title</label>
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
                  {isrcError ? <p className="mt-1 text-sm text-rose-300">{isrcError}</p> : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-white/80">Genre</label>
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
                      WAV, AIFF and FLAC files are compressed to MP3 automatically before upload.
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
                      className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15"
                    >
                      {audioFile ? "Replace audio file" : "Choose audio file"}
                    </button>

                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                      {formatSelectedFile(audioFile, "No audio file selected")}
                    </div>

                    {processingAudio ? (
                      <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                          Background processing
                        </div>
                        <div className="mt-2 text-sm text-cyan-50/90">
                          {processingText || "Compressing audio..."}
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-all"
                            style={{ width: `${processingProgress ?? 8}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-cyan-50/70">
                          {processingProgress !== null
                            ? `${processingProgress}%`
                            : "Preparing encoder..."}
                        </div>
                      </div>
                    ) : null}
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
                      className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-4 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/15"
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
                    Large lossless audio files can take extra time because SoundioX now compresses
                    them before upload.
                  </p>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-8 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLabel}
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