import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const QUEUED_TIMEOUT_MS = 30_000;
const PROCESSING_TIMEOUT_MS = 5 * 60_000;

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

function getInternalStemToken(serviceRoleKey: string) {
  return process.env.STUDIO_STEMS_INTERNAL_TOKEN || serviceRoleKey;
}

function logPrepareError(details: Record<string, unknown>) {
  console.error("STEMS PREPARE ERROR", details);
}

function logPrepareInfo(label: string, details: Record<string, unknown>) {
  console.log(label, details);
}

function hasAllStemUrls(version: {
  stem_drums_url: string | null;
  stem_bass_url: string | null;
  stem_vocals_url: string | null;
  stem_other_url: string | null;
}) {
  return Boolean(
    version.stem_drums_url &&
      version.stem_bass_url &&
      version.stem_vocals_url &&
      version.stem_other_url
  );
}

function hasDuplicateStemUrls(version: {
  stem_drums_url: string | null;
  stem_bass_url: string | null;
  stem_vocals_url: string | null;
  stem_other_url: string | null;
}) {
  const urls = [
    version.stem_drums_url,
    version.stem_bass_url,
    version.stem_vocals_url,
    version.stem_other_url,
  ]
    .map((url) => url?.trim())
    .filter(Boolean) as string[];

  return urls.length > 1 && new Set(urls).size < urls.length;
}

function hasPartialStemUrls(version: {
  stem_drums_url: string | null;
  stem_bass_url: string | null;
  stem_vocals_url: string | null;
  stem_other_url: string | null;
}) {
  return Boolean(
    version.stem_drums_url ||
      version.stem_bass_url ||
      version.stem_vocals_url ||
      version.stem_other_url
  );
}

function isStemTimeout(status: string | null, requestedAt: string | null) {
  if (status !== "queued" && status !== "processing") return false;
  if (!requestedAt) return true;
  const requestedTime = new Date(requestedAt).getTime();
  if (!Number.isFinite(requestedTime)) return true;
  const ageMs = Date.now() - requestedTime;
  return status === "queued" ? ageMs > QUEUED_TIMEOUT_MS : ageMs > PROCESSING_TIMEOUT_MS;
}

export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey, serviceRoleKey } = readRequiredEnv();
    const accessToken = getBearerToken(request.headers.get("authorization"));

    if (!accessToken) {
      logPrepareError({ code: "missing_auth" });
      return NextResponse.json(
        { ok: false, code: "missing_auth", error: "Unauthorized" },
        { status: 401 }
      );
    }

    const authClient = buildAuthClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      logPrepareError({
        code: "missing_auth",
        message: userError?.message || "Invalid user session",
      });
      return NextResponse.json(
        {
          ok: false,
          code: "missing_auth",
          error: userError?.message || "Invalid user session",
        },
        { status: 401 }
      );
    }

    logPrepareInfo("STEMS PREPARE USER", {
      userId: user.id,
    });

    const body = await request.json().catch(() => null);
    const trackVersionId = String(body?.trackVersionId || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim();
    const audioUrl = String(body?.audioUrl || "").trim();
    const force = body?.force === true;

    logPrepareInfo("STEMS PREPARE INPUT", {
      trackVersionId: trackVersionId || null,
      trackGroupId: trackGroupId || null,
      hasAudioUrl: Boolean(audioUrl),
      userId: user.id,
      force,
      bodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
    });

    if (!trackVersionId) {
      logPrepareError({ code: "missing_track_version_id", trackGroupId, hasAudioUrl: Boolean(audioUrl) });
      return NextResponse.json(
        { ok: false, code: "missing_track_version_id", error: "trackVersionId is required" },
        { status: 400 }
      );
    }

    if (!trackGroupId) {
      logPrepareError({ code: "missing_track_group_id", trackVersionId, hasAudioUrl: Boolean(audioUrl) });
      return NextResponse.json(
        { ok: false, code: "missing_track_group_id", error: "trackGroupId is required" },
        { status: 400 }
      );
    }

    if (!audioUrl) {
      logPrepareError({ code: "missing_audio_url", trackVersionId, trackGroupId });
      return NextResponse.json(
        { ok: false, code: "missing_audio_url", error: "audioUrl is required" },
        { status: 400 }
      );
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const { data: version, error: versionError } = await serviceClient
      .from("track_versions")
      .select(
        "id,track_group_id,audio_url,stems_status,stems_requested_at,stems_completed_at,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata"
      )
      .eq("id", trackVersionId)
      .maybeSingle<{
        id: string;
        track_group_id: string;
        audio_url: string | null;
        stems_status: string | null;
        stems_requested_at: string | null;
        stems_completed_at: string | null;
        stem_drums_url: string | null;
        stem_bass_url: string | null;
        stem_vocals_url: string | null;
        stem_other_url: string | null;
        stems_metadata: unknown | null;
      }>();

    if (versionError) {
      logPrepareError({
        code: "version_lookup_failed",
        trackVersionId,
        trackGroupId,
        message: versionError.message,
        details: versionError.details,
        hint: versionError.hint,
      });
      return NextResponse.json(
        { ok: false, code: "version_lookup_failed", error: versionError.message },
        { status: 500 }
      );
    }

    logPrepareInfo("STEMS PREPARE SELECTED VERSION", {
      trackVersionId,
      requestedTrackGroupId: trackGroupId,
      version: version
        ? {
            id: version.id,
            track_group_id: version.track_group_id,
            hasAudioUrl: Boolean(version.audio_url),
            stems_status: version.stems_status,
            stems_requested_at: version.stems_requested_at,
            hasCompleteStemUrls: hasAllStemUrls(version),
            hasPartialStemUrls: hasPartialStemUrls(version),
          }
        : null,
    });

    if (!version || version.track_group_id !== trackGroupId) {
      logPrepareError({
        code: "version_not_found",
        trackVersionId,
        trackGroupId,
        foundTrackGroupId: version?.track_group_id || null,
      });
      return NextResponse.json(
        { ok: false, code: "version_not_found", error: "Studio version not found" },
        { status: 404 }
      );
    }

    const sourceAudioUrl = version.audio_url || audioUrl;
    if (!sourceAudioUrl) {
      logPrepareError({ code: "missing_audio_url", trackVersionId, trackGroupId });
      return NextResponse.json(
        {
          ok: false,
          code: "missing_audio_url",
          error: "A source audio URL is required before preparing stems",
        },
        { status: 400 }
      );
    }

    if (hasDuplicateStemUrls(version) && !force) {
      const message = "Invalid stem set detected. Retry available.";
      const { data: invalidRow, error: invalidError } = await serviceClient
        .from("track_versions")
        .update({
          stems_status: "error",
          stems_error: message,
        })
        .eq("id", trackVersionId)
        .select("id,stems_status,stems_error")
        .maybeSingle<{ id: string; stems_status: string | null; stems_error: string | null }>();

      logPrepareError({
        code: "duplicate_stem_urls",
        trackVersionId,
        trackGroupId,
        invalidRow,
        invalidError: invalidError ? invalidError.message : null,
        stems: {
          drums: version.stem_drums_url,
          bass: version.stem_bass_url,
          vocals: version.stem_vocals_url,
          other: version.stem_other_url,
        },
      });

      if (invalidError) {
        return NextResponse.json(
          { ok: false, code: "db_update_failed", error: invalidError.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          code: "invalid_stem_set",
          error: message,
          stemsStatus: "error",
          stemsError: message,
          stems: {
            drums: version.stem_drums_url,
            bass: version.stem_bass_url,
            vocals: version.stem_vocals_url,
            other: version.stem_other_url,
          },
        },
        { status: 409 }
      );
    }

    if (hasAllStemUrls(version) && version.stems_status !== "ready" && !force) {
      const completedAt = new Date().toISOString();
      const { data: repairedReady, error: repairedReadyError } = await serviceClient
        .from("track_versions")
        .update({
          stems_status: "ready",
          stems_completed_at: completedAt,
          stems_error: null,
        })
        .eq("id", trackVersionId)
        .select(
          "id,stems_status,stems_completed_at,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata"
        )
        .maybeSingle<{
          id: string;
          stems_status: string | null;
          stems_completed_at: string | null;
          stem_drums_url: string | null;
          stem_bass_url: string | null;
          stem_vocals_url: string | null;
          stem_other_url: string | null;
          stems_metadata: unknown | null;
        }>();

      logPrepareInfo("STEMS PREPARE URLS DETECTED READY", {
        trackVersionId,
        trackGroupId,
        repairedReady,
        error: repairedReadyError ? repairedReadyError.message : null,
      });

      if (repairedReadyError) {
        return NextResponse.json(
          { ok: false, code: "db_update_failed", error: repairedReadyError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        repaired: true,
        stemsStatus: "ready",
        stemsCompletedAt: repairedReady?.stems_completed_at || completedAt,
        stems: {
          drums: repairedReady?.stem_drums_url || version.stem_drums_url,
          bass: repairedReady?.stem_bass_url || version.stem_bass_url,
          vocals: repairedReady?.stem_vocals_url || version.stem_vocals_url,
          other: repairedReady?.stem_other_url || version.stem_other_url,
        },
        stemsMetadata: repairedReady?.stems_metadata || version.stems_metadata,
      });
    }

    if (
      (version.stems_status === "queued" || version.stems_status === "processing") &&
      !force &&
      isStemTimeout(version.stems_status, version.stems_requested_at)
    ) {
      const message = "Stem preparation timed out. Retry available.";
      const { data: timeoutRow, error: timeoutError } = await serviceClient
        .from("track_versions")
        .update({
          stems_status: "error",
          stems_error: message,
        })
        .eq("id", trackVersionId)
        .select("id,stems_status,stems_error")
        .maybeSingle<{ id: string; stems_status: string | null; stems_error: string | null }>();

      logPrepareError({
        code: "stem_timeout_triggered",
        trackVersionId,
        trackGroupId,
        previousStatus: version.stems_status,
        stemsRequestedAt: version.stems_requested_at,
        timeoutRow,
        timeoutError: timeoutError ? timeoutError.message : null,
      });

      if (timeoutError) {
        return NextResponse.json(
          { ok: false, code: "db_update_failed", error: timeoutError.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          code: "stem_timeout",
          error: message,
          stemsStatus: "error",
          stemsError: message,
          partial: hasPartialStemUrls(version),
          stems: {
            drums: version.stem_drums_url,
            bass: version.stem_bass_url,
            vocals: version.stem_vocals_url,
            other: version.stem_other_url,
          },
        },
        { status: 409 }
      );
    }

    if (version.stems_status === "ready" && !force) {
      logPrepareInfo("STEMS PREPARE CACHE HIT", {
        trackVersionId,
        trackGroupId,
      });

      return NextResponse.json({
        ok: true,
        cached: true,
        stemsStatus: "ready",
        stemsCompletedAt: version.stems_completed_at,
        stems: {
          drums: version.stem_drums_url,
          bass: version.stem_bass_url,
          vocals: version.stem_vocals_url,
          other: version.stem_other_url,
        },
        stemsMetadata: version.stems_metadata,
      });
    }

    if ((version.stems_status === "queued" || version.stems_status === "processing") && !force) {
      logPrepareInfo("STEMS PREPARE EXISTING JOB", {
        trackVersionId,
        trackGroupId,
        stemsStatus: version.stems_status,
        stemsRequestedAt: version.stems_requested_at,
        partial: hasPartialStemUrls(version),
      });

      return NextResponse.json({
        ok: true,
        existing: true,
        partial: hasPartialStemUrls(version),
        stemsStatus: version.stems_status,
        stemsRequestedAt: version.stems_requested_at,
        stems: {
          drums: version.stem_drums_url,
          bass: version.stem_bass_url,
          vocals: version.stem_vocals_url,
          other: version.stem_other_url,
        },
        stemsMetadata: version.stems_metadata,
      });
    }

    const { data: project, error: projectError } = await serviceClient
      .from("studio_projects")
      .select("user_id")
      .eq("track_group_id", trackGroupId)
      .maybeSingle<{ user_id: string }>();

    if (projectError) {
      logPrepareError({
        code: "ownership_lookup_failed",
        trackVersionId,
        trackGroupId,
        message: projectError.message,
        details: projectError.details,
        hint: projectError.hint,
      });
    }

    if (project?.user_id && project.user_id !== user.id) {
      logPrepareError({
        code: "ownership_failed",
        trackVersionId,
        trackGroupId,
        projectUserId: project.user_id,
        userId: user.id,
      });
      return NextResponse.json(
        { ok: false, code: "ownership_failed", error: "Forbidden" },
        { status: 403 }
      );
    }

    const { data: updated, error: updateError } = await serviceClient
      .from("track_versions")
      .update({
        stems_status: "queued",
        stems_requested_at: new Date().toISOString(),
        stems_completed_at: null,
        stems_error: null,
      })
      .eq("id", trackVersionId)
      .eq("track_group_id", trackGroupId)
      .select("id,stems_status,stems_requested_at")
      .maybeSingle<{
        id: string;
        stems_status: string | null;
        stems_requested_at: string | null;
      }>();

    logPrepareInfo("STEMS PREPARE UPDATE RESULT", {
      trackVersionId,
      trackGroupId,
      updated,
      error: updateError
        ? {
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint,
            code: updateError.code,
          }
        : null,
    });

    if (updateError) {
      logPrepareError({
        code: "db_update_failed",
        trackVersionId,
        trackGroupId,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
      });
      return NextResponse.json(
        { ok: false, code: "db_update_failed", error: updateError.message },
        { status: 500 }
      );
    }

    if (!updated) {
      logPrepareError({ code: "db_update_failed", trackVersionId, trackGroupId, message: "No row updated" });
      return NextResponse.json(
        { ok: false, code: "db_update_failed", error: "Studio version not updated" },
        { status: 404 }
      );
    }

    const processUrl = new URL("/api/studio/stems/process", request.nextUrl.origin);
    logPrepareInfo("STEM JOB STARTED", {
      trackVersionId,
      trackGroupId,
      status: updated.stems_status || "queued",
      force,
    });
    logPrepareInfo("STEMS PREPARE PROCESS TRIGGER", {
      trackVersionId,
      processUrl: processUrl.toString(),
      hasSourceAudioUrl: Boolean(sourceAudioUrl),
    });
    void fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-studio-stems-token": getInternalStemToken(serviceRoleKey),
      },
      body: JSON.stringify({
        trackVersionId,
        trackGroupId,
        userId: user.id,
        audioUrl: sourceAudioUrl,
        force,
      }),
      cache: "no-store",
    }).catch((error) => {
      logPrepareError({
        code: "process_trigger_failed",
        trackVersionId,
        trackGroupId,
        message: error?.message || String(error),
      });
    });

    return NextResponse.json({
      ok: true,
      stemsStatus: updated.stems_status || "queued",
      stemsRequestedAt: updated.stems_requested_at,
    });
  } catch (error: any) {
    logPrepareError({
      code: "unexpected_error",
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return NextResponse.json(
      {
        ok: false,
        code: "unexpected_error",
        error: error?.message || "Unexpected Studio stems prepare error",
      },
      { status: 500 }
    );
  }
}
