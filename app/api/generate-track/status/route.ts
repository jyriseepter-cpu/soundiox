import { NextRequest, NextResponse } from "next/server";
import { clearActiveGenerationJobByJobId } from "../activeJobStore";
import {
  buildPublicStorageUrl,
  ensureTrackVersionForGenerationJob,
  findGenerationJobByProviderJobId,
  updateGenerationJobById,
  updateGenerationJobByProviderJobId,
} from "../generationJobStore";

const RUNPOD_GENERATE_TRACK_URL = process.env.RUNPOD_GENERATE_TRACK_URL;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "tracks";
const MAX_POLL_SECONDS = 90;

export const runtime = "nodejs";

function getRunpodStatusUrl(jobId: string) {
  if (!RUNPOD_GENERATE_TRACK_URL) return "";

  const trimmed = RUNPOD_GENERATE_TRACK_URL.replace(/\/+$/, "");

  if (trimmed.endsWith("/run")) {
    return `${trimmed.slice(0, -"/run".length)}/status/${jobId}`;
  }

  if (trimmed.endsWith("/runsync")) {
    return `${trimmed.slice(0, -"/runsync".length)}/status/${jobId}`;
  }

  return `${trimmed}/status/${jobId}`;
}

function getRunpodCancelUrl(jobId: string) {
  if (!RUNPOD_GENERATE_TRACK_URL) return "";

  const trimmed = RUNPOD_GENERATE_TRACK_URL.replace(/\/+$/, "");

  if (trimmed.endsWith("/run")) {
    return `${trimmed.slice(0, -"/run".length)}/cancel/${jobId}`;
  }

  if (trimmed.endsWith("/runsync")) {
    return `${trimmed.slice(0, -"/runsync".length)}/cancel/${jobId}`;
  }

  return `${trimmed}/cancel/${jobId}`;
}

async function cancelRunpodJob(jobId: string) {
  const endpoint = getRunpodCancelUrl(jobId);
  if (!endpoint) {
    return {
      available: false,
      cancelled: false,
      message: "Generation timed out. RunPod cancellation was not available.",
    };
  }

  try {
    console.log("RUNPOD CANCEL FETCH URL:", endpoint);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const text = await response.text();
    console.log("RUNPOD CANCEL RESPONSE STATUS:", response.status, response.statusText);
    console.log("RUNPOD CANCEL RESPONSE BODY:", text || "[EMPTY]");

    if (!response.ok) {
      return {
        available: false,
        cancelled: false,
        message: "Generation timed out. RunPod cancellation was not available.",
        status: response.status,
        body: text,
      };
    }

    return {
      available: true,
      cancelled: true,
      message: "Generation timed out and RunPod job was cancelled.",
      body: text,
    };
  } catch (error: any) {
    console.log("RUNPOD CANCEL RESPONSE STATUS:", "[FETCH FAILED]");
    console.log("RUNPOD CANCEL RESPONSE BODY:", error?.message || "Cancel request failed");
    return {
      available: false,
      cancelled: false,
      message: "Generation timed out. RunPod cancellation was not available.",
      error: error?.message || "Cancel request failed",
    };
  }
}

function normalizeDelaySeconds(delayTime: unknown) {
  if (typeof delayTime !== "number" || !Number.isFinite(delayTime) || delayTime < 0) {
    return null;
  }

  if (delayTime > 1000) {
    return Math.floor(delayTime / 1000);
  }

  return Math.floor(delayTime);
}

function pickAudioUrl(parsed: any) {
  const candidates = [
    parsed?.output?.audio_url,
    parsed?.output?.audioUrl,
    parsed?.output?.output?.audio_url,
    parsed?.output?.output?.audioUrl,
    parsed?.output?.track?.audio_url,
    parsed?.output?.track?.audioUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function pickReplicateAudioUrl(output: any): string {
  if (typeof output === "string" && output.trim()) {
    return output.trim();
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const audioUrl = pickReplicateAudioUrl(item);
      if (audioUrl) return audioUrl;
    }
  }

  if (output && typeof output === "object") {
    const candidates = [
      output.audio_url,
      output.audioUrl,
      output.url,
      output.file,
      output.output,
      output.audio,
      output.track?.audio_url,
      output.track?.audioUrl,
      output.track?.url,
    ];

    for (const candidate of candidates) {
      const audioUrl = pickReplicateAudioUrl(candidate);
      if (audioUrl) return audioUrl;
    }
  }

  return "";
}

function mapReplicateStatus(status: string) {
  if (status === "starting") return "IN_QUEUE";
  if (status === "processing") return "IN_PROGRESS";
  if (status === "succeeded") return "COMPLETED";
  if (status === "failed") return "FAILED";
  if (status === "canceled") return "CANCELLED";
  return status.toUpperCase() || "UNKNOWN";
}

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function inferAudioExtension(contentType: string, audioUrl: string) {
  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase() || "";
  const contentTypeMap: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
  };

  if (contentTypeMap[normalizedContentType]) {
    return contentTypeMap[normalizedContentType];
  }

  try {
    const pathname = new URL(audioUrl).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  } catch {
    const match = audioUrl.split("?")[0]?.match(/\.([a-z0-9]{2,5})$/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return "mp3";
}

async function storeReplicateAudioInSupabase(args: {
  title: string;
  audioUrl: string;
}) {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  }

  console.log("REPLICATE OUTPUT AUDIO URL:", args.audioUrl);
  const downloadResponse = await fetch(args.audioUrl, {
    method: "GET",
    cache: "no-store",
  });
  console.log(
    "REPLICATE OUTPUT DOWNLOAD STATUS:",
    downloadResponse.status,
    downloadResponse.statusText
  );

  if (!downloadResponse.ok) {
    const downloadBody = await downloadResponse.text().catch(() => "");
    throw new Error(
      downloadBody ||
        `Replicate output download failed with status ${downloadResponse.status}`
    );
  }

  const contentType = downloadResponse.headers.get("content-type") || "audio/mpeg";
  const fileExt = inferAudioExtension(contentType, args.audioUrl);
  const safeTitle = slugifyFilePart(args.title) || "replicate-track";
  const objectPath =
    `ai-generated/replicate/${safeTitle}-${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`;
  const audioBuffer = Buffer.from(await downloadResponse.arrayBuffer());

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: audioBuffer,
  });
  const uploadBody = await uploadResponse.text().catch(() => "");
  console.log("SUPABASE REPLICATE UPLOAD STATUS:", uploadResponse.status, uploadResponse.statusText);

  if (!uploadResponse.ok) {
    throw new Error(
      uploadBody || `Supabase storage upload failed with status ${uploadResponse.status}`
    );
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
  console.log("SUPABASE REPLICATE PUBLIC URL:", publicUrl);
  return {
    publicUrl,
    storagePath: objectPath,
  };
}

async function handleReplicateStatus(args: {
  jobId: string;
  title: string;
}) {
  if (!REPLICATE_API_TOKEN) {
    return NextResponse.json(
      {
        status: "CONFIG_ERROR",
        error: "REPLICATE_API_TOKEN missing",
        message: "REPLICATE_API_TOKEN missing",
        details: "Replicate status endpoint is not configured.",
        provider: "replicate",
        replicate: null,
      },
      { status: 500 }
    );
  }

  let response: Response;
  try {
    response = await fetch(`https://api.replicate.com/v1/predictions/${args.jobId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      },
      cache: "no-store",
    });
  } catch (error: any) {
    console.error("REPLICATE STATUS FETCH ERROR:", error);
    return NextResponse.json(
      {
        status: "FETCH_ERROR",
        error: error?.message || "Replicate status request failed",
        message: "Replicate status request failed",
        details: error?.message || "Replicate status request failed",
        provider: "replicate",
        replicate: null,
      },
      { status: 500 }
    );
  }

  const text = await response.text();
  console.log("REPLICATE STATUS RESPONSE STATUS:", response.status, response.statusText);
  console.log("REPLICATE STATUS RESPONSE BODY:", text);

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json(
      {
        status: "INVALID_JSON",
        error: "Replicate status returned non-JSON response",
        message: "Replicate status returned non-JSON response",
        details: `Replicate responded with invalid JSON: ${text}`,
        provider: "replicate",
        replicate: null,
      },
      { status: 500 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: parsed?.status || "REQUEST_FAILED",
        error: "Replicate status request failed",
        message: "Replicate status request failed",
        details: parsed?.detail || `Replicate responded with ${response.status} ${response.statusText}.`,
        provider: "replicate",
        replicate: parsed,
      },
      { status: 500 }
    );
  }

  const replicateStatus = typeof parsed?.status === "string" ? parsed.status.trim() : "";
  const status = mapReplicateStatus(replicateStatus);
  const existingGenerationJob = await findGenerationJobByProviderJobId(args.jobId).catch(
    (error) => {
      console.error("GENERATION JOB LOOKUP ERROR:", error?.message || error);
      return null;
    }
  );
  const trackDuration = existingGenerationJob?.duration_seconds || 30;

  if (status === "IN_QUEUE" || status === "IN_PROGRESS") {
    await updateGenerationJobByProviderJobId(args.jobId, {
      status: status === "IN_PROGRESS" ? "running" : "queued",
      provider_status: replicateStatus || null,
      locked_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }).catch((error) => {
      console.error("GENERATION JOB PROGRESS UPDATE ERROR:", error?.message || error);
    });

    return NextResponse.json({
      status,
      jobId: args.jobId,
      provider: "replicate",
      replicate: parsed,
    });
  }

  if (status === "COMPLETED") {
    if (existingGenerationJob?.audio_url) {
      const version = await ensureTrackVersionForGenerationJob({
        generationJob: existingGenerationJob,
        title: existingGenerationJob.title || args.title,
        audioUrl: existingGenerationJob.audio_url,
        storagePath: existingGenerationJob.storage_path,
        duration: trackDuration,
      }).catch((error) => {
        console.error("TRACK VERSION REUSE ERROR:", error?.message || error);
        return null;
      });

      return NextResponse.json({
        status: "COMPLETED",
        jobId: args.jobId,
        provider: "replicate",
        generationJobId: existingGenerationJob.id,
        trackGroupId: version?.track_group_id || existingGenerationJob.track_group_id,
        trackVersionId: version?.id || existingGenerationJob.track_version_id,
        track: {
          id: version?.id || existingGenerationJob.id,
          title: existingGenerationJob.title || args.title,
          duration: trackDuration,
          audioUrl: existingGenerationJob.audio_url,
        },
      });
    }

    if (existingGenerationJob?.storage_path) {
      const storedUrl = buildPublicStorageUrl(SUPABASE_BUCKET, existingGenerationJob.storage_path);
      const updatedGenerationJob = await updateGenerationJobById(existingGenerationJob.id, {
        audio_url: storedUrl,
        status: "completed",
        provider_status: replicateStatus || "succeeded",
        completed_at: existingGenerationJob.completed_at || new Date().toISOString(),
      }).catch((error) => {
        console.error("GENERATION JOB STORED URL UPDATE ERROR:", error?.message || error);
        return null;
      });
      const version = await ensureTrackVersionForGenerationJob({
        generationJob: updatedGenerationJob || existingGenerationJob,
        title: existingGenerationJob.title || args.title,
        audioUrl: storedUrl,
        storagePath: existingGenerationJob.storage_path,
        duration: trackDuration,
      }).catch((error) => {
        console.error("TRACK VERSION STORED URL ERROR:", error?.message || error);
        return null;
      });

      return NextResponse.json({
        status: "COMPLETED",
        jobId: args.jobId,
        provider: "replicate",
        generationJobId: existingGenerationJob.id,
        trackGroupId: version?.track_group_id || existingGenerationJob.track_group_id,
        trackVersionId: version?.id || existingGenerationJob.track_version_id,
        track: {
          id: version?.id || existingGenerationJob.id,
          title: existingGenerationJob.title || args.title,
          duration: trackDuration,
          audioUrl: storedUrl,
        },
      });
    }

    const replicateAudioUrl = pickReplicateAudioUrl(parsed?.output);

    if (!replicateAudioUrl) {
      return NextResponse.json(
        {
          status,
          error: "Replicate completed response missing audio output URL",
          message: "Replicate completed response missing audio output URL",
          details: "No audio URL was found in the supported Replicate output shapes.",
          provider: "replicate",
          replicate: parsed,
        },
        { status: 500 }
      );
    }

    let audioUrl = "";
    let storagePath = "";
    try {
      const storedAudio = await storeReplicateAudioInSupabase({
        title: args.title,
        audioUrl: replicateAudioUrl,
      });
      audioUrl = storedAudio.publicUrl;
      storagePath = storedAudio.storagePath;
    } catch (error: any) {
      console.error("REPLICATE STORAGE ERROR:", error?.message || error);
      return NextResponse.json(
        {
          status: "STORAGE_ERROR",
          error: error?.message || "Replicate audio storage failed",
          message: "Replicate audio storage failed",
          details: error?.message || "Replicate audio could not be stored in Supabase.",
          provider: "replicate",
          replicate: parsed,
        },
        { status: 500 }
      );
    }

    let updatedGenerationJob = existingGenerationJob;
    if (existingGenerationJob) {
      updatedGenerationJob = await updateGenerationJobById(existingGenerationJob.id, {
        audio_url: audioUrl,
        storage_path: storagePath,
        status: "completed",
        provider_status: replicateStatus || "succeeded",
        completed_at: new Date().toISOString(),
        error: null,
      }).catch((error) => {
        console.error("GENERATION JOB COMPLETE UPDATE ERROR:", error?.message || error);
        return existingGenerationJob;
      });
    }
    const version = updatedGenerationJob
      ? await ensureTrackVersionForGenerationJob({
          generationJob: updatedGenerationJob,
          title: updatedGenerationJob.title || args.title,
          audioUrl,
          storagePath,
          duration: trackDuration,
        }).catch((error) => {
          console.error("TRACK VERSION CREATE ERROR:", error?.message || error);
          return null;
        })
      : null;

    return NextResponse.json({
      status: "COMPLETED",
      jobId: args.jobId,
      provider: "replicate",
      generationJobId: updatedGenerationJob?.id,
      trackGroupId: version?.track_group_id || updatedGenerationJob?.track_group_id,
      trackVersionId: version?.id || updatedGenerationJob?.track_version_id,
      track: {
        id: version?.id || updatedGenerationJob?.id || crypto.randomUUID(),
        title: updatedGenerationJob?.title || args.title,
        duration: trackDuration,
        audioUrl,
      },
    });
  }

  if (status === "FAILED") {
    await updateGenerationJobByProviderJobId(args.jobId, {
      status: "failed",
      provider_status: replicateStatus || "failed",
      failed_at: new Date().toISOString(),
      error:
        typeof parsed?.error === "string" && parsed.error.trim()
          ? parsed.error.trim()
          : "Replicate returned failed.",
    }).catch((error) => {
      console.error("GENERATION JOB FAILED UPDATE ERROR:", error?.message || error);
    });

    return NextResponse.json(
      {
        status,
        error: "Replicate generation failed",
        message: "Replicate generation failed",
        details:
          typeof parsed?.error === "string" && parsed.error.trim()
            ? parsed.error.trim()
            : "Replicate returned failed.",
        provider: "replicate",
        replicate: parsed,
      },
      { status: 500 }
    );
  }

  if (status === "CANCELLED") {
    await updateGenerationJobByProviderJobId(args.jobId, {
      status: "cancelled",
      provider_status: replicateStatus || "canceled",
      cancelled_at: new Date().toISOString(),
    }).catch((error) => {
      console.error("GENERATION JOB CANCELLED UPDATE ERROR:", error?.message || error);
    });

    return NextResponse.json(
      {
        status,
        error: "Replicate generation was cancelled",
        message: "Replicate generation was cancelled",
        details: "Replicate returned canceled.",
        provider: "replicate",
        replicate: parsed,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      status,
      error: "Unexpected Replicate status response",
      message: "Unexpected Replicate status response",
      details: "Replicate returned a status that the SoundioX generator does not handle.",
      provider: "replicate",
      replicate: parsed,
    },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim() || "";
  const title = request.nextUrl.searchParams.get("title")?.trim() || "Generated track";
  const startedAt = Number(request.nextUrl.searchParams.get("startedAt") || "");
  const provider = request.nextUrl.searchParams.get("provider")?.trim().toLowerCase() || "runpod";

  if (!jobId) {
    return NextResponse.json(
      {
        status: "INVALID_REQUEST",
        error: "jobId is required",
        message: "jobId is required",
        details: "Provide a RunPod jobId to check generation status.",
        runpod: null,
      },
      { status: 400 }
    );
  }

  if (provider === "replicate") {
    return await handleReplicateStatus({ jobId, title });
  }

  const endpoint = getRunpodStatusUrl(jobId);
  if (!endpoint) {
    return NextResponse.json(
      {
        status: "CONFIG_ERROR",
        error: "RUNPOD_GENERATE_TRACK_URL missing",
        message: "RUNPOD_GENERATE_TRACK_URL missing",
        details: "RunPod status endpoint is not configured.",
        runpod: null,
      },
      { status: 500 }
    );
  }

  let response: Response;
  try {
    console.log("RUNPOD STATUS FETCH URL:", endpoint);
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
      cache: "no-store",
    });
  } catch (error: any) {
    console.error("RUNPOD STATUS FETCH ERROR:", error);
    return NextResponse.json(
      {
        status: "FETCH_ERROR",
        error: error?.message || "RunPod status request failed",
        message: "RunPod status request failed",
        details: error?.message || "RunPod status request failed",
        runpod: null,
      },
      { status: 500 }
    );
  }

  const text = await response.text();
  console.log("RUNPOD STATUS RESPONSE STATUS:", response.status, response.statusText);
  console.log("RUNPOD STATUS RESPONSE BODY:", text);

  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
    console.log("RUNPOD STATUS FULL RESPONSE:", JSON.stringify(parsed, null, 2));
  } catch {
    return NextResponse.json(
      {
        status: "INVALID_JSON",
        error: "RunPod status returned non-JSON response",
        message: "RunPod status returned non-JSON response",
        details: `RunPod responded with invalid JSON: ${text}`,
        runpod: null,
      },
      { status: 500 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: parsed?.status || "REQUEST_FAILED",
        error: "RunPod status request failed",
        message: "RunPod status request failed",
        details: `RunPod responded with ${response.status} ${response.statusText}.`,
        runpod: parsed,
      },
      { status: 500 }
    );
  }

  const status = typeof parsed?.status === "string" ? parsed.status.trim() : "";
  const elapsedSeconds =
    Number.isFinite(startedAt) && startedAt > 0
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : null;
  const delaySeconds = normalizeDelaySeconds(parsed?.delayTime);
  const exceededClientTimeout = elapsedSeconds !== null && elapsedSeconds >= MAX_POLL_SECONDS;
  const exceededRunpodTimeout = delaySeconds !== null && delaySeconds >= MAX_POLL_SECONDS;

  console.log("RUNPOD POLL STATUS:", status || "[missing]");
  console.log("RUNPOD ELAPSED SECONDS:", elapsedSeconds ?? "[unknown]");

  if (typeof parsed?.executionTime === "number" && parsed.executionTime > 60000) {
    await cancelRunpodJob(jobId);
    clearActiveGenerationJobByJobId(jobId);
    return NextResponse.json(
      {
        status: "FAILED",
        error: "cost limit exceeded",
        message: "cost limit exceeded",
        details: `RunPod executionTime reached ${parsed.executionTime}.`,
        runpod: parsed,
      },
      { status: 500 }
    );
  }

  if (status === "IN_QUEUE" || status === "IN_PROGRESS") {
    if (status === "IN_PROGRESS" && elapsedSeconds !== null && elapsedSeconds > 60) {
      const cancellation = await cancelRunpodJob(jobId);
      clearActiveGenerationJobByJobId(jobId);
      return NextResponse.json(
        {
          status,
          error: cancellation.message,
          message: cancellation.message,
          details: `Client-side polling reached ${elapsedSeconds} seconds while RunPod stayed IN_PROGRESS.`,
          runpod: parsed,
          cancellation,
        },
        { status: 500 }
      );
    }

    if (exceededClientTimeout || exceededRunpodTimeout) {
      const cancellation = await cancelRunpodJob(jobId);
      clearActiveGenerationJobByJobId(jobId);
      return NextResponse.json(
        {
          status,
          error: cancellation.message,
          message: cancellation.message,
          details:
            exceededRunpodTimeout && delaySeconds !== null
              ? `RunPod delayTime reached ${delaySeconds} seconds.`
              : exceededClientTimeout && elapsedSeconds !== null
                ? `Client-side polling reached ${elapsedSeconds} seconds.`
                : "Timeout threshold reached.",
          runpod: parsed,
          cancellation,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ status, jobId });
  }

  if (status === "COMPLETED") {
    const audioUrl = pickAudioUrl(parsed);

    if (!audioUrl) {
      clearActiveGenerationJobByJobId(jobId);
      return NextResponse.json(
        {
          status,
          error: "RunPod completed response missing audio_url",
          message: "RunPod completed response missing audio_url",
          details: "No audio URL was found in the supported RunPod output shapes.",
          runpod: parsed,
        },
        { status: 500 }
      );
    }

    console.log("RUNPOD COMPLETED AUDIO URL:", audioUrl);
    console.log("RUNPOD FINAL OUTPUT:", JSON.stringify(parsed, null, 2));
    clearActiveGenerationJobByJobId(jobId);

    return NextResponse.json({
      status: "COMPLETED",
      jobId,
      track: {
        id: crypto.randomUUID(),
        title,
        duration: 25,
        audioUrl,
      },
    });
  }

  if (status === "FAILED") {
    clearActiveGenerationJobByJobId(jobId);
    return NextResponse.json(
      {
        status,
        error: "RunPod generation failed",
        message: "RunPod generation failed",
        details:
          typeof parsed?.error === "string"
            ? parsed.error
            : typeof parsed?.output?.error === "string"
              ? parsed.output.error
              : "RunPod returned FAILED.",
        runpod: parsed,
      },
      { status: 500 }
    );
  }

  if (status === "CANCELLED") {
    clearActiveGenerationJobByJobId(jobId);
    return NextResponse.json(
      {
        status,
        error: "RunPod generation was cancelled",
        message: "RunPod generation was cancelled",
        details: "RunPod returned CANCELLED.",
        runpod: parsed,
      },
      { status: 500 }
    );
  }

  clearActiveGenerationJobByJobId(jobId);
  return NextResponse.json(
    {
      status: status || "UNKNOWN",
      error: "Unexpected RunPod status response",
      message: "Unexpected RunPod status response",
      details: "RunPod returned a status that the SoundioX generator does not handle.",
      runpod: parsed,
    },
    { status: 500 }
  );
}
