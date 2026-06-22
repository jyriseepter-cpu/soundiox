import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 1800;

const RUNPOD_MUSIC_WORKER_URL = process.env.RUNPOD_MUSIC_WORKER_URL;
const RUNPOD_MUSIC_WORKER_TOKEN = process.env.RUNPOD_MUSIC_WORKER_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BENCHMARK_PROVIDER = "runpod_pod_benchmark";
const BENCHMARK_DURATION_SECONDS = 180;
const BENCHMARK_MODEL = process.env.RUNPOD_MUSIC_WORKER_MODEL || "facebook/musicgen-small";
const BENCHMARK_GPU_USD_PER_HOUR = Number.parseFloat(
  process.env.RUNPOD_BENCHMARK_GPU_USD_PER_HOUR || "0.70"
);
const WORKER_TIMEOUT_MS = 30 * 60 * 1000;
const BENCHMARK_TITLE = "SoundioX RunPod Pod 3 Minute Instrumental Benchmark";
const BENCHMARK_PROMPT =
  "Create a polished 3-minute instrumental electronic pop track for SoundioX benchmarking. No vocals, no spoken words. Include a clear intro, energetic main section, dynamic bridge, and complete ending.";

type BenchmarkMetadata = Record<string, unknown>;

function readRequiredEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase environment variables");
  }

  if (!RUNPOD_MUSIC_WORKER_URL) {
    throw new Error("RUNPOD_MUSIC_WORKER_URL missing");
  }

  return {
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    workerUrl: RUNPOD_MUSIC_WORKER_URL.trim(),
    workerToken: RUNPOD_MUSIC_WORKER_TOKEN?.trim() || "",
  };
}

function buildServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getWorkerEndpointShape(workerUrl: string) {
  try {
    const parsed = new URL(workerUrl);
    return {
      host: parsed.host,
      protocol: parsed.protocol.replace(":", ""),
      path: parsed.pathname || "/",
      tokenConfigured: Boolean(RUNPOD_MUSIC_WORKER_TOKEN?.trim()),
    };
  } catch {
    return {
      host: null,
      protocol: null,
      path: "invalid-url",
      tokenConfigured: Boolean(RUNPOD_MUSIC_WORKER_TOKEN?.trim()),
    };
  }
}

function secondsBetween(startMs: number, endMs: number) {
  return Math.round(((endMs - startMs) / 1000) * 1000) / 1000;
}

function estimateGpuCostUsd(totalJobSeconds: number) {
  if (!Number.isFinite(BENCHMARK_GPU_USD_PER_HOUR) || BENCHMARK_GPU_USD_PER_HOUR <= 0) {
    return null;
  }

  return Math.round((totalJobSeconds / 3600) * BENCHMARK_GPU_USD_PER_HOUR * 1000000) / 1000000;
}

async function columnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  table: string,
  column: string
) {
  const { error } = await serviceClient.from(table).select(column).limit(1);
  return !error;
}

async function getGenerationJobColumns(serviceClient: ReturnType<typeof buildServiceClient>) {
  const columns = [
    "title",
    "prompt",
    "vocal_mode",
    "provider",
    "status",
    "audio_url",
    "error",
    "provider_status",
    "generation_mode",
    "generation_intent",
    "duration_seconds",
    "started_at",
    "completed_at",
    "failed_at",
    "cost_metadata",
  ];

  const entries = await Promise.all(
    columns.map(async (column) => [column, await columnExists(serviceClient, "generation_jobs", column)] as const)
  );

  return Object.fromEntries(entries) as Record<string, boolean>;
}

function filterColumns(columns: Record<string, boolean>, values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([column]) => columns[column]));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseWorkerResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`RunPod Pod worker returned non-JSON response: ${text.slice(0, 2000)}`);
  }
}

async function insertBenchmarkJob(args: {
  serviceClient: ReturnType<typeof buildServiceClient>;
  columns: Record<string, boolean>;
  startedAtIso: string;
  metadata: BenchmarkMetadata;
}) {
  const insertPayload = filterColumns(args.columns, {
    title: BENCHMARK_TITLE,
    prompt: BENCHMARK_PROMPT,
    vocal_mode: "instrumental",
    provider: BENCHMARK_PROVIDER,
    status: "running",
    provider_status: "started",
    generation_mode: "benchmark",
    generation_intent: "runpod_pod_3_minute_cost_benchmark",
    duration_seconds: BENCHMARK_DURATION_SECONDS,
    started_at: args.startedAtIso,
    cost_metadata: args.metadata,
  });

  const { data, error } = await args.serviceClient
    .from("generation_jobs")
    .insert(insertPayload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`generation_jobs Pod benchmark insert failed: ${error.message}`);
  }

  return data.id;
}

async function updateBenchmarkJob(args: {
  serviceClient: ReturnType<typeof buildServiceClient>;
  columns: Record<string, boolean>;
  generationJobId: string | null;
  updates: Record<string, unknown>;
}) {
  if (!args.generationJobId) return;

  const updatePayload = filterColumns(args.columns, args.updates);
  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await args.serviceClient
    .from("generation_jobs")
    .update(updatePayload)
    .eq("id", args.generationJobId);

  if (error) {
    console.error("RUNPOD_POD_BENCHMARK_JOB_UPDATE_FAILED", {
      generationJobId: args.generationJobId,
      message: error.message,
    });
  }
}

function pickWorkerAudioUrl(workerPayload: any) {
  const candidates = [
    workerPayload?.audioUrl,
    workerPayload?.audio_url,
    workerPayload?.track?.audioUrl,
    workerPayload?.track?.audio_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function pickWorkerFailure(workerPayload: any, fallback: string) {
  const candidates = [workerPayload?.message, workerPayload?.error, workerPayload?.detail];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const benchmarkStartedMs = Date.now();
  const startedAtIso = new Date(benchmarkStartedMs).toISOString();
  let generationJobId: string | null = null;
  let workerEndpointShape: ReturnType<typeof getWorkerEndpointShape> | null = null;

  try {
    const { supabaseUrl, serviceRoleKey, workerUrl, workerToken } = readRequiredEnv();
    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const generationJobColumns = await getGenerationJobColumns(serviceClient);
    workerEndpointShape = getWorkerEndpointShape(workerUrl);
    const gpuUsdPerHour = Number.isFinite(BENCHMARK_GPU_USD_PER_HOUR)
      ? BENCHMARK_GPU_USD_PER_HOUR
      : null;
    const outputPrefix = `ai-generated/runpod-pod-benchmark/${Date.now()}`;
    const initialMetadata: BenchmarkMetadata = {
      benchmark: true,
      route: "/api/dev/runpod-pod-music-benchmark",
      provider: "runpod_pod_worker",
      requested_duration_seconds: BENCHMARK_DURATION_SECONDS,
      model: BENCHMARK_MODEL,
      output_prefix: outputPrefix,
      worker_endpoint_shape: workerEndpointShape,
      prompt_type: "instrumental",
      gpu_usd_per_hour: gpuUsdPerHour,
      started_at: startedAtIso,
    };

    generationJobId = await insertBenchmarkJob({
      serviceClient,
      columns: generationJobColumns,
      startedAtIso,
      metadata: initialMetadata,
    });

    console.log("RUNPOD_POD_BENCHMARK_JOB_STARTED", {
      generationJobId,
      durationSeconds: BENCHMARK_DURATION_SECONDS,
      model: BENCHMARK_MODEL,
      workerEndpointShape,
    });

    const workerResponse = await fetchWithTimeout(
      workerUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
        },
        body: JSON.stringify({
          title: BENCHMARK_TITLE,
          prompt: BENCHMARK_PROMPT,
          durationSeconds: BENCHMARK_DURATION_SECONDS,
          outputPrefix,
        }),
        cache: "no-store",
      },
      WORKER_TIMEOUT_MS
    );
    const workerPayload = await parseWorkerResponse(workerResponse);
    const finishedMs = Date.now();
    const totalJobSeconds = secondsBetween(benchmarkStartedMs, finishedMs);
    const estimatedGpuCostUsd = estimateGpuCostUsd(totalJobSeconds);
    const outputAudioUrl = pickWorkerAudioUrl(workerPayload);
    const workerMetadata =
      workerPayload?.metadata && typeof workerPayload.metadata === "object"
        ? workerPayload.metadata
        : null;
    const completedAtIso = new Date(finishedMs).toISOString();
    const finalMetadata: BenchmarkMetadata = {
      ...initialMetadata,
      total_job_seconds: totalJobSeconds,
      estimated_gpu_cost_usd: estimatedGpuCostUsd,
      gpu_usd_per_hour: gpuUsdPerHour,
      model: (workerMetadata as Record<string, unknown> | null)?.model || BENCHMARK_MODEL,
      output_audio_url: outputAudioUrl,
      worker_status: workerResponse.status,
      worker_metadata: workerMetadata,
      worker_response: workerPayload,
      completed_at: completedAtIso,
    };

    if (!workerResponse.ok || !outputAudioUrl) {
      const failureReason = !workerResponse.ok
        ? pickWorkerFailure(workerPayload, `RunPod Pod worker failed with status ${workerResponse.status}`)
        : "RunPod Pod worker response did not include audioUrl.";
      const failedAtIso = completedAtIso;

      await updateBenchmarkJob({
        serviceClient,
        columns: generationJobColumns,
        generationJobId,
        updates: {
          status: "failed",
          provider_status: "worker_failed",
          failed_at: failedAtIso,
          error: failureReason,
          audio_url: outputAudioUrl,
          cost_metadata: {
            ...finalMetadata,
            failed_at: failedAtIso,
            failure_reason: failureReason,
          },
        },
      });

      const result = {
        ok: false,
        generationJobId,
        provider: BENCHMARK_PROVIDER,
        workerEndpointShape,
        requestedDurationSeconds: BENCHMARK_DURATION_SECONDS,
        model: finalMetadata.model,
        startedAt: startedAtIso,
        failedAt: failedAtIso,
        totalJobSeconds,
        gpuUsdPerHour,
        estimatedGpuCostUsd,
        outputAudioUrl,
        failureReason,
        worker: {
          status: workerResponse.status,
          metadata: workerMetadata,
          response: workerPayload,
        },
      };

      console.error("RUNPOD_POD_BENCHMARK_JOB_FAILED", result);
      return NextResponse.json(result, { status: workerResponse.ok ? 502 : workerResponse.status });
    }

    await updateBenchmarkJob({
      serviceClient,
      columns: generationJobColumns,
      generationJobId,
      updates: {
        status: "completed",
        provider_status: "completed",
        completed_at: completedAtIso,
        audio_url: outputAudioUrl,
        cost_metadata: finalMetadata,
      },
    });

    const result = {
      ok: true,
      generationJobId,
      provider: BENCHMARK_PROVIDER,
      workerEndpointShape,
      requestedDurationSeconds: BENCHMARK_DURATION_SECONDS,
      model: finalMetadata.model,
      startedAt: startedAtIso,
      completedAt: completedAtIso,
      totalJobSeconds,
      gpuUsdPerHour,
      estimatedGpuCostUsd,
      outputAudioUrl,
      worker: {
        status: workerResponse.status,
        metadata: workerMetadata,
        response: workerPayload,
      },
    };

    console.log("RUNPOD_POD_BENCHMARK_JOB_COMPLETED", result);
    return NextResponse.json(result);
  } catch (error: any) {
    const failedMs = Date.now();
    const failedAtIso = new Date(failedMs).toISOString();
    const totalJobSeconds = secondsBetween(benchmarkStartedMs, failedMs);
    const message =
      error?.name === "AbortError"
        ? "RunPod Pod benchmark request timed out."
        : error?.message || "RunPod Pod benchmark failed.";

    console.error("RUNPOD_POD_BENCHMARK_JOB_FAILED", {
      generationJobId,
      message,
    });

    try {
      if (generationJobId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const serviceClient = buildServiceClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const generationJobColumns = await getGenerationJobColumns(serviceClient);
        await updateBenchmarkJob({
          serviceClient,
          columns: generationJobColumns,
          generationJobId,
          updates: {
            status: "failed",
            provider_status: "error",
            failed_at: failedAtIso,
            error: message,
            cost_metadata: {
              benchmark: true,
              route: "/api/dev/runpod-pod-music-benchmark",
              provider: "runpod_pod_worker",
              requested_duration_seconds: BENCHMARK_DURATION_SECONDS,
              model: BENCHMARK_MODEL,
              worker_endpoint_shape: workerEndpointShape,
              total_job_seconds: totalJobSeconds,
              estimated_gpu_cost_usd: estimateGpuCostUsd(totalJobSeconds),
              gpu_usd_per_hour: Number.isFinite(BENCHMARK_GPU_USD_PER_HOUR)
                ? BENCHMARK_GPU_USD_PER_HOUR
                : null,
              failure_reason: message,
              failed_at: failedAtIso,
            },
          },
        });
      }
    } catch (updateError: any) {
      console.error("RUNPOD_POD_BENCHMARK_FAILURE_UPDATE_FAILED", {
        message: updateError?.message || "Failed to update Pod benchmark failure.",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        generationJobId,
        provider: BENCHMARK_PROVIDER,
        workerEndpointShape,
        requestedDurationSeconds: BENCHMARK_DURATION_SECONDS,
        model: BENCHMARK_MODEL,
        startedAt: startedAtIso,
        failedAt: failedAtIso,
        totalJobSeconds,
        gpuUsdPerHour: Number.isFinite(BENCHMARK_GPU_USD_PER_HOUR)
          ? BENCHMARK_GPU_USD_PER_HOUR
          : null,
        estimatedGpuCostUsd: estimateGpuCostUsd(totalJobSeconds),
        failureReason: message,
      },
      { status: 500 }
    );
  }
}
