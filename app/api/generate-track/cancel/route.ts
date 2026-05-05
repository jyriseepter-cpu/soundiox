import { NextRequest, NextResponse } from "next/server";

const RUNPOD_GENERATE_TRACK_URL = process.env.RUNPOD_GENERATE_TRACK_URL;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;

export const runtime = "nodejs";

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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";

  if (!jobId) {
    return NextResponse.json(
      {
        ok: false,
        cancelled: false,
        message: "jobId is required",
        details: "Provide a RunPod jobId to cancel.",
        runpod: null,
      },
      { status: 400 }
    );
  }

  const endpoint = getRunpodCancelUrl(jobId);
  if (!endpoint) {
    return NextResponse.json(
      {
        ok: false,
        cancelled: false,
        message: "RunPod cancel endpoint unavailable",
        details: "RUNPOD_GENERATE_TRACK_URL is missing.",
        runpod: null,
      },
      { status: 500 }
    );
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
    let parsed: any = null;

    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text || null;
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          cancelled: false,
          available: false,
          message: "RunPod cancel returned a non-OK response.",
          details: `RunPod responded with ${response.status} ${response.statusText}.`,
          runpod: parsed,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      cancelled: true,
      available: true,
      jobId,
      message: "RunPod cancel request sent.",
      details: text || "RunPod accepted the cancel request.",
      runpod: parsed,
    });
  } catch (error: any) {
    console.log("RUNPOD CANCEL RESPONSE STATUS:", "[FETCH FAILED]");
    console.log("RUNPOD CANCEL RESPONSE BODY:", error?.message || "Cancel request failed");
    return NextResponse.json(
      {
        ok: false,
        cancelled: false,
        available: false,
        message: "RunPod cancel request failed.",
        details: error?.message || "Cancel request failed",
        runpod: null,
      },
      { status: 500 }
    );
  }
}
