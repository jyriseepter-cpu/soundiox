import { NextRequest, NextResponse } from "next/server";

// Set GENERATION_PROVIDER=runpod or modal in env to switch providers
const DEFAULT_PROVIDER = process.env.GENERATION_PROVIDER || "mock";

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
  console.log("MODAL GENERATION (stub)");

  return {
    success: true,
    provider: "modal",
    stub: true,
    message: "Modal provider not connected yet",
    track: {
      id: `mock_${Date.now()}`,
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

    let result;

    if (provider === "runpod") {
      result = await handleRunpodGeneration(payload);
    } else if (provider === "modal") {
      result = await handleModalGeneration(payload);
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
