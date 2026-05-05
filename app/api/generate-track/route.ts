import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const RUNPOD_GENERATE_TRACK_URL = process.env.RUNPOD_GENERATE_TRACK_URL;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_START_TIMEOUT_MS = 120 * 1000;

type GenerateTrackBody = {
  title?: string;
  finalDirection?: string;
  vocalMode?: string;
  clientGenerationToken?: string;
  artistIdentity?: {
    voiceType?: string;
    profileId?: string;
  };
};

export const runtime = "nodejs";

type GenerationLock = {
  expiresAt: number;
  resultPromise: Promise<{
    jobId: string;
    status: string;
  }>;
};

const LOCK_TTL_MS = 3 * 60 * 1000;
const generationLocks = new Map<string, GenerationLock>();

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function getRunpodRunUrl() {
  if (!RUNPOD_GENERATE_TRACK_URL) return "";

  if (RUNPOD_GENERATE_TRACK_URL.endsWith("/runsync")) {
    return `${RUNPOD_GENERATE_TRACK_URL.slice(0, -"runsync".length)}run`;
  }

  if (RUNPOD_GENERATE_TRACK_URL.endsWith("/run")) {
    return RUNPOD_GENERATE_TRACK_URL;
  }

  return `${RUNPOD_GENERATE_TRACK_URL.replace(/\/+$/, "")}/run`;
}

function cleanupExpiredLocks() {
  const now = Date.now();

  for (const [key, value] of generationLocks.entries()) {
    if (value.expiresAt <= now) {
      generationLocks.delete(key);
    }
  }
}

function buildStablePromptKey(input: {
  title: string;
  finalDirection: string;
  vocalMode: string;
  artistIdentity?: {
    voiceType?: string;
    profileId?: string;
  };
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title,
        finalDirection: input.finalDirection,
        vocalMode: input.vocalMode,
        artistIdentity: input.artistIdentity ?? null,
      })
    )
    .digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateTrackBody;
    const title = body.title?.trim() || "";
    const finalDirection = body.finalDirection?.trim() || "";
    const vocalMode = body.vocalMode?.trim() || "";
    const clientGenerationToken = body.clientGenerationToken?.trim() || "";
    const artistIdentity =
      body.artistIdentity && typeof body.artistIdentity === "object"
        ? {
            voiceType: body.artistIdentity.voiceType?.trim() || undefined,
            profileId: body.artistIdentity.profileId?.trim() || undefined,
          }
        : undefined;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!finalDirection) {
      return NextResponse.json({ error: "Final direction is required" }, { status: 400 });
    }

    if (!vocalMode) {
      return NextResponse.json({ error: "Vocal mode is required" }, { status: 400 });
    }

    cleanupExpiredLocks();

    const endpoint = getRunpodRunUrl();
    if (!endpoint) {
      return NextResponse.json(
        { error: "RUNPOD_GENERATE_TRACK_URL missing" },
        { status: 500 }
      );
    }

    if (!RUNPOD_API_KEY) {
      return NextResponse.json(
        { error: "RUNPOD_API_KEY missing" },
        { status: 500 }
      );
    }

    const lockKey =
      clientGenerationToken ||
      buildStablePromptKey({
        title,
        finalDirection,
        vocalMode,
        artistIdentity,
      });
    const existingLock = generationLocks.get(lockKey);

    if (existingLock && existingLock.expiresAt > Date.now()) {
      const existingResult = await existingLock.resultPromise;
      return NextResponse.json(existingResult);
    }

    const payload = {
      input: {
        title,
        finalDirection,
        vocalMode,
        artistIdentity: artistIdentity ?? null,
        prompt: finalDirection,
        durationSeconds: 15,
        max_new_tokens: 768,
        testMode: true,
        return_audio_url: true,
      },
    };

    const resultPromise = (async () => {
      let response: Response;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RUNPOD_START_TIMEOUT_MS);
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RUNPOD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("RunPod start request timed out after 120s");
        }
        console.error("RUNPOD START FETCH ERROR:", serializeError(error));
        throw new Error("RunPod start request failed");
      }

      const text = await response.text();
      clearTimeout(timeout);
      console.log("RUNPOD START RESPONSE STATUS:", response.status, response.statusText);
      console.log("RUNPOD START RESPONSE BODY:", text);

      if (!response.ok) {
        throw new Error(`RunPod request failed (${response.status}) ${text}`);
      }

      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`RunPod returned non-JSON response: ${text}`);
      }

      const jobId = typeof parsed?.id === "string" ? parsed.id.trim() : "";
      const status = typeof parsed?.status === "string" ? parsed.status.trim() : "";

      if (!jobId || !status) {
        throw new Error(
          `RunPod start response missing id or status: ${JSON.stringify(parsed)}`
        );
      }

      console.log("RUNPOD JOB ID:", jobId);

      return { jobId, status };
    })();

    generationLocks.set(lockKey, {
      expiresAt: Date.now() + LOCK_TTL_MS,
      resultPromise,
    });

    try {
      const result = await resultPromise;
      generationLocks.set(lockKey, {
        expiresAt: Date.now() + LOCK_TTL_MS,
        resultPromise: Promise.resolve(result),
      });
      return NextResponse.json(result);
    } catch (error) {
      generationLocks.delete(lockKey);
      throw error;
    }
  } catch (error: any) {
    console.error("GENERATE TRACK ERROR:", serializeError(error));
    return NextResponse.json(
      {
        error: error?.message || "Unexpected generate-track error",
      },
      { status: 500 }
    );
  }
}
