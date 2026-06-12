import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ArtworkImageBody = {
  trackVersionId?: string;
  trackGroupId?: string;
  imagePrompt?: string;
  artworkConcept?: unknown;
  title?: string;
};

const SUPABASE_BUCKET = "tracks";

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
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !openAiKey) {
    throw new Error("Missing required Studio artwork environment variables");
  }

  return { supabaseUrl, anonKey, serviceRoleKey, openAiKey };
}

function buildAuthClient(supabaseUrl: string, anonKey: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function safePathPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function maybeUpdateTrackVersionArtworkUrl(args: {
  serviceClient: ReturnType<typeof buildServiceClient>;
  trackVersionId: string;
  trackGroupId: string;
  artworkUrl: string;
  artworkConcept?: unknown;
}) {
  if (!args.trackVersionId || !args.trackGroupId) {
    return { saved: false, warning: "Cover image generated, but no track version was selected." };
  }

  console.log(
    "STUDIO ARTWORK DB UPDATE PAYLOAD:",
    JSON.stringify(
      {
        artwork_url: args.artworkUrl,
        artwork_concept: args.artworkConcept || null,
      },
      null,
      2
    )
  );

  const { data: targetVersion, error: targetLookupError } = await args.serviceClient
    .from("track_versions")
    .select("id,is_original")
    .eq("id", args.trackVersionId)
    .eq("track_group_id", args.trackGroupId)
    .maybeSingle<{ id: string; is_original: boolean | null }>();

  if (targetLookupError) {
    return {
      saved: false,
      warning: "Cover image generated, but the selected Studio version could not be checked.",
    };
  }

  if (!targetVersion) {
    return {
      saved: false,
      warning: "Cover image generated, but the selected Studio version was not found.",
    };
  }

  if (targetVersion.is_original) {
    return {
      saved: false,
      warning: "Cover image generated, but Original is immutable. Save a new version before attaching artwork.",
    };
  }

  const { data, error } = await args.serviceClient
    .from("track_versions")
    .update({ artwork_url: args.artworkUrl })
    .eq("id", args.trackVersionId)
    .eq("track_group_id", args.trackGroupId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return {
      saved: false,
      warning: "Cover image generated, but the Studio version could not be updated.",
    };
  }

  if (!data) {
    return {
      saved: false,
      warning: "Cover image generated, but the selected Studio version was not found.",
    };
  }

  if (args.artworkConcept && typeof args.artworkConcept === "object") {
    const { error: conceptError } = await args.serviceClient
      .from("track_versions")
      .update({ artwork_concept: args.artworkConcept })
      .eq("id", args.trackVersionId)
      .eq("track_group_id", args.trackGroupId);

    if (conceptError) {
      return {
        saved: true,
        warning: "Cover image generated, but artwork concept metadata could not be saved.",
      };
    }
  }

  const { data: updatedRow, error: updatedRowError } = await args.serviceClient
    .from("track_versions")
    .select("id,artwork_url,artwork_concept")
    .eq("id", args.trackVersionId)
    .eq("track_group_id", args.trackGroupId)
    .maybeSingle();

  if (!updatedRowError) {
    console.log("STUDIO ARTWORK LOADED DB ROW AFTER UPDATE:", JSON.stringify(updatedRow, null, 2));
  }

  return { saved: true, warning: null };
}

async function readOpenAiImageBytes(payload: any) {
  const firstImage = Array.isArray(payload?.data) ? payload.data[0] : null;
  const base64 = typeof firstImage?.b64_json === "string" ? firstImage.b64_json : "";

  if (base64) {
    return Buffer.from(base64, "base64");
  }

  const imageUrl = typeof firstImage?.url === "string" ? firstImage.url : "";
  if (!imageUrl) {
    throw new Error("OpenAI image response did not include image data.");
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`OpenAI image download failed with status ${imageResponse.status}`);
  }

  return Buffer.from(await imageResponse.arrayBuffer());
}

export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey, serviceRoleKey, openAiKey } = readRequiredEnv();
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

    const body = (await request.json().catch(() => null)) as ArtworkImageBody | null;
    const trackVersionId = String(body?.trackVersionId || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim();
    const imagePrompt = String(body?.imagePrompt || "").trim();
    const artworkConcept = body?.artworkConcept;
    const title = String(body?.title || "").trim();

    if (!imagePrompt) {
      return NextResponse.json({ error: "imagePrompt is required." }, { status: 400 });
    }

    const prompt = [
      "Create a square 1024x1024 album cover for an AI music release.",
      "No copyrighted logos, no brand marks, no copyrighted character designs.",
      "Do not depict a real person or artist likeness unless explicitly provided later.",
      "Avoid readable typography unless the prompt explicitly asks for text.",
      `Release title context: ${title || "Untitled release"}.`,
      `Cover direction: ${imagePrompt}`,
    ].join("\n");

    const openAiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    const openAiPayload = await openAiResponse.json().catch(() => null);

    if (!openAiResponse.ok) {
      return NextResponse.json(
        { error: openAiPayload?.error?.message || "OpenAI image generation failed" },
        { status: openAiResponse.status }
      );
    }

    const imageBuffer = await readOpenAiImageBytes(openAiPayload);
    const groupOrVersion = safePathPart(trackGroupId || trackVersionId || "unversioned");
    const timestamp = Date.now();
    const storagePath = `studio-artwork/${user.id}/${groupOrVersion}/${timestamp}.png`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "image/png",
        "x-upsert": "false",
      },
      body: imageBuffer,
    });
    const uploadText = await uploadResponse.text().catch(() => "");

    if (!uploadResponse.ok) {
      return NextResponse.json(
        { error: uploadText || `Cover image upload failed with status ${uploadResponse.status}` },
        { status: 500 }
      );
    }

    const artworkUrl = `${supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${storagePath}`;
    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const versionUpdate = await maybeUpdateTrackVersionArtworkUrl({
      serviceClient,
      trackVersionId,
      trackGroupId,
      artworkUrl,
      artworkConcept,
    });

    return NextResponse.json({
      artworkUrl,
      storagePath,
      title,
      versionUpdated: versionUpdate.saved,
      warning: versionUpdate.warning || undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected artwork image error" },
      { status: 500 }
    );
  }
}
