import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type LyricsAction = "generate" | "improve_hook" | "make_emotional" | "rewrite_chorus";

type LyricsBody = {
  action?: LyricsAction;
  projectName?: string;
  title?: string;
  genre?: string;
  mood?: string;
  energy?: string;
  vibe?: string;
  theme?: string;
  hook?: string;
  language?: string;
  lyricsPrompt?: string;
  lyricsDirection?: string;
  currentLyrics?: string;
  vocalMode?: string;
};

const supportedActions: LyricsAction[] = [
  "generate",
  "improve_hook",
  "make_emotional",
  "rewrite_chorus",
];

function normalizeAction(value: unknown): LyricsAction {
  return supportedActions.includes(value as LyricsAction) ? (value as LyricsAction) : "generate";
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

function parseLyricsResponse(text: string) {
  try {
    const parsed = JSON.parse(text);
    const lyrics = String(parsed?.lyrics || "").trim();
    const summary = String(parsed?.summary || "").trim();
    const action = String(parsed?.action || "").trim();

    if (!lyrics || !summary) return null;

    return {
      lyrics,
      summary,
      action,
    };
  } catch {
    return null;
  }
}

function detectEstonianLanguage(values: string[], requestedLanguage: string) {
  const normalizedLanguage = requestedLanguage.trim().toLowerCase();
  if (["et", "ee", "estonian", "eesti", "est"].includes(normalizedLanguage)) return true;

  const text = values.join(" ").toLowerCase();
  if (/[õäöüšž]/i.test(text)) return true;

  const estonianSignals = [
    "eesti",
    "eestikeel",
    "eestikeelne",
    "tallinn",
    "öö",
    "süda",
    "südame",
    "päike",
    "tuul",
    "meri",
    "laul",
    "laulusõnad",
    "refrään",
    "salm",
    "igatsus",
    "valgus",
    "varjud",
    "linnatuled",
  ];

  return estonianSignals.some((signal) => text.includes(signal));
}

function getActionInstruction(action: LyricsAction, hasCurrentLyrics: boolean) {
  if (action === "improve_hook") {
    return hasCurrentLyrics
      ? "Improve the hook and chorus repeatability in the existing lyrics while preserving the best lines."
      : "Write new lyrics with an especially short, memorable, repeatable hook.";
  }

  if (action === "make_emotional") {
    return hasCurrentLyrics
      ? "Make the existing lyrics more emotionally direct, specific, and singable."
      : "Write new lyrics with emotional clarity, intimate verses, and a direct chorus payoff.";
  }

  if (action === "rewrite_chorus") {
    return hasCurrentLyrics
      ? "Keep useful verse material, but rewrite the chorus for a stronger payoff and clearer hook."
      : "Write new lyrics with a clearly marked chorus that has a strong resolution line.";
  }

  return hasCurrentLyrics
    ? "Improve and complete the existing lyrics instead of starting from scratch."
    : "Write complete usable song lyrics from scratch.";
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as LyricsBody | null;
    const action = normalizeAction(body?.action);
    const projectName = String(body?.projectName || "").trim();
    const title = String(body?.title || "").trim();
    const genre = String(body?.genre || "").trim();
    const mood = String(body?.mood || "").trim();
    const energy = String(body?.energy || "").trim();
    const vibe = String(body?.vibe || "").trim();
    const theme = String(body?.theme || "").trim();
    const hook = String(body?.hook || "").trim();
    const language = String(body?.language || "").trim();
    const lyricsPrompt = String(body?.lyricsPrompt || "").trim();
    const lyricsDirection = String(body?.lyricsDirection || "").trim();
    const currentLyrics = String(body?.currentLyrics || "").trim();
    const vocalMode = String(body?.vocalMode || "").trim();
    const hasCurrentLyrics = Boolean(currentLyrics);
    const writeInEstonian = detectEstonianLanguage(
      [title, genre, mood, energy, vibe, theme, hook, lyricsPrompt, lyricsDirection, currentLyrics],
      language
    );

    const instructions = [
      "You are SoundioX Studio Lyrics.",
      "You are a professional songwriter creating original lyrics for AI music generation.",
      "Return only valid JSON with this exact shape:",
      '{ "lyrics": "string", "summary": "string", "action": "string" }',
      "The lyrics field must contain only the song lyrics, with clear section labels.",
      "Use this structure unless the current lyrics strongly imply a better one: [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Final Chorus].",
      "Do not put explanations, notes, markdown fences, or commentary inside lyrics.",
      "The summary field must be separate from lyrics and summarize what changed in one concise sentence.",
      "Keep the lyrics concise, singable, emotionally clear, and suitable for a music generation model.",
      "Use natural phrasing, strong internal rhythm, and a memorable hook line that can repeat cleanly.",
      "Match the supplied genre, mood, energy, vibe, theme, hook idea, direction, prompt, title, and vocal mode.",
      writeInEstonian
        ? "Write in natural singable Estonian. Do not translate English literally. Use idiomatic Estonian, natural word order, clean vowel flow, and chorus lines that feel easy to sing."
        : "Write in the natural language implied by the user's prompt. If no non-English language is implied, write in English.",
      hasCurrentLyrics
        ? "Current lyrics are provided. Edit, improve, and complete them instead of discarding them."
        : "No current lyrics are provided. Start from scratch.",
    ].join("\n");

    const input = [
      `ACTION: ${action}`,
      `ACTION_INSTRUCTION: ${getActionInstruction(action, hasCurrentLyrics)}`,
      `PROJECT_NAME: ${projectName || "Untitled Studio project"}`,
      `TITLE: ${title || "Untitled track"}`,
      `GENRE: ${genre || "Unspecified"}`,
      `MOOD: ${mood || "Co-producer decides."}`,
      `ENERGY: ${energy || "Co-producer decides."}`,
      `VIBE: ${vibe || "Co-producer decides."}`,
      `THEME: ${theme || lyricsDirection || lyricsPrompt || "Co-producer decides."}`,
      `HOOK_IDEA: ${hook || "Create a memorable hook."}`,
      `LANGUAGE: ${writeInEstonian ? "Estonian / eesti" : language || "Infer from prompt."}`,
      `VOCAL_MODE: ${vocalMode || "Unspecified"}`,
      `LYRICS_PROMPT: ${lyricsPrompt || "None provided."}`,
      `LYRICS_DIRECTION: ${lyricsDirection || "None provided."}`,
      `CURRENT_LYRICS:\n${currentLyrics || "None provided."}`,
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
        input,
        max_output_tokens: 700,
        text: {
          verbosity: "medium",
        },
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || "Lyrics request failed" },
        { status: response.status }
      );
    }

    const text = extractOutputText(payload);
    const result = parseLyricsResponse(text);

    if (!result) {
      return NextResponse.json({ error: "Invalid lyrics response" }, { status: 502 });
    }

    return NextResponse.json({
      lyrics: result.lyrics,
      summary: result.summary,
      action: result.action || action,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected lyrics error" },
      { status: 500 }
    );
  }
}
