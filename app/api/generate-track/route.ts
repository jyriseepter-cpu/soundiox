import { NextRequest, NextResponse } from "next/server";

// Set GENERATION_PROVIDER=runpod or modal in env to switch providers
// Set MODAL_GENERATE_TRACK_URL=<Modal deployed endpoint URL> to forward modal requests
const DEFAULT_PROVIDER = process.env.GENERATION_PROVIDER || "mock";
const MODAL_GENERATE_TRACK_URL = process.env.MODAL_GENERATE_TRACK_URL;

type GenerateTrackBody = {
  title?: string;
  finalDirection?: string;
  vocalMode?: string;
  artistIdentity?: {
    voiceType?: string;
    profileId?: string;
  };
};

export const runtime = "nodejs";

async function handleMockGeneration(payload: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  artistIdentity?: GenerateTrackBody["artistIdentity"];
}) {
  console.log("MOCK GENERATION");

  return {
    success: true,
    provider: "mock",
    mock: true,
    track: {
      id: `mock_${Date.now()}`,
      title: payload.title,
      duration: 180,
      status: "generated",
      previewUrl: null,
    },
    input: {
      finalDirection: payload.finalDirection,
      vocalMode: payload.vocalMode,
    },
  };
}

async function handleRunpodGeneration(payload: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  artistIdentity?: GenerateTrackBody["artistIdentity"];
}) {
  console.log("RUNPOD GENERATION (stub)");

  return {
    success: true,
    provider: "runpod",
    stub: true,
    message: "RunPod provider not connected yet",
    track: {
      id: `mock_${Date.now()}`,
      title: payload.title,
      duration: 180,
      status: "generated",
      previewUrl: null,
    },
  };
}

async function handleModalGeneration(payload: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  artistIdentity?: GenerateTrackBody["artistIdentity"];
}) {
  if (!MODAL_GENERATE_TRACK_URL) {
    return handleModalBenchmark(payload);
  }

  const start = Date.now();
  console.log("MODAL GENERATION START");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const response = await fetch(MODAL_GENERATE_TRACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: payload.title,
        finalDirection: payload.finalDirection,
        vocalMode: payload.vocalMode,
      }),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        result?.error || `Modal generate-track request failed with status ${response.status}`
      );
    }

    const durationMs = Date.now() - start;
    console.log("MODAL GENERATION END");
    console.log("DURATION:", durationMs / 1000, "sec");

    return result;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Modal generate-track request timed out after 10 minutes");
    }

    throw new Error(error?.message || "Modal generate-track request failed");
  } finally {
    clearTimeout(timeout);
  }
}

// Modal benchmark mode simulates generation to measure flow before real GPU integration
async function handleModalBenchmark(payload: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  artistIdentity?: GenerateTrackBody["artistIdentity"];
}) {
  const start = Date.now();

  console.log("MODAL BENCHMARK START");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const end = Date.now();
  const durationMs = end - start;
  const durationSec = durationMs / 1000;
  const estimatedCost = durationSec * 0.0003;

  console.log("MODAL BENCHMARK END");
  console.log("DURATION:", durationSec, "sec");
  console.log("ESTIMATED COST:", estimatedCost);

  return {
    success: true,
    provider: "modal",
    benchmark: true,
    timing: {
      durationSec,
      durationMs,
    },
    cost: {
      estimated: estimatedCost,
    },
    track: {
      id: `modal_${Date.now()}`,
      title: payload.title,
      duration: 180,
      status: "generated",
      previewUrl: null,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateTrackBody;
    const title = body.title?.trim() || "";
    const finalDirection = body.finalDirection?.trim() || "";
    const vocalMode = body.vocalMode?.trim() || "";

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!finalDirection) {
      return NextResponse.json({ error: "Final direction is required" }, { status: 400 });
    }

    if (!vocalMode) {
      return NextResponse.json({ error: "Vocal mode is required" }, { status: 400 });
    }

    const payload = {
      title,
      finalDirection,
      vocalMode,
      artistIdentity: body.artistIdentity,
    };

    const provider = DEFAULT_PROVIDER;

    console.log("GENERATION PROVIDER:", provider);
    console.log("PAYLOAD:", payload);
    if (provider === "modal") {
      console.log("FINAL DIRECTION:", payload.finalDirection);
    }

    let result;

    if (provider === "modal") {
      result = await handleModalGeneration(payload);
    } else if (provider === "runpod") {
      result = await handleRunpodGeneration(payload);
    } else {
      result = await handleMockGeneration(payload);
    }

    return NextResponse.json({
      success: true,
      provider,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Unexpected generate-track error",
      },
      { status: 500 }
    );
  }
}
