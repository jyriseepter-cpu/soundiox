import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ReleasePackageBody = {
  trackVersionId?: string | null;
  trackGroupId?: string | null;
  title?: string | null;
};

const BASE_VERSION_SELECT =
  "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,audio_url,artwork_url,duration,is_original,created_at,stems_status,stems_metadata";
const ROOT_VERSION_SELECT = `${BASE_VERSION_SELECT},root_version_id`;

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

function buildServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function sanitizeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "studio-pro-release"
  );
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function buildZip(files: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = getDosDateTime();

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const checksum = crc32(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, file.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function loadVersion(serviceClient: ReturnType<typeof buildServiceClient>, trackVersionId: string, trackGroupId: string) {
  const trackVersionsTable = (serviceClient as any).from("track_versions");
  let result = await trackVersionsTable
    .select(ROOT_VERSION_SELECT)
    .eq("id", trackVersionId)
    .eq("track_group_id", trackGroupId)
    .maybeSingle();

  console.log("RELEASE PACKAGE VERSION ROOT QUERY RESULT", {
    data: result.data,
    error: result.error,
  });

  if (result.error) {
    console.error("RELEASE PACKAGE VERSION ROOT QUERY ERROR", result.error);
    result = await trackVersionsTable
      .select(BASE_VERSION_SELECT)
      .eq("id", trackVersionId)
      .eq("track_group_id", trackGroupId)
      .maybeSingle();
    console.log("RELEASE PACKAGE VERSION BASE QUERY RESULT", {
      data: result.data,
      error: result.error,
    });
    if (result.error) {
      console.error("RELEASE PACKAGE VERSION BASE QUERY ERROR", result.error);
    }
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    console.log("RELEASE PACKAGE START");
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

    console.log("RELEASE PACKAGE AUTH QUERY RESULT", {
      data: { user },
      error: userError,
    });

    if (userError) {
      console.error("RELEASE PACKAGE AUTH QUERY ERROR", userError);
    }

    if (userError || !user) {
      return NextResponse.json(
        { error: userError?.message || "Invalid user session" },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => null)) as ReleasePackageBody | null;
    const trackVersionId = String(body?.trackVersionId || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim();
    console.log("REQUEST BODY", body);
    console.log("RELEASE PACKAGE REQUEST", body);
    console.log("TRACK VERSION ID", trackVersionId);
    console.log("TRACK GROUP ID", trackGroupId);

    if (!trackVersionId || !trackGroupId) {
      return NextResponse.json(
        { error: "trackVersionId and trackGroupId are required" },
        { status: 400 }
      );
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const { data: project, error: projectError } = await serviceClient
      .from("studio_projects")
      .select("user_id")
      .eq("track_group_id", trackGroupId)
      .maybeSingle<{ user_id: string | null }>();

    console.log("RELEASE PACKAGE PROJECT QUERY RESULT", {
      data: project,
      error: projectError,
    });

    if (projectError) {
      console.error("RELEASE PACKAGE PROJECT QUERY ERROR", projectError);
      console.warn("Studio PRO release package ownership lookup warning:", projectError);
    }

    if (project?.user_id && project.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: version, error: versionError } = await loadVersion(
      serviceClient,
      trackVersionId,
      trackGroupId
    );

    console.log("RELEASE PACKAGE VERSION QUERY RESULT", {
      data: version,
      error: versionError,
    });

    if (versionError) {
      console.error("RELEASE PACKAGE VERSION QUERY ERROR", versionError);
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }

    if (!version?.audio_url) {
      return NextResponse.json({ error: "Selected version is missing audio" }, { status: 400 });
    }

    const metadata = {
      packageType: "soundiox-studio-pro-release-package",
      packageVersion: 1,
      createdAt: new Date().toISOString(),
      title: String(body?.title || version.title || "Studio PRO Release").trim(),
      audioUrl: version.audio_url,
      artworkUrl: version.artwork_url || null,
      versionId: version.id,
      rootVersionId: version.root_version_id || version.id,
      parentVersionId: version.parent_version_id || null,
      trackGroupId: version.track_group_id,
      versionNumber: version.version_number || null,
      versionLabel: version.version_label || null,
      provider: version.provider || null,
      generationMode: version.generation_mode || null,
      duration: version.duration || null,
      isOriginal: version.is_original === true,
      stemsStatus: version.stems_status || "not_started",
      stemsMetadata: version.stems_metadata || null,
      importMetadata: null,
    };

    const zip = buildZip([
      {
        name: "release-package.json",
        data: Buffer.from(JSON.stringify(metadata, null, 2), "utf8"),
      },
      {
        name: "audio-url.txt",
        data: Buffer.from(`${metadata.audioUrl}\n`, "utf8"),
      },
      {
        name: "artwork-url.txt",
        data: Buffer.from(`${metadata.artworkUrl || ""}\n`, "utf8"),
      },
    ]);
    const filename = `${sanitizeFilename(metadata.title)}-release-package.zip`;

    return new NextResponse(zip, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("RELEASE PACKAGE ERROR", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create release package" },
      { status: 500 }
    );
  }
}
