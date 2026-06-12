import { NextRequest, NextResponse } from "next/server";
import { listTrackVersionsByGroupId } from "../generationJobStore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const trackGroupId = request.nextUrl.searchParams.get("trackGroupId")?.trim() || "";

  if (!trackGroupId) {
    return NextResponse.json(
      {
        error: "trackGroupId is required",
      },
      { status: 400 }
    );
  }

  try {
    const versions = await listTrackVersionsByGroupId(trackGroupId);

    return NextResponse.json({
      trackGroupId,
      versions,
    });
  } catch (error: any) {
    console.error("TRACK VERSIONS FETCH ERROR:", error?.message || error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to load track versions",
      },
      { status: 500 }
    );
  }
}
