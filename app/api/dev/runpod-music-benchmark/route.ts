import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 1800;

const RUNPOD_GENERATE_TRACK_URL = process.env.RUNPOD_GENERATE_TRACK_URL;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BENCHMARK_PROVIDER = "runpod_benchmark";
const BENCHMARK_DURATION_SECONDS = 180;
const BENCHMARK_MODEL = "facebook/musicgen-small";
const BENCHMARK_GPU_USD_PER_HOUR = Number.parseFloat(
  process.env.RUNPOD_BENCHMARK_GPU_USD_PER_HOUR || "0.70"
);
const POLL_INTERVAL_MS = 5000;
const MAX_BENCHMARK_SECONDS = 25 * 60;
const BENCHMARK_TITLE = "SoundioX RunPod 3 Minute Instrumental Benchmark";
const BENCHMARK_PROMPT =
  "Create a polished 3-minute instrumental electronic pop track for SoundioX benchmarking. No vocals, no spoken words. Include a clear intro, energetic main section, dynamic bridge, and complete ending.";

type BenchmarkMetadata = Record<string, unknown>;

function readRequiredEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase environment variables");
  }

  if (!RUNPOD_GENERATE_TRACK_URL) {
    throw new Error("RUNPOD_GENERATE_TRACK_URL missing");
  }

  if (!RUNPOD_API_KEY) {
    throw new Error("RUNPOD_API_KEY missing");
  }

  return {
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    runpodApiKey: RUNPOD_API_KEY,
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

function getRunpodRunUrl() {
  if (!RUNPOD_GENERATE_TRACK_URL) return "";
  const trimmed = RUNPOD_GENERATE_TRACK_URL.replace(/\/+$/, "");

  if (trimmed.endsWith("/run")) {
    return trimmed;
  }

  if (trimmed.endsWith("/runsync")) {
    return `${trimmed.slice(0, -"/runsync".length)}/run`;
  }

  return `${trimmed}/run`;
}

function getRunpodStatusUrl(jobId: string) {
  if (!RUNPOD_GENERATE_TRACK_URL) return "";
  const baseUrl = RUNPOD_GENERATE_TRACK_URL.replace(/\/+$/, "");

  if (baseUrl.endsWith("/runsync")) {
    return `${baseUrl.slice(0, -"/runsync".length)}/status/${encodeURIComponent(jobId)}`;
  }

  if (baseUrl.endsWith("/run")) {
    return `${baseUrl.slice(0, -"/run".length)}/status/${encodeURIComponent(jobId)}`;
  }

  return `${baseUrl}/status/${encodeURIComponent(jobId)}`;
}

function getRunpodEndpointShape(runUrl: string) {
  try {
    const parsed = new URL(runUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const endpointIdIndex = pathParts.indexOf("v2") + 1;
    const endpointIdPresent = endpointIdIndex > 0 && Boolean(pathParts[endpointIdIndex]);

    return {
      host: parsed.host,
      protocol: parsed.protocol.replace(":", ""),
      endsWithRun: pathParts[pathParts.length - 1] === "run",
      endpointIdPresent,
      pathShape: `/${pathParts
        .map((part, index) => (endpointIdPresent && index === endpointIdIndex ? "{endpoint_id}" : part))
        .join("/")}`,
    };
  } catch {
    return {
      host: null,
      protocol: null,
      endsWithRun: runUrl.replace(/\/+$/, "").endsWith("/run"),
      endpointIdPresent: false,
      pathShape: "invalid-url",
    };
  }
}

function pickAudioUrl(parsed: any) {
  const candidates = [
    parsed?.output?.audio_url,
    parsed?.output?.audioUrl,
    parsed?.output?.output?.audio_url,
    parsed?.output?.output?.audioUrl,
    parsed?.output?.track?.audio_url,
    parsed?.output?.track?.audioUrl,
    parsed?.output?.url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function pickFailureReason(parsed: any, fallback: string) {
  const candidates = [
    parsed?.error,
    parsed?.output?.error,
    parsed?.output?.message,
    parsed?.message,
    parsed?.detail,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
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
    "provider_job_id",
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

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`RunPod returned non-JSON response: ${text.slice(0, 2000)}`);
  }
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
    generation_intent: "runpod_3_minute_cost_benchmark",
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
    throw new Error(`generation_jobs benchmark insert failed: ${error.message}`);
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
    console.error("RUNPOD_BENCHMARK_JOB_UPDATE_FAILED", {
      generationJobId: args.generationJobId,
      message: error.message,
    });
  }
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const benchmarkStartedMs = Date.now();
  const startedAtIso = new Date(benchmarkStartedMs).toISOString();
  let generationJobId: string | null = null;
  let runpodEndpointShape: ReturnType<typeof getRunpodEndpointShape> | null = null;

  try {
    const { supabaseUrl, serviceRoleKey, runpodApiKey } = readRequiredEnv();
    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const generationJobColumns = await getGenerationJobColumns(serviceClient);
    const runUrl = getRunpodRunUrl();
    runpodEndpointShape = getRunpodEndpointShape(runUrl);
    const gpuUsdPerHour = Number.isFinite(BENCHMARK_GPU_USD_PER_HOUR)
      ? BENCHMARK_GPU_USD_PER_HOUR
      : null;
    const initialMetadata: BenchmarkMetadata = {
      benchmark: true,
      route: "/api/dev/runpod-music-benchmark",
      provider: "runpod",
      requested_duration_seconds: BENCHMARK_DURATION_SECONDS,
      model: BENCHMARK_MODEL,
      runpod_endpoint_shape: runpodEndpointShape,
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

    console.log("RUNPOD_BENCHMARK_JOB_STARTED", {
      generationJobId,
      durationSeconds: BENCHMARK_DURATION_SECONDS,
      model: BENCHMARK_MODEL,
    });

    const startPayload = {
      input: {
        title: BENCHMARK_TITLE,
        prompt: BENCHMARK_PROMPT,
        finalDirection: BENCHMARK_PROMPT,
        vocalMode: "instrumental",
        durationSeconds: BENCHMARK_DURATION_SECONDS,
        requested_duration_seconds: BENCHMARK_DURATION_SECONDS,
        model: BENCHMARK_MODEL,
        max_new_tokens: 768,
        testMode: false,
        return_audio_url: true,
        benchmark: true,
      },
    };

    const startResponse = await fetchWithTimeout(
      runUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runpodApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(startPayload),
        cache: "no-store",
      },
      120 * 1000
    );
    const startJson = await parseJsonResponse(startResponse);

    if (!startResponse.ok) {
      throw new Error(
        `RunPod benchmark start failed (${startResponse.status}): ${JSON.stringify(startJson)}`
      );
    }

    const runpodJobId = typeof startJson?.id === "string" ? startJson.id.trim() : "";
    const startStatus = typeof startJson?.status === "string" ? startJson.status.trim() : "";

    if (!runpodJobId) {
      throw new Error(`RunPod benchmark start response missing id: ${JSON.stringify(startJson)}`);
    }

    const metadataWithRunpodJob: BenchmarkMetadata = {
      ...initialMetadata,
      runpod_job_id: runpodJobId,
      start_status: startStatus || null,
      start_response: startJson,
    };

    await updateBenchmarkJob({
      serviceClient,
      columns: generationJobColumns,
      generationJobId,
      updates: {
        provider_job_id: runpodJobId,
        provider_status: startStatus || "started",
        cost_metadata: metadataWithRunpodJob,
      },
    });

    const statusUrl = getRunpodStatusUrl(runpodJobId);
    const deadlineMs = benchmarkStartedMs + MAX_BENCHMARK_SECONDS * 1000;
    let finalStatusJson: any = null;
    let finalStatus = "";

    while (Date.now() < deadlineMs) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const statusResponse = await fetchWithTimeout(
        statusUrl,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${runpodApiKey}`,
          },
          cache: "no-store",
        },
        60 * 1000
      );
      const statusJson = await parseJsonResponse(statusResponse);

      if (!statusResponse.ok) {
        throw new Error(
          `RunPod benchmark status failed (${statusResponse.status}): ${JSON.stringify(statusJson)}`
        );
      }

      finalStatusJson = statusJson;
      finalStatus = typeof statusJson?.status === "string" ? statusJson.status.trim() : "";

      console.log("RUNPOD_BENCHMARK_POLL", {
        generationJobId,
        runpodJobId,
        status: finalStatus || "[missing]",
        executionTime: statusJson?.executionTime ?? null,
        delayTime: statusJson?.delayTime ?? null,
      });

      if (finalStatus === "COMPLETED" || finalStatus === "FAILED" || finalStatus === "CANCELLED") {
        break;
      }
    }

    const finishedMs = Date.now();
    const totalJobSeconds = secondsBetween(benchmarkStartedMs, finishedMs);
    const estimatedGpuCostUsd = estimateGpuCostUsd(totalJobSeconds);
    const outputAudioUrl = pickAudioUrl(finalStatusJson);
    const finalMetadata: BenchmarkMetadata = {
      ...metadataWithRunpodJob,
      completed_poll_status: finalStatus || null,
      total_job_seconds: totalJobSeconds,
      estimated_gpu_cost_usd: estimatedGpuCostUsd,
      gpu_usd_per_hour: gpuUsdPerHour,
      output_audio_url: outputAudioUrl,
      runpod_executionTime: finalStatusJson?.executionTime ?? null,
      runpod_delayTime: finalStatusJson?.delayTime ?? null,
      final_response: finalStatusJson,
    };

    if (finalStatus === "COMPLETED") {
      const completedAtIso = new Date(finishedMs).toISOString();

      await updateBenchmarkJob({
        serviceClient,
        columns: generationJobColumns,
        generationJobId,
        updates: {
          status: "completed",
          provider_status: "completed",
          completed_at: completedAtIso,
          audio_url: outputAudioUrl,
          cost_metadata: {
            ...finalMetadata,
            completed_at: completedAtIso,
          },
        },
      });

      const result = {
        ok: true,
        generationJobId,
        provider: BENCHMARK_PROVIDER,
        runpodJobId,
        runpodEndpointShape,
        requestedDurationSeconds: BENCHMARK_DURATION_SECONDS,
        model: BENCHMARK_MODEL,
        startedAt: startedAtIso,
        completedAt: completedAtIso,
        totalJobSeconds,
        gpuUsdPerHour,
        estimatedGpuCostUsd,
        outputAudioUrl,
        runpod: {
          status: finalStatus,
          executionTime: finalStatusJson?.executionTime ?? null,
          delayTime: finalStatusJson?.delayTime ?? null,
          response: finalStatusJson,
        },
      };

      console.log("RUNPOD_BENCHMARK_JOB_COMPLETED", result);
      return NextResponse.json(result);
    }

    const failureReason =
      finalStatus === ""
        ? `RunPod benchmark timed out after ${MAX_BENCHMARK_SECONDS} seconds.`
        : pickFailureReason(finalStatusJson, `RunPod benchmark ended with status ${finalStatus}.`);
    const failedAtIso = new Date(finishedMs).toISOString();

    await updateBenchmarkJob({
      serviceClient,
      columns: generationJobColumns,
      generationJobId,
      updates: {
        status: "failed",
        provider_status: finalStatus || "timeout",
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
      runpodJobId,
      runpodEndpointShape,
      requestedDurationSeconds: BENCHMARK_DURATION_SECONDS,
      model: BENCHMARK_MODEL,
      startedAt: startedAtIso,
      failedAt: failedAtIso,
      totalJobSeconds,
      gpuUsdPerHour,
      estimatedGpuCostUsd,
      outputAudioUrl,
      failureReason,
      runpod: {
        status: finalStatus || "TIMEOUT",
        executionTime: finalStatusJson?.executionTime ?? null,
        delayTime: finalStatusJson?.delayTime ?? null,
        response: finalStatusJson,
      },
    };

    console.error("RUNPOD_BENCHMARK_JOB_FAILED", result);
    return NextResponse.json(result, { status: finalStatus ? 502 : 504 });
  } catch (error: any) {
    const failedMs = Date.now();
    const failedAtIso = new Date(failedMs).toISOString();
    const totalJobSeconds = secondsBetween(benchmarkStartedMs, failedMs);
    const message = error?.name === "AbortError"
      ? "RunPod benchmark request timed out."
      : error?.message || "RunPod benchmark failed.";

    console.error("RUNPOD_BENCHMARK_JOB_FAILED", {
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
              route: "/api/dev/runpod-music-benchmark",
              provider: "runpod",
              requested_duration_seconds: BENCHMARK_DURATION_SECONDS,
              model: BENCHMARK_MODEL,
              runpod_endpoint_shape: runpodEndpointShape,
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
      console.error("RUNPOD_BENCHMARK_FAILURE_UPDATE_FAILED", {
        message: updateError?.message || "Failed to update benchmark failure.",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        generationJobId,
        provider: BENCHMARK_PROVIDER,
        runpodEndpointShape,
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
