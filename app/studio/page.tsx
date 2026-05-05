"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type StudioJob = {
  id: string;
  title: string | null;
  prompt: string | null;
  style: string | null;
  mood: string | null;
  lyrics: string | null;
  vocal_mode: string | null;
  artwork_prompt: string | null;
  provider: string;
  status: string;
  audio_url: string | null;
  vocal_url?: string | null;
  artwork_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRecord = {
  id: string;
  label: string;
  job: StudioJob;
};

type ProducerSuggestion = {
  improved_prompt: string;
  style: string;
  mood: string;
  structure: string;
  lyrics: string;
};

type VoiceOption = "male" | "female";
type PlaybackMode = "music" | "with-vocals";

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/35 focus:border-black/25";
const buttonClass =
  "inline-flex min-w-[140px] items-center justify-center rounded-full border border-black/10 bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50";

async function getAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message || "Failed to read session");
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Please log in to use Studio");
  }

  return accessToken;
}

export default function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [mood, setMood] = useState("");
  const [structure, setStructure] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [addAiVocals, setAddAiVocals] = useState(false);
  const [voiceOption, setVoiceOption] = useState<VoiceOption>("male");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<StudioJob | null>(null);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingVariation, setLoadingVariation] = useState(false);
  const [loadingImprove, setLoadingImprove] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [producerSuggestion, setProducerSuggestion] = useState<ProducerSuggestion | null>(null);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("music");
  const [layerPlaying, setLayerPlaying] = useState(false);
  const musicLayerRef = useRef<HTMLAudioElement | null>(null);
  const vocalLayerRef = useRef<HTMLAudioElement | null>(null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  );

  const activeJob = selectedVersion?.job ?? job;
  const vocalsAvailable = Boolean(activeJob?.vocal_url);
  const vocalsEnabledForJob = addAiVocals && Boolean(lyrics.trim());
  const isGenerationBusy = loadingGenerate || loadingVariation;

  const statusText = useMemo(() => {
    if (loadingGenerate) return "running";
    if (loadingVariation) return "running";
    if (activeJob?.status) return activeJob.status;
    if (jobId) return "queued";
    return "idle";
  }, [activeJob?.status, jobId, loadingGenerate, loadingVariation]);

  useEffect(() => {
    if (lyrics.trim()) return;
    setAddAiVocals(false);
    setPlaybackMode("music");
  }, [lyrics]);

  useEffect(() => {
    setLayerPlaying(false);
    setPlaybackMode((current) =>
      current === "with-vocals" && !vocalsAvailable ? "music" : current
    );
  }, [activeJob?.audio_url, activeJob?.vocal_url, vocalsAvailable]);

  useEffect(() => {
    const music = musicLayerRef.current;
    const vocal = vocalLayerRef.current;

    if (!music || !vocal) return;

    const handleEnded = () => setLayerPlaying(false);
    music.addEventListener("ended", handleEnded);

    return () => {
      music.removeEventListener("ended", handleEnded);
    };
  }, [activeJob?.audio_url, activeJob?.vocal_url]);

  function composeGenerationPrompt(basePrompt: string, baseStructure: string, variationHint?: string) {
    return [
      basePrompt.trim(),
      baseStructure.trim() ? `Structure: ${baseStructure.trim()}` : "",
      variationHint ? `Variation: ${variationHint}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function createStudioJob(options?: { variationHint?: string }) {
    const accessToken = await getAccessToken();
    const title = prompt.trim().split("\n")[0]?.slice(0, 80) || "Studio draft";
    const generationPrompt = composeGenerationPrompt(
      prompt,
      structure,
      options?.variationHint
    );

    const response = await fetch("/api/studio/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title,
        prompt: generationPrompt,
        style,
        mood,
        lyrics,
        vocalMode: vocalsEnabledForJob ? voiceOption : "",
        provider: "runpod",
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setErrorDetails(String(payload?.rawPreview || ""));
      throw new Error(payload?.error || "Failed to create studio job");
    }

    return String(payload?.id || "");
  }

  function upsertVersion(nextJob: StudioJob) {
    setVersions((current) => {
      const existingIndex = current.findIndex((version) => version.id === nextJob.id);

      if (existingIndex >= 0) {
        return current.map((version) =>
          version.id === nextJob.id ? { ...version, job: nextJob } : version
        );
      }

      const nextNumber = current.length + 1;
      return [
        ...current,
        {
          id: nextJob.id,
          label: `Version ${nextNumber}`,
          job: nextJob,
        },
      ];
    });

    setSelectedVersionId(nextJob.id);
  }

  async function generateExistingJob(targetJobId: string) {
    const accessToken = await getAccessToken();
    const response = await fetch(`/api/studio/jobs/${targetJobId}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = await response.json().catch(() => null);
    const returnedJob = (payload?.job ?? null) as StudioJob | null;

    if (returnedJob) {
      setJob(returnedJob);
      upsertVersion(returnedJob);
    }

    if (!response.ok) {
      setErrorDetails(String(payload?.rawPreview || ""));
      throw new Error(returnedJob?.error || payload?.error || "Generation failed");
    }

    return returnedJob;
  }

  async function handleCreateJob() {
    try {
      setLoadingCreate(true);
      setError("");
      setErrorDetails("");

      const createdJobId = await createStudioJob();
      setJobId(createdJobId);
      setJob(null);
      setSelectedVersionId("");
    } catch (err: any) {
      setError(err?.message || "Failed to create studio job");
    } finally {
      setLoadingCreate(false);
    }
  }

  async function handleGenerate() {
    try {
      if (!jobId) {
        throw new Error("Create a job first");
      }

      setLoadingGenerate(true);
      setError("");
      setErrorDetails("");
      await generateExistingJob(jobId);
    } catch (err: any) {
      setError(err?.message || "Generation failed");
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function handleGenerateVariation() {
    try {
      if (!jobId && !prompt.trim()) {
        throw new Error("Create a base job first");
      }

      setLoadingVariation(true);
      setError("");
      setErrorDetails("");

      const variationJobId = await createStudioJob({
        variationHint: "slightly different melody, variation",
      });

      await generateExistingJob(variationJobId);
    } catch (err: any) {
      setError(err?.message || "Variation failed");
    } finally {
      setLoadingVariation(false);
    }
  }

  async function handleImprovePrompt() {
    try {
      if (!prompt.trim()) {
        throw new Error("Write a rough prompt first");
      }

      setLoadingImprove(true);
      setError("");
      setErrorDetails("");

      const response = await fetch("/api/studio/producer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to improve prompt");
      }

      const suggestion = payload as ProducerSuggestion;
      setProducerSuggestion(suggestion);
      setAiSuggestion(
        [
          suggestion.improved_prompt,
          suggestion.style ? `Style: ${suggestion.style}` : "",
          suggestion.mood ? `Mood: ${suggestion.mood}` : "",
          suggestion.structure ? `Structure: ${suggestion.structure}` : "",
          suggestion.lyrics ? `Lyrics:\n${suggestion.lyrics}` : "Lyrics: instrumental",
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch (err: any) {
      setError(err?.message || "Failed to improve prompt");
    } finally {
      setLoadingImprove(false);
    }
  }

  function handleUseImprovedPrompt() {
    if (!producerSuggestion) return;

    setPrompt(producerSuggestion.improved_prompt);
    if (producerSuggestion.style) setStyle(producerSuggestion.style);
    if (producerSuggestion.mood) setMood(producerSuggestion.mood);
    setStructure(producerSuggestion.structure || "");
    setLyrics(producerSuggestion.lyrics || "");
  }

  async function handleToggleLayerPlayback() {
    const music = musicLayerRef.current;
    const vocal = vocalLayerRef.current;

    if (!music || !vocal || !activeJob?.audio_url || !activeJob?.vocal_url) return;

    if (layerPlaying) {
      music.pause();
      vocal.pause();
      setLayerPlaying(false);
      return;
    }

    music.currentTime = 0;
    vocal.currentTime = 0;
    await Promise.all([music.play(), vocal.play()]);
    setLayerPlaying(true);
  }

  return (
    <main className="min-h-screen bg-[#f6f6f2] px-6 py-10 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-black/45">
            SoundioX Studio
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Generation test loop</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
            Create a private generation job, run it, and listen to the returned audio result.
          </p>
        </div>

        <div className="space-y-6 rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
          <div>
            <label className="mb-2 block text-sm font-medium text-black">Prompt</label>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the track you want to generate..."
              className={`${inputClass} min-h-[220px] resize-y`}
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <label className="block text-sm font-medium text-black">AI suggestion</label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleImprovePrompt()}
                  disabled={loadingImprove}
                  className={buttonClass}
                >
                  {loadingImprove ? "Improving..." : "Improve prompt"}
                </button>
                <button
                  type="button"
                  onClick={handleUseImprovedPrompt}
                  disabled={!producerSuggestion}
                  className={buttonClass}
                >
                  Use improved prompt
                </button>
              </div>
            </div>
            <textarea
              value={aiSuggestion}
              onChange={(event) => setAiSuggestion(event.target.value)}
              placeholder="AI suggestion will appear here..."
              className={`${inputClass} min-h-[120px] resize-y`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black">Style</label>
              <input
                value={style}
                onChange={(event) => setStyle(event.target.value)}
                placeholder="e.g. synth-pop, melodic house"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black">Mood</label>
              <input
                value={mood}
                onChange={(event) => setMood(event.target.value)}
                placeholder="e.g. emotional, cinematic"
                className={inputClass}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-black/8 bg-[#fafaf7] px-4 py-4">
            <label className="flex items-center gap-3 text-sm font-medium text-black">
              <input
                type="checkbox"
                checked={addAiVocals}
                onChange={(event) => setAddAiVocals(event.target.checked)}
                disabled={!lyrics.trim()}
              />
              Add AI vocals
            </label>

            {addAiVocals ? (
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium text-black">Voice</label>
                <select
                  value={voiceOption}
                  onChange={(event) => setVoiceOption(event.target.value as VoiceOption)}
                  className={inputClass}
                >
                  <option value="male">Male voice</option>
                  <option value="female">Female voice</option>
                </select>
              </div>
            ) : null}

            {!lyrics.trim() ? (
              <div className="mt-3 text-sm text-black/55">
                Add lyrics first to enable AI vocals.
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black">Structure</label>
              <input
                value={structure}
                onChange={(event) => setStructure(event.target.value)}
                placeholder="e.g. Intro - Verse - Chorus - Drop - Outro"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black">Lyrics</label>
              <textarea
                value={lyrics}
                onChange={(event) => setLyrics(event.target.value)}
                placeholder="Lyrics will appear here if the prompt suggests vocals..."
                className={`${inputClass} min-h-[120px] resize-y`}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleCreateJob()}
              disabled={loadingCreate}
              className={buttonClass}
            >
              {loadingCreate ? "Creating..." : "Create job"}
            </button>

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerationBusy || !jobId}
              className={buttonClass}
            >
              {loadingGenerate ? "Generating..." : "Generate"}
            </button>

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerationBusy || !jobId}
              className={buttonClass}
            >
              {loadingGenerate ? "Regenerating..." : "Regenerate"}
            </button>

            <button
              type="button"
              onClick={() => void handleGenerateVariation()}
              disabled={isGenerationBusy || (!jobId && !prompt.trim())}
              className={buttonClass}
            >
              {loadingVariation ? "Creating variation..." : "Generate variation"}
            </button>
          </div>

          <div className="rounded-2xl border border-black/8 bg-[#fafaf7] px-4 py-3 text-sm text-black/70">
            <div>
              <span className="font-medium text-black">Job ID:</span>{" "}
              {jobId || "Not created yet"}
            </div>
            <div className="mt-1">
              <span className="font-medium text-black">Status:</span> {statusText}
            </div>
            {error ? (
              <div className="mt-2 space-y-2">
                <div className="text-rose-600">{error}</div>
                {errorDetails ? (
                  <div className="whitespace-pre-wrap break-words text-xs text-rose-500">
                    {errorDetails}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <section className="mt-8 rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-black/45">
            Result
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Audio result</h2>

          {activeJob?.audio_url ? (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPlaybackMode("music")}
                  className={buttonClass}
                >
                  Music only
                </button>

                <button
                  type="button"
                  onClick={() => setPlaybackMode("with-vocals")}
                  disabled={!vocalsAvailable}
                  className={buttonClass}
                >
                  With vocals
                </button>
              </div>

              {playbackMode === "music" || !activeJob.vocal_url ? (
                <audio controls className="w-full" src={activeJob.audio_url}>
                  Your browser does not support the audio element.
                </audio>
              ) : (
                <div className="space-y-3">
                  <button type="button" onClick={() => void handleToggleLayerPlayback()} className={buttonClass}>
                    {layerPlaying ? "Pause mix" : "Play final mix"}
                  </button>
                  <div className="text-sm text-black/55">
                    Simple overlay playback using the generated music track and AI vocal layer.
                  </div>
                  <audio ref={musicLayerRef} src={activeJob.audio_url} preload="auto" hidden />
                  <audio ref={vocalLayerRef} src={activeJob.vocal_url || undefined} preload="auto" hidden />
                </div>
              )}
              <div className="text-sm text-black/60 break-all">{activeJob.audio_url}</div>
              {activeJob.vocal_url ? (
                <div className="text-sm text-black/60 break-all">{activeJob.vocal_url}</div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 text-sm text-black/55">
              No generated audio yet. Create a job, run Generate, and the result will appear here.
            </div>
          )}
        </section>

        <section className="mt-8 rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-black/45">
            Versions
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Previous versions</h2>

          {versions.length > 0 ? (
            <div className="mt-5 space-y-3">
              {versions.map((version) => {
                const isSelected = version.id === selectedVersionId;

                return (
                  <div
                    key={version.id}
                    className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 md:flex-row md:items-center md:justify-between ${
                      isSelected
                        ? "border-black bg-black text-white"
                        : "border-black/8 bg-[#fafaf7] text-black"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">{version.label}</div>
                      <div className={`mt-1 text-xs ${isSelected ? "text-white/75" : "text-black/55"}`}>
                        {version.job.status} • updated {new Date(version.job.updated_at).toLocaleString()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVersionId(version.id);
                        setJob(version.job);
                        setJobId(version.job.id);
                      }}
                      className={buttonClass}
                    >
                      Play
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 text-sm text-black/55">
              No versions yet. Generate a first draft, then regenerate or create a variation.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
