import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getBearerToken(header: string | null) {
  if (!header) return null;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;
  return header.slice(prefix.length).trim() || null;
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function sanitizeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function sanitizeFileBaseName(value: string) {
  return value
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getSafeExtension(fileName: string, fallback = "bin") {
  const ext = fileName.split(".").pop()?.toLowerCase() || fallback;
  return ext.replace(/[^a-z0-9]+/g, "").slice(0, 10) || fallback;
}

function buildObjectKey(prefix: string, originalName: string) {
  const safeBaseName = sanitizeFileBaseName(originalName) || "file";
  const ext = getSafeExtension(originalName);
  return `${prefix}/${Date.now()}-${randomUUID()}-${safeBaseName}.${ext}`;
}

function getUploadPrefix(params: {
  kind: string;
  userId: string;
  albumIdRaw: FormDataEntryValue | null;
}) {
  const { kind, userId, albumIdRaw } = params;

  if (kind === "track") {
    return `tracks/${userId}`;
  }

  if (kind === "album") {
    const safeAlbumId = sanitizeSegment(
      typeof albumIdRaw === "string" ? albumIdRaw : ""
    );

    if (!safeAlbumId) {
      throw new Error("Missing albumId.");
    }

    return `albums/${userId}/${safeAlbumId}`;
  }

  throw new Error("Invalid upload kind.");
}

function getR2Config() {
  const accountId = readRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = readRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readRequiredEnv("R2_SECRET_ACCESS_KEY");

  return {
    accountId,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  };
}

function createR2Client() {
  const r2 = getR2Config();
  return new S3Client({
    region: r2.region,
    endpoint: r2.endpoint,
    credentials: r2.credentials,
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const accessToken = getBearerToken(request.headers.get("authorization"));

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") || "").trim().toLowerCase();
    const albumIdRaw = formData.get("albumId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }

    if (!kind) {
      return NextResponse.json({ error: "Missing upload kind." }, { status: 400 });
    }

    const bucket = process.env.R2_BUCKET_NAME?.trim() || "soundiox-tracks";
    const publicBaseUrl =
      process.env.R2_PUBLIC_BASE_URL?.trim() ||
      "https://pub-46f0b0bf4e164379a93b99431b54f4ab.r2.dev";
    const prefix = getUploadPrefix({
      kind,
      userId: user.id,
      albumIdRaw,
    });
    const key = buildObjectKey(prefix, file.name || "upload.bin");
    const client = createR2Client();
    const body = Buffer.from(await file.arrayBuffer());

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: file.type || "application/octet-stream",
      })
    );

    return NextResponse.json({
      key,
      url: `${publicBaseUrl.replace(/\/+$/, "")}/${key}`,
    });
  } catch (error: unknown) {
    console.error("r2 upload error:", error);
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
