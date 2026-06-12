import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const trackVersionId = String(body?.trackVersionId || "").trim();
  const trackGroupId = String(body?.trackGroupId || "").trim();
  const audioUrl = String(body?.audioUrl || "").trim();
  const userId = String(body?.userId || "").trim();
  const outputPrefix = String(body?.outputPrefix || "").trim();

  console.log("DEV MOCK STEM WORKER INPUT", {
    trackVersionId: trackVersionId || null,
    trackGroupId: trackGroupId || null,
    userId: userId || null,
    outputPrefix: outputPrefix || null,
    hasAudioUrl: Boolean(audioUrl),
  });

  if (!trackVersionId || !trackGroupId || !audioUrl || !userId || !outputPrefix) {
    return NextResponse.json(
      {
        error: "Missing required mock stem worker payload fields",
        required: ["trackVersionId", "trackGroupId", "audioUrl", "userId", "outputPrefix"],
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    drumsUrl: audioUrl,
    bassUrl: audioUrl,
    vocalsUrl: audioUrl,
    otherUrl: audioUrl,
    metadata: {
      mockRemoteWorker: true,
      provider: "dev-mock-stem-worker",
    },
  });
}
