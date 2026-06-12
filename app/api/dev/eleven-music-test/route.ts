import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "tracks";
const TEST_DURATION_MS = 10000;
const TEST_PROMPT =
  "Short emotional electronic pop song with clear singing vocal. Lyrics: [Verse] We are made of neon light [Chorus] SoundioX, take me higher";

function readRequiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return { supabaseUrl, serviceRoleKey };
}

function logElevenLabsResponse(args: {
  status: number;
  headers: Headers;
  body?: string;
  contentType?: string;
}) {
  const safeHeaders = {
    "content-type": args.headers.get("content-type"),
    "content-length": args.headers.get("content-length"),
    "x-trace-id": args.headers.get("x-trace-id"),
    "x-region": args.headers.get("x-region"),
    date: args.headers.get("date"),
  };

  console.log("Eleven Music test response", {
    status: args.status,
    headers: safeHeaders,
    contentType: args.contentType,
    body: args.body ? args.body.slice(0, 2000) : undefined,
  });
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Eleven Music smoke test is disabled in production." },
      { status: 404 }
    );
  }

  try {
    const { supabaseUrl, serviceRoleKey } = readRequiredEnv();

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured." }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120 * 1000);

    try {
      const elevenResponse = await fetch(
        "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_id: "music_v1",
            music_length_ms: TEST_DURATION_MS,
            force_instrumental: false,
            prompt: TEST_PROMPT,
          }),
          signal: controller.signal,
        }
      );

      const contentType = elevenResponse.headers.get("content-type") || "";

      if (!elevenResponse.ok) {
        const errorText = await elevenResponse.text().catch(() => "");
        logElevenLabsResponse({
          status: elevenResponse.status,
          headers: elevenResponse.headers,
          body: errorText,
          contentType,
        });

        return NextResponse.json(
          {
            error: "ElevenLabs Music generation failed.",
            provider: "eleven_music",
            status: elevenResponse.status,
            code: elevenResponse.statusText,
            message: errorText || `ElevenLabs failed with status ${elevenResponse.status}`,
          },
          { status: elevenResponse.status }
        );
      }

      const audioBuffer = await elevenResponse.arrayBuffer();
      logElevenLabsResponse({
        status: elevenResponse.status,
        headers: elevenResponse.headers,
        contentType,
      });

      if (!audioBuffer.byteLength) {
        return NextResponse.json(
          {
            error: "ElevenLabs Music returned an empty audio response.",
            provider: "eleven_music",
            status: elevenResponse.status,
          },
          { status: 502 }
        );
      }

      const timestamp = Date.now();
      const storagePath = `ai-generated/eleven-music-test/${timestamp}.mp3`;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`;
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "audio/mpeg",
          "x-upsert": "true",
        },
        body: audioBuffer,
      });
      const uploadText = await uploadResponse.text().catch(() => "");

      if (!uploadResponse.ok) {
        console.error("Eleven Music test upload failed", {
          status: uploadResponse.status,
          body: uploadText.slice(0, 2000),
          storagePath,
        });

        return NextResponse.json(
          {
            error: uploadText || `Supabase upload failed with status ${uploadResponse.status}`,
            provider: "eleven_music",
            storagePath,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        audioUrl: `${supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${storagePath}`,
        provider: "eleven_music",
        durationMs: TEST_DURATION_MS,
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return NextResponse.json(
          { error: "Eleven Music smoke test timed out after 120 seconds.", provider: "eleven_music" },
          { status: 504 }
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.error("Eleven Music smoke test unexpected error", {
      message: error?.message || "Unexpected error",
    });

    return NextResponse.json(
      {
        error: error?.message || "Unexpected Eleven Music smoke test error",
        provider: "eleven_music",
      },
      { status: 500 }
    );
  }
}
