import { NextRequest, NextResponse } from "next/server";

const RUNPOD_GENERATE_TRACK_URL = process.env.RUNPOD_GENERATE_TRACK_URL;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const MAX_POLL_SECONDS = 180;

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

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim() || "";
  const title = request.nextUrl.searchParams.get("title")?.trim() || "Generated track";
  const startedAt = Number(request.nextUrl.searchParams.get("startedAt") || "");

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

  if (status === "IN_QUEUE" || status === "IN_PROGRESS") {
    if (exceededClientTimeout || exceededRunpodTimeout) {
      const cancellation = await cancelRunpodJob(jobId);
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
