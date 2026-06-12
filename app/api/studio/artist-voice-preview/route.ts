import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ArtistVoicePreviewBody = {
  script?: string;
  vocalMode?: string;
};

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_DEFAULT_VOICE_ID = process.env.ELEVENLABS_DEFAULT_VOICE_ID;
const ELEVENLABS_MALE_VOICE_ID = process.env.ELEVENLABS_MALE_VOICE_ID;
const ELEVENLABS_FEMALE_VOICE_ID = process.env.ELEVENLABS_FEMALE_VOICE_ID;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "tracks";
const DEFAULT_SCRIPT = "This is my SoundioX artist voice. Welcome to my sound.";

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

function readRequiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return { supabaseUrl, anonKey, serviceRoleKey };
}

function buildAuthClient(supabaseUrl: string, anonKey: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeVocalMode(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (normalized === "female" || normalized === "female-vocal" || normalized === "female vocal") {
    return "female";
  }

  if (normalized === "male" || normalized === "male-vocal" || normalized === "male vocal") {
    return "male";
  }

  return "";
}

function getVoiceId(vocalMode: string) {
  if (vocalMode === "female") {
    return ELEVENLABS_FEMALE_VOICE_ID || ELEVENLABS_DEFAULT_VOICE_ID || ELEVENLABS_MALE_VOICE_ID || "";
  }

  if (vocalMode === "male") {
    return ELEVENLABS_MALE_VOICE_ID || ELEVENLABS_DEFAULT_VOICE_ID || ELEVENLABS_FEMALE_VOICE_ID || "";
  }

  return ELEVENLABS_DEFAULT_VOICE_ID || ELEVENLABS_MALE_VOICE_ID || ELEVENLABS_FEMALE_VOICE_ID || "";
}

export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey, serviceRoleKey } = readRequiredEnv();
    const accessToken = getBearerToken(request.headers.get("authorization"));

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = buildAuthClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: userError?.message || "Invalid user session" },
        { status: 401 }
      );
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured." }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as ArtistVoicePreviewBody | null;
    const script = String(body?.script || "").trim() || DEFAULT_SCRIPT;
    const voiceId = getVoiceId(normalizeVocalMode(body?.vocalMode));

    if (!voiceId) {
      return NextResponse.json(
        { error: "No ElevenLabs voice ID is configured for artist voice preview." },
        { status: 500 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60 * 1000);

    try {
      const elevenResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: script,
            model_id: "eleven_multilingual_v2",
          }),
          signal: controller.signal,
        }
      );

      if (!elevenResponse.ok) {
        const errorText = await elevenResponse.text().catch(() => "");
        return NextResponse.json(
          { error: errorText || `ElevenLabs failed with status ${elevenResponse.status}` },
          { status: elevenResponse.status }
        );
      }

      const audioBuffer = await elevenResponse.arrayBuffer();
      const timestamp = Date.now();
      const storagePath = `studio-artist-voices/${user.id}/${timestamp}.mp3`;
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
        return NextResponse.json(
          { error: uploadText || `Artist voice preview upload failed with status ${uploadResponse.status}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        artistVoicePreviewUrl: `${supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${storagePath}`,
        storagePath,
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return NextResponse.json(
          { error: "Artist voice preview generation timed out after 60 seconds." },
          { status: 504 }
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.error("Artist voice preview unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected artist voice preview error" },
      { status: 500 }
    );
  }
}
