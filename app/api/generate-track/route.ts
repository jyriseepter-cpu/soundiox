import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupExpiredActiveGenerationJobs,
  getActiveGenerationJob,
  setActiveGenerationJob,
} from "./activeJobStore";
import {
  createGenerationJob,
  findReusableGenerationJob,
  updateGenerationJobById,
  type GenerationJobRow,
} from "./generationJobStore";

const DEFAULT_PROVIDER = process.env.GENERATION_PROVIDER || "modal";
const MODAL_GENERATE_TRACK_URL = process.env.MODAL_GENERATE_TRACK_URL;
const RUNPOD_GENERATE_TRACK_URL = process.env.RUNPOD_GENERATE_TRACK_URL;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN?.trim();
const REPLICATE_MUSIC_MODEL = (process.env.REPLICATE_MUSIC_MODEL || "meta/musicgen").trim();
const REPLICATE_MUSIC_VERSION = process.env.REPLICATE_MUSIC_VERSION?.trim();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "tracks";
const RUNPOD_START_TIMEOUT_MS = 120 * 1000;
const MODAL_TIMEOUT_MS = 5 * 60 * 1000;

type GenerateTrackBody = {
  title?: string;
  finalDirection?: string;
  vocalMode?: string;
  generationMode?: "seed" | "full";
  generationIntent?: "new_version" | "remix" | "instrumental" | "co_producer" | "seed" | "full";
  durationSeconds?: number;
  clientGenerationToken?: string;
  provider?: string;
  sourceTrackGroupId?: string | null;
  parentVersionId?: string | null;
  lyricsPreview?: string;
  lyricsPrompt?: string;
  lyricsDirection?: string;
  artistIdentity?: {
    voiceType?: string;
    profileId?: string;
    text?: string;
  };
  artistVoiceSampleUrl?: string;
};

export const runtime = "nodejs";

type GenerationLock = {
  expiresAt: number;
  resultPromise: Promise<{
    jobId: string;
    status: string;
  }>;
};

type NormalizedTrackResponse = {
  success: true;
  provider: "modal";
  track: {
    id: string;
    title: string;
    duration: number;
    status: "generated";
    previewUrl: string;
  };
};

type GenerationMode = "seed" | "full";

const LOCK_TTL_MS = 3 * 60 * 1000;
const ACTIVE_JOB_TTL_MS = 5 * 60 * 1000;
const generationLocks = new Map<string, GenerationLock>();

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function getRunpodRunUrl() {
  if (!RUNPOD_GENERATE_TRACK_URL) return "";

  if (RUNPOD_GENERATE_TRACK_URL.endsWith("/runsync")) {
    return `${RUNPOD_GENERATE_TRACK_URL.slice(0, -"runsync".length)}run`;
  }

  if (RUNPOD_GENERATE_TRACK_URL.endsWith("/run")) {
    return RUNPOD_GENERATE_TRACK_URL;
  }

  return `${RUNPOD_GENERATE_TRACK_URL.replace(/\/+$/, "")}/run`;
}

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

function buildSupabaseClient(supabaseUrl: string, key: string) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadArtistProfileContext(request: NextRequest): Promise<{
  artistVoiceSampleUrl: string;
}> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { artistVoiceSampleUrl: "" };
  }

  const accessToken = getBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return { artistVoiceSampleUrl: "" };
  }

  const authClient = buildSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user?.id) {
    return { artistVoiceSampleUrl: "" };
  }

  const serviceClient: SupabaseClient = buildSupabaseClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );
  const { data, error } = await serviceClient
    .from("profiles")
    .select("voice_sample_url")
    .eq("id", user.id)
    .maybeSingle<{ voice_sample_url: string | null }>();

  if (error) {
    console.error("ARTIST PROFILE LOOKUP ERROR:", error.message);
    return { artistVoiceSampleUrl: "" };
  }

  return {
    artistVoiceSampleUrl: data?.voice_sample_url?.trim() || "",
  };
}

function getReplicateModelSlug() {
  const normalized = REPLICATE_MUSIC_MODEL.replace(/^https:\/\/replicate\.com\//i, "")
    .replace(/^replicate\.com\//i, "")
    .replace(/^\/+|\/+$/g, "");
  const [owner, name, ...extra] = normalized.split("/");

  if (!owner || !name || extra.length > 0) {
    return null;
  }

  return {
    owner,
    name,
  };
}

function getReplicateModelPredictionUrl() {
  const slug = getReplicateModelSlug();

  if (!slug) return "";

  return `https://api.replicate.com/v1/models/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.name)}/predictions`;
}

function getReplicateModelUrl(slug: { owner: string; name: string }) {
  return `https://api.replicate.com/v1/models/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.name)}`;
}

function getReplicateErrorMessage(payload: any, fallback: string) {
  const candidates = [
    payload?.detail,
    payload?.error,
    payload?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (payload) {
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  return fallback;
}

function normalizeOptionalText(value: string | null | undefined) {
  return String(value || "").trim();
}

function getReplicateVocalInstruction(args: {
  vocalMode: string;
  lyricsPreview: string;
}) {
  if (args.vocalMode === "instrumental") {
    return "Instrumental only. No vocals. No singing. No lyrics.";
  }

  if (args.vocalMode === "auto-lyrics") {
    return "Generate a complete song with vocals and original lyrics based on the direction.";
  }

  if (args.vocalMode === "write-lyrics") {
    return args.lyricsPreview
      ? "Use these lyrics exactly or as closely as possible."
      : "Write-lyrics mode requested, but no lyrics were provided. Ask the music model to follow the lyrics direction as closely as possible.";
  }

  if (args.vocalMode === "male") {
    return "Male lead vocal. Generate a complete song with a male lead singer and original lyrics based on the direction.";
  }

  if (args.vocalMode === "female") {
    return "Female lead vocal. Generate a complete song with a female lead singer and original lyrics based on the direction.";
  }

  if (args.vocalMode === "duet") {
    return "Male and female duet. Generate a complete song with alternating or blended male and female vocals and original lyrics based on the direction.";
  }

  return `Vocal mode: ${args.vocalMode}`;
}

function buildReplicatePrompt(args: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  lyricsPreview?: string;
  lyricsPrompt?: string;
  lyricsDirection?: string;
  artistIdentityText?: string;
}) {
  const lyricsPreview = normalizeOptionalText(args.lyricsPreview);
  const lyricsPrompt = normalizeOptionalText(args.lyricsPrompt);
  const lyricsDirection = normalizeOptionalText(args.lyricsDirection);
  const artistIdentityText = normalizeOptionalText(args.artistIdentityText);
  const sections = [
    args.title ? `Title: ${args.title}` : "",
    `Music direction: ${args.finalDirection}`,
    artistIdentityText ? `Artist identity context: ${artistIdentityText}` : "",
    `Vocal instructions: ${getReplicateVocalInstruction({
      vocalMode: args.vocalMode,
      lyricsPreview,
    })}`,
    lyricsDirection ? `Lyrics direction: ${lyricsDirection}` : "",
    lyricsPrompt ? `Lyrics prompt: ${lyricsPrompt}` : "",
    lyricsPreview ? `Lyrics text or provider lyric instruction:\n${lyricsPreview}` : "",
  ];

  return sections.filter(Boolean).join("\n\n");
}

function sanitizeReplicateLogBody(payload: any) {
  if (!payload || typeof payload !== "object") return payload;

  return {
    url: payload.url,
    owner: payload.owner,
    name: payload.name,
    visibility: payload.visibility,
    run_count: payload.run_count,
    latest_version: payload.latest_version?.id
      ? { id: payload.latest_version.id }
      : payload.latest_version,
    error: payload.error,
    detail: payload.detail,
    message: payload.message,
  };
}

function mapReplicateProviderStatus(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "starting") return "IN_QUEUE";
  if (normalized === "processing") return "IN_PROGRESS";
  if (normalized === "succeeded") return "COMPLETED";
  if (normalized === "failed") return "FAILED";
  if (normalized === "canceled") return "CANCELLED";
  return normalized.toUpperCase() || "IN_QUEUE";
}

function buildReplicateExistingJobResponse(job: GenerationJobRow, title: string) {
  if (job.audio_url) {
    return NextResponse.json({
      status: "COMPLETED",
      jobId: job.provider_job_id || job.id,
      provider: "replicate",
      generationJobId: job.id,
      trackGroupId: job.track_group_id,
      trackVersionId: job.track_version_id,
      track: {
        id: job.track_version_id || job.id,
        title: job.title || title,
        duration: job.duration_seconds || (job.generation_mode === "seed" ? 15 : 30),
        audioUrl: job.audio_url,
      },
    });
  }

  if (job.provider_job_id) {
    return NextResponse.json({
      jobId: job.provider_job_id,
      status: mapReplicateProviderStatus(job.provider_status || job.status),
      provider: "replicate",
      generationJobId: job.id,
      trackGroupId: job.track_group_id,
      trackVersionId: job.track_version_id,
    });
  }

  return NextResponse.json(
    {
      error: "Generation already starting",
      message:
        "This generation request is already being prepared. Please retry status shortly.",
      status: "STARTING",
      provider: "replicate",
      generationJobId: job.id,
    },
    { status: 409 }
  );
}

async function validateReplicateModelSlug(slug: { owner: string; name: string }) {
  const modelUrl = getReplicateModelUrl(slug);
  const modelSlug = `${slug.owner}/${slug.name}`;

  const response = await fetch(modelUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
    },
    cache: "no-store",
  });
  const text = await response.text();

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text || null;
  }

  console.log("REPLICATE MODEL LOOKUP STATUS:", response.status, response.statusText);
  console.log("REPLICATE MODEL LOOKUP BODY:", JSON.stringify(sanitizeReplicateLogBody(parsed)));

  if (!response.ok) {
    throw new Error(`Replicate model not found: ${modelSlug}`);
  }
}

function cleanupExpiredLocks() {
  const now = Date.now();

  for (const [key, value] of generationLocks.entries()) {
    if (value.expiresAt <= now) {
      generationLocks.delete(key);
    }
  }
}

function buildClientKey(request: NextRequest, promptHash: string) {
  const stableSessionId =
    request.headers.get("x-soundiox-session-id")?.trim() ||
    request.headers.get("x-session-id")?.trim() ||
    request.headers.get("x-client-session-id")?.trim() ||
    "";

  if (stableSessionId) {
    return `session:${stableSessionId}`;
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const realIp = request.headers.get("x-real-ip")?.trim() || "";
  const ip = forwardedFor || realIp || "unknown";

  return `ip:${ip}:prompt:${promptHash}`;
}

function buildStablePromptKey(input: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  generationMode?: string;
  generationIntent?: string;
  durationSeconds?: number;
  sourceTrackGroupId?: string | null;
  parentVersionId?: string | null;
  artistIdentity?: {
    voiceType?: string;
    profileId?: string;
    text?: string;
  };
  artistVoiceSampleUrl?: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title,
        finalDirection: input.finalDirection,
        vocalMode: input.vocalMode,
        generationMode: input.generationMode ?? null,
        generationIntent: input.generationIntent ?? null,
        durationSeconds: input.durationSeconds ?? null,
        sourceTrackGroupId: input.sourceTrackGroupId ?? null,
        parentVersionId: input.parentVersionId ?? null,
        artistIdentity: input.artistIdentity ?? null,
        artistVoiceSampleUrl: input.artistVoiceSampleUrl ?? null,
      })
    )
    .digest("hex");
}

function normalizeGenerationRequest(input: {
  generationMode?: string;
  durationSeconds?: number;
}) {
  const generationMode: GenerationMode = input.generationMode === "full" ? "full" : "seed";

  if (generationMode === "seed") {
    return {
      generationMode,
      durationSeconds: 15,
    };
  }

  const requestedDuration =
    typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
      ? Math.floor(input.durationSeconds)
      : 180;

  return {
    generationMode,
    durationSeconds: Math.max(15, Math.min(180, requestedDuration)),
  };
}

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function sanitizeModalResponseForLog(parsed: any) {
  if (!parsed || typeof parsed !== "object") return parsed;

  return {
    ...parsed,
    audio_base64:
      typeof parsed.audio_base64 === "string"
        ? `[base64 omitted: ${parsed.audio_base64.length} chars]`
        : parsed.audio_base64,
  };
}

async function uploadModalSeedAudio(args: {
  title: string;
  audioBase64: string;
  mimeType: string;
  fileExt: string;
}) {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const safeTitle = slugifyFilePart(args.title) || "modal-seed";
  const safeExt = (args.fileExt || "wav").replace(/[^a-z0-9]/gi, "").toLowerCase() || "wav";
  const fileName = `${safeTitle}-${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
  const objectPath = `ai-generated/modal-seeds/${fileName}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`;
  const fileBuffer = Buffer.from(args.audioBase64, "base64");

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": args.mimeType || "audio/wav",
      "x-upsert": "true",
    },
    body: fileBuffer,
  });

  const uploadBody = await response.text().catch(() => "");
  console.log("MODAL STORAGE UPLOAD STATUS:", response.status, response.statusText);

  if (!response.ok) {
    throw new Error(uploadBody || `Supabase storage upload failed with status ${response.status}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
}

async function handleModalGeneration(payload: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  generationMode: GenerationMode;
  durationSeconds: number;
  artistIdentity?: GenerateTrackBody["artistIdentity"];
  artistVoiceSampleUrl?: string;
}): Promise<NormalizedTrackResponse> {
  if (!MODAL_GENERATE_TRACK_URL) {
    throw new Error("MODAL_GENERATE_TRACK_URL missing");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODAL_TIMEOUT_MS);

  try {
    console.log("MODAL FETCH URL:", MODAL_GENERATE_TRACK_URL);
    console.log("MODAL GENERATION MODE:", payload.generationMode);
    console.log("MODAL DURATION SECONDS:", payload.durationSeconds);
    const response = await fetch(MODAL_GENERATE_TRACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: payload.title,
        finalDirection: payload.finalDirection,
        vocalMode: payload.vocalMode,
        generationMode: payload.generationMode,
        durationSeconds: payload.durationSeconds,
        artistIdentity: payload.artistIdentity ?? null,
        artistVoiceSampleUrl: payload.artistVoiceSampleUrl || null,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    console.log("MODAL RESPONSE STATUS:", response.status, response.statusText);
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Modal returned non-JSON response: ${text}`);
    }
    console.log("MODAL RESPONSE BODY:", JSON.stringify(sanitizeModalResponseForLog(parsed)));

    if (!response.ok) {
      throw new Error(
        parsed?.error || `Modal request failed with status ${response.status}`
      );
    }

    if (parsed?.success === false) {
      throw new Error(parsed?.error || "Modal generation failed");
    }

    const audioBase64 =
      typeof parsed?.audio_base64 === "string" && parsed.audio_base64.trim()
        ? parsed.audio_base64.trim()
        : "";
    const mimeType =
      typeof parsed?.mime_type === "string" && parsed.mime_type.trim()
        ? parsed.mime_type.trim()
        : "audio/wav";
    const fileExt =
      typeof parsed?.file_ext === "string" && parsed.file_ext.trim()
        ? parsed.file_ext.trim()
        : "wav";

    const trackId =
      typeof parsed?.track?.id === "string" && parsed.track.id.trim()
        ? parsed.track.id.trim()
        : `modal_${Date.now()}`;
    const trackTitle =
      typeof parsed?.track?.title === "string" && parsed.track.title.trim()
        ? parsed.track.title.trim()
        : payload.title;
    const trackDuration =
      typeof parsed?.track?.duration === "number" && Number.isFinite(parsed.track.duration)
        ? parsed.track.duration
        : payload.durationSeconds;

    if (!audioBase64) {
      throw new Error("Modal response missing audio_base64");
    }

    const previewUrl = await uploadModalSeedAudio({
      title: trackTitle,
      audioBase64,
      mimeType,
      fileExt,
    });

    return {
      success: true,
      provider: "modal",
      track: {
        id: trackId,
        title: trackTitle,
        duration: trackDuration,
        status: "generated",
        previewUrl,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Modal request timed out after 5 minutes");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleRunpodGeneration(args: {
  request: NextRequest;
  title: string;
  finalDirection: string;
  vocalMode: string;
  clientGenerationToken: string;
  artistIdentity?: GenerateTrackBody["artistIdentity"];
  artistVoiceSampleUrl?: string;
}) {
  cleanupExpiredLocks();
  cleanupExpiredActiveGenerationJobs();

  const endpoint = getRunpodRunUrl();
  if (!endpoint) {
    return NextResponse.json(
      { error: "RUNPOD_GENERATE_TRACK_URL missing" },
      { status: 500 }
    );
  }

  if (!RUNPOD_API_KEY) {
    return NextResponse.json(
      { error: "RUNPOD_API_KEY missing" },
      { status: 500 }
    );
  }

  const lockKey =
    args.clientGenerationToken ||
    buildStablePromptKey({
      title: args.title,
      finalDirection: args.finalDirection,
      vocalMode: args.vocalMode,
      artistIdentity: args.artistIdentity,
      artistVoiceSampleUrl: args.artistVoiceSampleUrl,
    });
  const promptHash = buildStablePromptKey({
    title: args.title,
    finalDirection: args.finalDirection,
    vocalMode: args.vocalMode,
    artistIdentity: args.artistIdentity,
    artistVoiceSampleUrl: args.artistVoiceSampleUrl,
  });
  const clientKey = buildClientKey(args.request, promptHash);
  const existingLock = generationLocks.get(lockKey);

  if (existingLock && existingLock.expiresAt > Date.now()) {
    const existingResult = await existingLock.resultPromise;
    return NextResponse.json(existingResult);
  }

  // Best-effort in-memory MVP/serverless protection. Later this moves to DB-backed generation_jobs.
  const existingActiveJob = getActiveGenerationJob(clientKey);

  if (existingActiveJob && existingActiveJob.expiresAt > Date.now()) {
    return NextResponse.json(
      {
        error: "Generation already in progress",
        message:
          "Please wait for the current generation to finish before starting another one.",
        activeJobId: existingActiveJob.jobId,
        status: "ACTIVE_JOB_EXISTS",
      },
      { status: 409 }
    );
  }

  const payload = {
    input: {
      title: args.title,
      finalDirection: args.finalDirection,
      vocalMode: args.vocalMode,
      artistIdentity: args.artistIdentity ?? null,
      artistVoiceSampleUrl: args.artistVoiceSampleUrl || null,
      prompt: args.finalDirection,
      durationSeconds: 15,
      max_new_tokens: 768,
      testMode: true,
      return_audio_url: true,
    },
  };

  const resultPromise = (async () => {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RUNPOD_START_TIMEOUT_MS);
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("RunPod start request timed out after 120s");
      }
      console.error("RUNPOD START FETCH ERROR:", serializeError(error));
      throw new Error("RunPod start request failed");
    }

    const text = await response.text();
    clearTimeout(timeout);
    console.log("RUNPOD START RESPONSE STATUS:", response.status, response.statusText);
    console.log("RUNPOD START RESPONSE BODY:", text);

    if (!response.ok) {
      throw new Error(`RunPod request failed (${response.status}) ${text}`);
    }

    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`RunPod returned non-JSON response: ${text}`);
    }

    const jobId = typeof parsed?.id === "string" ? parsed.id.trim() : "";
    const status = typeof parsed?.status === "string" ? parsed.status.trim() : "";

    if (!jobId || !status) {
      throw new Error(
        `RunPod start response missing id or status: ${JSON.stringify(parsed)}`
      );
    }

    console.log("RUNPOD JOB ID:", jobId);

    return { jobId, status };
  })();

  generationLocks.set(lockKey, {
    expiresAt: Date.now() + LOCK_TTL_MS,
    resultPromise,
  });

  try {
    const result = await resultPromise;
    setActiveGenerationJob(clientKey, {
      jobId: result.jobId,
      startedAt: Date.now(),
      expiresAt: Date.now() + ACTIVE_JOB_TTL_MS,
      clientGenerationToken: args.clientGenerationToken || null,
      clientKey,
    });
    generationLocks.set(lockKey, {
      expiresAt: Date.now() + LOCK_TTL_MS,
      resultPromise: Promise.resolve(result),
    });
    return NextResponse.json(result);
  } catch (error) {
    generationLocks.delete(lockKey);
    throw error;
  }
}

async function handleReplicateGeneration(args: {
  request: NextRequest;
  title: string;
  finalDirection: string;
  vocalMode: string;
  durationSeconds: number;
  generationIntent: string;
  sourceTrackGroupId?: string | null;
  parentVersionId?: string | null;
  clientGenerationToken: string;
  lyricsPreview?: string;
  lyricsPrompt?: string;
  lyricsDirection?: string;
  artistIdentity?: GenerateTrackBody["artistIdentity"];
  artistVoiceSampleUrl?: string;
}) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN missing" },
      { status: 500 }
    );
  }

  if (!args.clientGenerationToken) {
    return NextResponse.json(
      { error: "clientGenerationToken is required for Replicate generation." },
      { status: 400 }
    );
  }

  const requestHash = buildStablePromptKey({
    title: args.title,
    finalDirection: args.finalDirection,
    vocalMode: args.vocalMode,
    generationMode: args.durationSeconds <= 15 ? "seed" : "full",
    generationIntent: args.generationIntent,
    durationSeconds: args.durationSeconds,
    sourceTrackGroupId: args.sourceTrackGroupId || null,
    parentVersionId: args.parentVersionId || null,
    artistIdentity: args.artistIdentity,
    artistVoiceSampleUrl: args.artistVoiceSampleUrl,
  });
  const sessionKey = buildClientKey(args.request, requestHash);
  const lockedUntil = new Date(Date.now() + ACTIVE_JOB_TTL_MS).toISOString();
  const reusableGenerationJob = await findReusableGenerationJob({
    sessionKey,
    requestHash,
    provider: "replicate",
  });

  if (reusableGenerationJob) {
    const reusableLockExpiresAt = reusableGenerationJob.locked_until
      ? Date.parse(reusableGenerationJob.locked_until)
      : 0;

    if (
      reusableGenerationJob.audio_url ||
      reusableGenerationJob.provider_job_id ||
      reusableGenerationJob.status === "completed" ||
      reusableLockExpiresAt > Date.now()
    ) {
      return buildReplicateExistingJobResponse(reusableGenerationJob, args.title);
    }
  }

  const acquiredGenerationJob = await createGenerationJob({
    clientGenerationToken: args.clientGenerationToken,
    sessionKey,
    requestHash,
    title: args.title,
    prompt: args.finalDirection,
    provider: "replicate",
    vocalMode: args.vocalMode,
    generationMode: args.durationSeconds <= 15 ? "seed" : "full",
    generationIntent: args.generationIntent,
    durationSeconds: args.durationSeconds,
    trackGroupId: args.sourceTrackGroupId || null,
    parentVersionId: args.parentVersionId || null,
    lockedUntil,
  });
  const generationJob = acquiredGenerationJob.job;

  if (generationJob.provider_job_id || generationJob.audio_url) {
    return buildReplicateExistingJobResponse(generationJob, args.title);
  }

  const lockExpiresAt = generationJob.locked_until ? Date.parse(generationJob.locked_until) : 0;
  if (!acquiredGenerationJob.created && lockExpiresAt > Date.now()) {
    return buildReplicateExistingJobResponse(generationJob, args.title);
  }

  if (generationJob.status && !["starting", "queued", "failed"].includes(generationJob.status)) {
    return buildReplicateExistingJobResponse(generationJob, args.title);
  }

  const replicateModelSlug = getReplicateModelSlug();
  const endpoint = REPLICATE_MUSIC_VERSION
    ? "https://api.replicate.com/v1/predictions"
    : replicateModelSlug
      ? `https://api.replicate.com/v1/models/${encodeURIComponent(replicateModelSlug.owner)}/${encodeURIComponent(replicateModelSlug.name)}/predictions`
      : "";

  if (!endpoint) {
    return NextResponse.json(
      { error: "REPLICATE_MUSIC_MODEL must be formatted as owner/model" },
      { status: 500 }
    );
  }

  if (!REPLICATE_MUSIC_VERSION && replicateModelSlug) {
    await validateReplicateModelSlug(replicateModelSlug);
  }

  const prompt = buildReplicatePrompt({
    title: args.title,
    finalDirection: args.finalDirection,
    vocalMode: args.vocalMode,
    lyricsPreview: args.lyricsPreview,
    lyricsPrompt: args.lyricsPrompt,
    lyricsDirection: args.lyricsDirection,
    artistIdentityText: args.artistIdentity?.text,
  });
  const input = {
    prompt,
    duration: args.durationSeconds,
    ...(args.artistVoiceSampleUrl ? { artistVoiceSampleUrl: args.artistVoiceSampleUrl } : {}),
    ...(args.artistIdentity?.text ? { artistIdentityText: args.artistIdentity.text } : {}),
  };
  const body = REPLICATE_MUSIC_VERSION
    ? {
        version: REPLICATE_MUSIC_VERSION,
        input,
      }
    : {
        input,
      };

  console.log("REPLICATE CREATE URL:", endpoint);
  console.log("REPLICATE CREATE INPUT:", JSON.stringify(input));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Cancel-After": "10m",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  console.log("REPLICATE CREATE RESPONSE STATUS:", response.status, response.statusText);
  console.log("REPLICATE CREATE RESPONSE BODY:", text);

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Replicate returned non-JSON response: ${text}`);
  }

  if (!response.ok) {
    throw new Error(getReplicateErrorMessage(
      parsed,
      `Replicate request failed with status ${response.status}`
    ));
  }

  const jobId = typeof parsed?.id === "string" ? parsed.id.trim() : "";
  const status = typeof parsed?.status === "string" ? parsed.status.trim() : "";

  if (!jobId || !status) {
    throw new Error(`Replicate create response missing id or status: ${JSON.stringify(parsed)}`);
  }

  await updateGenerationJobById(generationJob.id, {
    provider_job_id: jobId,
    provider_status: status,
    status: status === "processing" ? "running" : "queued",
    started_at: generationJob.started_at || new Date().toISOString(),
    locked_until: new Date(Date.now() + ACTIVE_JOB_TTL_MS).toISOString(),
  });

  return NextResponse.json({
    jobId,
    status,
    provider: "replicate",
    generationJobId: generationJob.id,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateTrackBody;
    const title = body.title?.trim() || "";
    const finalDirection = body.finalDirection?.trim() || "";
    const vocalMode = body.vocalMode?.trim() || "";
    const lyricsPreview = body.lyricsPreview?.trim() || "";
    const lyricsPrompt = body.lyricsPrompt?.trim() || "";
    const lyricsDirection = body.lyricsDirection?.trim() || "";
    const sourceTrackGroupId = body.sourceTrackGroupId?.trim() || null;
    const parentVersionId = body.parentVersionId?.trim() || null;
    const { generationMode, durationSeconds } = normalizeGenerationRequest({
      generationMode:
        typeof body.generationMode === "string" ? body.generationMode.trim().toLowerCase() : "",
      durationSeconds: body.durationSeconds,
    });
    const rawGenerationIntent = body.generationIntent?.trim() || "";
    const generationIntent = [
      "new_version",
      "remix",
      "instrumental",
      "co_producer",
      "seed",
      "full",
    ].includes(rawGenerationIntent)
      ? rawGenerationIntent
      : generationMode;
    const clientGenerationToken = body.clientGenerationToken?.trim() || "";
    const artistIdentity =
      body.artistIdentity && typeof body.artistIdentity === "object"
        ? {
            voiceType: body.artistIdentity.voiceType?.trim() || undefined,
            profileId: body.artistIdentity.profileId?.trim() || undefined,
            text: body.artistIdentity.text?.trim() || undefined,
          }
        : undefined;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!finalDirection) {
      return NextResponse.json({ error: "Final direction is required" }, { status: 400 });
    }

    if (!vocalMode) {
      return NextResponse.json({ error: "Vocal mode is required" }, { status: 400 });
    }

    const provider = String(body.provider || DEFAULT_PROVIDER || "modal").trim().toLowerCase();
    const artistProfileContext = await loadArtistProfileContext(request);
    const artistVoiceSampleUrl =
      artistProfileContext.artistVoiceSampleUrl || body.artistVoiceSampleUrl?.trim() || "";
    console.log("ARTIST VOICE SAMPLE AVAILABLE", Boolean(artistVoiceSampleUrl));
    const payload = {
      title,
      finalDirection,
      vocalMode,
      generationMode,
      durationSeconds,
      lyricsPreview,
      lyricsPrompt,
      lyricsDirection,
      generationIntent,
      sourceTrackGroupId,
      parentVersionId,
      artistIdentity,
      artistVoiceSampleUrl,
    };

    if (provider === "modal") {
      const result = await handleModalGeneration(payload);
      return NextResponse.json(result);
    }

    if (provider === "replicate") {
      return await handleReplicateGeneration({
        request,
        ...payload,
        clientGenerationToken,
      });
    }

    return await handleRunpodGeneration({
      request,
      title,
      finalDirection,
      vocalMode,
      clientGenerationToken,
      artistIdentity,
      artistVoiceSampleUrl,
    });
  } catch (error: any) {
    console.error("GENERATE TRACK ERROR:", serializeError(error));
    return NextResponse.json(
      {
        error: error?.message || "Unexpected generate-track error",
      },
      { status: 500 }
    );
  }
}
