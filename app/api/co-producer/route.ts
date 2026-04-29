import { NextRequest, NextResponse } from "next/server";

type CoProducerMode = "music" | "lyrics" | "artwork" | "voiceover" | "edit";

type RequestBody = {
  mode?: CoProducerMode;
  idea?: string;
  currentDirection?: string;
  userRequest?: string;
  remaining?: number;
};

export const runtime = "nodejs";

function buildModeInstructions(mode: CoProducerMode) {
  if (mode === "music") {
    return [
      "You are SoundioX Co-Producer.",
      "Respond concisely.",
      "Output only this structure:",
      "STYLE:",
      "MOOD:",
      "TEMPO:",
      "STRUCTURE:",
      "SOUND DESIGN:",
      "VOCALS:",
      "REFERENCE FEEL:",
      "Keep each line short and practical.",
    ].join("\n");
  }

  if (mode === "lyrics") {
    return [
      "You are SoundioX Co-Producer.",
      "Generate or improve lyrics with a strong hook and emotional clarity.",
      "Keep it concise.",
      "Return only the lyric or lyric rewrite with no explanation.",
    ].join("\n");
  }

  if (mode === "artwork") {
    return [
      "You are SoundioX Co-Producer.",
      "Generate concise premium streaming cover art direction.",
      "No long explanations.",
      "Return only the artwork direction text.",
    ].join("\n");
  }

  if (mode === "voiceover") {
    return [
      "You are SoundioX Co-Producer.",
      "Write a short spoken or voiceover script.",
      "Maximum 2 to 3 sentences.",
      "Return only the script.",
    ].join("\n");
  }

  return [
    "You are SoundioX Co-Producer.",
    "Give practical studio edit advice based on the current direction and user request.",
    "Maximum 80 words.",
    "Return only the advice.",
  ].join("\n");
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const body = (await request.json()) as RequestBody;
    const mode = body.mode;
    const idea = body.idea?.trim() || "";
    const currentDirection = body.currentDirection?.trim() || "";
    const userRequest = body.userRequest?.trim() || "";
    const remaining =
      typeof body.remaining === "number" ? Math.max(0, Math.floor(body.remaining)) : 0;

    if (!mode || !["music", "lyrics", "artwork", "voiceover", "edit"].includes(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    const instructions = buildModeInstructions(mode);
    const prompt = [
      `MODE: ${mode}`,
      `IDEA: ${idea || "None provided."}`,
      `CURRENT_DIRECTION: ${currentDirection || "None provided."}`,
      `USER_REQUEST: ${userRequest || "Generate a concise helpful response."}`,
    ].join("\n\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        instructions,
        input: prompt,
        max_output_tokens: 250,
        text: {
          verbosity: "medium",
        },
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload?.error?.message || "Co-producer request failed",
        },
        { status: response.status }
      );
    }

    const result = extractOutputText(payload);

    if (!result) {
      return NextResponse.json({ error: "Empty co-producer response" }, { status: 502 });
    }

    return NextResponse.json({
      result,
      usage: {
        remaining: Math.max(0, remaining - 1),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Unexpected co-producer error",
      },
      { status: 500 }
    );
  }
}
