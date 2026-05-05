import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ProducerBody = {
  prompt?: string;
};

type ProducerResult = {
  improved_prompt: string;
  style: string;
  mood: string;
  structure: string;
  lyrics: string;
};

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

function safeParseResult(text: string): ProducerResult | null {
  try {
    const parsed = JSON.parse(text);
    const improvedPrompt = String(parsed?.improved_prompt || "").trim();
    const style = String(parsed?.style || "").trim();
    const mood = String(parsed?.mood || "").trim();
    const structure = String(parsed?.structure || "").trim();
    const lyrics = String(parsed?.lyrics || "").trim();

    if (!improvedPrompt || !style || !mood || !structure) return null;

    return {
      improved_prompt: improvedPrompt,
      style,
      mood,
      structure,
      lyrics,
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as ProducerBody | null;
    const prompt = String(body?.prompt || "").trim();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const instructions = [
      "You are SoundioX AI Producer.",
      "Transform rough music ideas into clear, structured generation prompts.",
      "Be fast, concise, and practical.",
      "Focus on clarity over creativity overload.",
      "Infer and sharpen:",
      "- genre/style",
      "- mood",
      "- instruments",
      "- structure such as intro, chorus, drop, bridge, outro",
      "Return only valid JSON with this exact shape:",
      '{',
      '  "improved_prompt": "string",',
      '  "style": "string",',
      '  "mood": "string",',
      '  "structure": "string",',
      '  "lyrics": "string"',
      '}',
      "The improved_prompt must be a short structured music prompt that naturally includes style, mood, instruments, and structure.",
      "Keep style and mood short and direct.",
      'Always generate a simple structure like "Intro - Verse - Chorus - Drop - Outro".',
      "If the prompt suggests vocals, songs, singing, chorus, topline, or lyrics, generate simple catchy lyrics.",
      "If the prompt is instrumental-only, return an empty string for lyrics.",
      "Lyrics must be short: 8 to 12 lines maximum.",
      "Lyrics must be simple, catchy, and match the style and mood.",
      "Do not include markdown fences.",
      "Do not include explanations.",
    ].join("\n");

    const input = `ROUGH_PROMPT: ${prompt}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        instructions,
        input,
        max_output_tokens: 180,
        text: {
          verbosity: "low",
        },
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || "Producer request failed" },
        { status: response.status }
      );
    }

    const text = extractOutputText(payload);
    const result = safeParseResult(text);

    if (!result) {
      return NextResponse.json({ error: "Invalid producer response" }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected producer error" },
      { status: 500 }
    );
  }
}
