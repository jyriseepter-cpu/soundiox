import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateTrackBody;

    console.log("generate-track payload", body);

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

    console.log("MOCK GENERATION");

    return NextResponse.json({
      success: true,
      mock: true,
      track: {
        id: `mock_${Date.now()}`,
        title,
        duration: 180,
        status: "generated",
        previewUrl: null,
      },
      input: {
        finalDirection,
        vocalMode,
      },
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
