import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ArtworkConceptBody = {
  projectName?: string;
  title?: string;
  genre?: string;
  artworkDirection?: string;
  musicDirection?: string;
  lyricsDirection?: string;
  mixerSummary?: string;
  currentArtworkConcept?: string;
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

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as ArtworkConceptBody | null;
    const projectName = stringValue(body?.projectName);
    const title = stringValue(body?.title);
    const genre = stringValue(body?.genre);
    const artworkDirection = stringValue(body?.artworkDirection);
    const musicDirection = stringValue(body?.musicDirection);
    const lyricsDirection = stringValue(body?.lyricsDirection);
    const mixerSummary = stringValue(body?.mixerSummary);
    const currentArtworkConcept = stringValue(body?.currentArtworkConcept);

    const instructions = [
      "You are SoundioX Studio's cover-art director.",
      "Create cover-art direction for an AI music release.",
      "Avoid copyrighted artist names, brand logos, and trademarked visual identities.",
      "Avoid real person likeness unless a user explicitly provides one later.",
      "Make the result square album-cover friendly with a strong visual identity.",
      "Match the project, title, genre, mood, lyrics direction, and mix energy.",
      "Return only valid JSON with these keys:",
      "concept: string",
      "imagePrompt: string suitable for a future image model",
      "palette: string",
      "styleTags: string[]",
      "summary: string",
    ].join("\n");

    const input = [
      `PROJECT_NAME: ${projectName || "Untitled Studio project"}`,
      `TITLE: ${title || "Untitled release"}`,
      `GENRE: ${genre || "Not specified"}`,
      `ARTWORK_DIRECTION: ${artworkDirection || "No artwork direction provided."}`,
      `MUSIC_DIRECTION: ${musicDirection || "No music direction provided."}`,
      `LYRICS_DIRECTION: ${lyricsDirection || "No lyrics direction provided."}`,
      `MIXER_SUMMARY: ${mixerSummary || "No mixer summary provided."}`,
      `CURRENT_ARTWORK_CONCEPT: ${currentArtworkConcept || "None."}`,
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
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || "Artwork concept request failed" },
        { status: response.status }
      );
    }

    const outputText = extractOutputText(payload);
    const parsed = parseJsonObject(outputText);
    if (!parsed) {
      return NextResponse.json({ error: "Artwork concept response was not valid JSON" }, { status: 502 });
    }

    const concept = stringValue(parsed.concept);
    const imagePrompt = stringValue(parsed.imagePrompt);
    const palette = stringValue(parsed.palette);
    const summary = stringValue(parsed.summary);
    const styleTags = Array.isArray(parsed.styleTags)
      ? parsed.styleTags.map((tag: unknown) => stringValue(tag)).filter(Boolean).slice(0, 8)
      : [];

    if (!concept || !imagePrompt || !palette || !summary) {
      return NextResponse.json({ error: "Artwork concept response was incomplete" }, { status: 502 });
    }

    return NextResponse.json({
      concept,
      imagePrompt,
      palette,
      styleTags,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected artwork concept error" },
      { status: 500 }
    );
  }
}
