import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";

type StemEngineMode = "mock" | "local_demucs" | "remote_worker";
type RemoteStemWorkerResponse = {
  drumsUrl?: string;
  bassUrl?: string;
  vocalsUrl?: string;
  otherUrl?: string;
  metadata?: Record<string, unknown>;
};

function readRequiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service environment variables");
  }

  return { supabaseUrl, serviceRoleKey };
}

function buildServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getInternalToken(serviceRoleKey: string) {
  return process.env.STUDIO_STEMS_INTERNAL_TOKEN || serviceRoleKey;
}

function isAuthorized(request: NextRequest, serviceRoleKey: string) {
  const expectedToken = getInternalToken(serviceRoleKey);
  const receivedToken = request.headers.get("x-studio-stems-token")?.trim() || "";
  return Boolean(expectedToken && receivedToken && receivedToken === expectedToken);
}

function getStemEngineMode(): StemEngineMode {
  const normalized = String(process.env.STEM_ENGINE_MODE || "mock")
    .trim()
    .toLowerCase();

  if (normalized === "local_demucs" || normalized === "remote_worker") {
    return normalized;
  }

  return "mock";
}

function buildFutureStemPaths(args: {
  userId: string;
  trackGroupId: string;
  trackVersionId: string;
}) {
  const basePath = `studio-stems/${args.userId}/${args.trackGroupId}/${args.trackVersionId}`;

  return {
    drums: `${basePath}/drums.wav`,
    bass: `${basePath}/bass.wav`,
    vocals: `${basePath}/vocals.wav`,
    other: `${basePath}/other.wav`,
  };
}

function buildOutputPrefix(args: { userId: string; trackGroupId: string; trackVersionId: string }) {
  return `studio-stems/${args.userId}/${args.trackGroupId}/${args.trackVersionId}`;
}

function buildRemoteWorkerPayload(args: {
  trackVersionId: string;
  trackGroupId: string;
  audioUrl: string;
  userId: string;
}) {
  return {
    trackVersionId: args.trackVersionId,
    trackGroupId: args.trackGroupId,
    audioUrl: args.audioUrl,
    userId: args.userId,
    outputPrefix: buildOutputPrefix(args),
  };
}

function isCompleteStemResponse(value: RemoteStemWorkerResponse) {
  return Boolean(value.drumsUrl && value.bassUrl && value.vocalsUrl && value.otherUrl);
}

function hasDuplicateStemResponseUrls(value: RemoteStemWorkerResponse) {
  const urls = [value.drumsUrl, value.bassUrl, value.vocalsUrl, value.otherUrl]
    .map((url) => url?.trim())
    .filter(Boolean) as string[];

  return urls.length > 1 && new Set(urls).size < urls.length;
}

function hasDuplicateStemUrls(value: {
  stem_drums_url?: string | null;
  stem_bass_url?: string | null;
  stem_vocals_url?: string | null;
  stem_other_url?: string | null;
}) {
  const urls = [
    value.stem_drums_url,
    value.stem_bass_url,
    value.stem_vocals_url,
    value.stem_other_url,
  ]
    .map((url) => url?.trim())
    .filter(Boolean) as string[];

  return urls.length > 1 && new Set(urls).size < urls.length;
}

async function downloadSourceAudio(audioUrl: string, trackVersionId: string) {
  const workDir = await mkdtemp(path.join(tmpdir(), "soundiox-stems-"));

  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Source audio download failed with status ${response.status}`);
    }

    const sourcePath = path.join(workDir, `${trackVersionId}.source-audio`);
    await writeFile(sourcePath, Buffer.from(await response.arrayBuffer()));
    return { workDir, sourcePath };
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    throw error;
  }
}

export async function POST(request: NextRequest) {
  let failureTrackVersionId = "";
  let failureSupabaseUrl = "";
  let failureServiceRoleKey = "";
  try {
    const { supabaseUrl, serviceRoleKey } = readRequiredEnv();
    failureSupabaseUrl = supabaseUrl;
    failureServiceRoleKey = serviceRoleKey;
    const stemEngineMode = getStemEngineMode();

    if (!isAuthorized(request, serviceRoleKey)) {
      console.error("STEM PROCESS ERROR", { code: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const body = await request.json().catch(() => null);
    const trackVersionId = String(body?.trackVersionId || "").trim();
    failureTrackVersionId = trackVersionId;
    const trackGroupId = String(body?.trackGroupId || "").trim();
    const userId = String(body?.userId || "unknown-user").trim() || "unknown-user";
    const audioUrl = String(body?.audioUrl || "").trim();
    const force = body?.force === true;

    console.log("STEM PROCESS INPUT", {
      trackVersionId: trackVersionId || null,
      trackGroupId: trackGroupId || null,
      userId,
      hasAudioUrl: Boolean(audioUrl),
      stemEngineMode,
      force,
      bodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
    });

    if (!trackVersionId || !audioUrl) {
      console.error("STEM PROCESS ERROR", {
        code: "missing_input",
        trackVersionId: trackVersionId || null,
        hasAudioUrl: Boolean(audioUrl),
      });
      return NextResponse.json(
        { error: "trackVersionId and audioUrl are required" },
        { status: 400 }
      );
    }

    const { data: version, error: versionError } = await serviceClient
      .from("track_versions")
      .select(
        "id,track_group_id,stems_status,audio_url,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata,stems_completed_at"
      )
      .eq("id", trackVersionId)
      .maybeSingle<{
        id: string;
        track_group_id: string;
        stems_status: string | null;
        audio_url: string | null;
        stem_drums_url: string | null;
        stem_bass_url: string | null;
        stem_vocals_url: string | null;
        stem_other_url: string | null;
        stems_metadata: unknown | null;
        stems_completed_at: string | null;
      }>();

    console.log("STEM PROCESS FETCHED VERSION", {
      trackVersionId,
      version,
      error: versionError
        ? {
            message: versionError.message,
            details: versionError.details,
            hint: versionError.hint,
            code: versionError.code,
          }
        : null,
    });

    if (versionError || !version) {
      return NextResponse.json(
        { error: versionError?.message || "Track version not found" },
        { status: versionError ? 500 : 404 }
      );
    }

    if (version.stems_status === "ready" && !force && hasDuplicateStemUrls(version)) {
      const message = "Invalid stem set detected. Retry available.";
      await serviceClient
        .from("track_versions")
        .update({
          stems_status: "error",
          stems_error: message,
        })
        .eq("id", trackVersionId);

      console.error("STEM PROCESS INVALID CACHE HIT", {
        trackVersionId,
        stemEngineMode,
        stems: {
          drums: version.stem_drums_url,
          bass: version.stem_bass_url,
          vocals: version.stem_vocals_url,
          other: version.stem_other_url,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          code: "invalid_stem_set",
          error: message,
          stemsStatus: "error",
        },
        { status: 409 }
      );
    }

    if (version.stems_status === "ready" && !force) {
      console.log("STEM PROCESS CACHE HIT", { trackVersionId, stemEngineMode });
      return NextResponse.json({
        ok: true,
        cached: true,
        stemsStatus: "ready",
        stemEngineMode,
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

    console.log("STEM PROCESS START", { trackVersionId });

    const { data: processingRow, error: processingError } = await serviceClient
      .from("track_versions")
      .update({
        stems_status: "processing",
        stems_error: null,
      })
      .eq("id", trackVersionId)
      .select("id,stems_status")
      .maybeSingle<{ id: string; stems_status: string | null }>();

    console.log("STEM PROCESS PROCESSING UPDATE", {
      trackVersionId,
      processingRow,
      error: processingError
        ? {
            message: processingError.message,
            details: processingError.details,
            hint: processingError.hint,
            code: processingError.code,
          }
        : null,
    });

    if (processingError) {
      return NextResponse.json({ error: processingError.message }, { status: 500 });
    }

    if (stemEngineMode === "local_demucs") {
      const futureStemPaths = buildFutureStemPaths({
        userId,
        trackGroupId: version.track_group_id,
        trackVersionId,
      });
      let downloaded: Awaited<ReturnType<typeof downloadSourceAudio>> | null = null;

      try {
        downloaded = await downloadSourceAudio(audioUrl, trackVersionId);
        console.log("STEM PROCESS LOCAL_DEMUCS SCAFFOLD", {
          trackVersionId,
          sourcePath: downloaded.sourcePath,
          plannedOutputPaths: futureStemPaths,
        });
      } finally {
        if (downloaded?.workDir) {
          await rm(downloaded.workDir, { recursive: true, force: true });
        }
      }

      const message = "Demucs engine is not connected yet.";
      await serviceClient
        .from("track_versions")
        .update({
          stems_status: "error",
          stems_error: message,
          stems_metadata: {
            mock: false,
            provider: "local_demucs",
            mode: "local_demucs",
            plannedOutputPaths: futureStemPaths,
          },
        })
        .eq("id", trackVersionId);

      return NextResponse.json(
        {
          ok: false,
          code: "demucs_not_connected",
          error: message,
          stemsStatus: "error",
          plannedOutputPaths: futureStemPaths,
        },
        { status: 501 }
      );
    }

    if (stemEngineMode === "remote_worker") {
      const workerUrl = process.env.STEM_REMOTE_WORKER_URL?.trim();
      const workerPayload = buildRemoteWorkerPayload({
        trackVersionId,
        trackGroupId: version.track_group_id,
        userId,
        audioUrl,
      });

      console.log("STEM PROCESS REMOTE_WORKER PAYLOAD", workerPayload);

      if (!workerUrl) {
        const message = "Remote stem worker is not connected yet.";
        await serviceClient
          .from("track_versions")
          .update({
            stems_status: "error",
            stems_error: message,
            stems_metadata: {
              mock: false,
              provider: "remote_worker",
              mode: "remote_worker",
              outputPrefix: workerPayload.outputPrefix,
            },
          })
          .eq("id", trackVersionId);

        return NextResponse.json(
          {
            ok: false,
            code: "remote_worker_not_connected",
            error: message,
            stemsStatus: "error",
            workerPayload,
          },
          { status: 501 }
        );
      }

      // TODO: connect this endpoint to a GPU/CPU stem service running Demucs/MDX
      // outside Vercel. The worker should upload stems to Supabase Storage and return
      // { drumsUrl, bassUrl, vocalsUrl, otherUrl, metadata }.
      const workerResponse = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.STEM_REMOTE_WORKER_TOKEN
            ? { Authorization: `Bearer ${process.env.STEM_REMOTE_WORKER_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(workerPayload),
      });
      const workerBody = (await workerResponse.json().catch(() => ({}))) as RemoteStemWorkerResponse;

      console.log("STEM REMOTE WORKER RESPONSE", {
        status: workerResponse.status,
        ok: workerResponse.ok,
        hasDrumsUrl: Boolean(workerBody.drumsUrl),
        hasBassUrl: Boolean(workerBody.bassUrl),
        hasVocalsUrl: Boolean(workerBody.vocalsUrl),
        hasOtherUrl: Boolean(workerBody.otherUrl),
        metadata: workerBody.metadata || null,
      });

      if (!workerResponse.ok || !isCompleteStemResponse(workerBody) || hasDuplicateStemResponseUrls(workerBody)) {
        const message =
          !workerResponse.ok
            ? `Remote stem worker failed with status ${workerResponse.status}`
            : !isCompleteStemResponse(workerBody)
              ? "Remote stem worker response was missing stem URLs."
              : "Remote stem worker returned duplicate stem URLs.";
        await serviceClient
          .from("track_versions")
          .update({
            stems_status: "error",
            stems_error: message,
            stems_metadata: {
              mock: false,
              provider: "remote_worker",
              mode: "remote_worker",
              outputPrefix: workerPayload.outputPrefix,
              workerStatus: workerResponse.status,
            },
          })
          .eq("id", trackVersionId);

        return NextResponse.json(
          {
            ok: false,
            code: "remote_worker_failed",
            error: message,
            stemsStatus: "error",
          },
          { status: 502 }
        );
      }

      const completedAt = new Date().toISOString();
      console.log("DRUM STEM URL", workerBody.drumsUrl || null);
      console.log("BASS STEM URL", workerBody.bassUrl || null);
      console.log("VOCAL STEM URL", workerBody.vocalsUrl || null);
      console.log("OTHER STEM URL", workerBody.otherUrl || null);
      const { data: remoteUpdated, error: remoteUpdateError } = await serviceClient
        .from("track_versions")
        .update({
          stems_status: "ready",
          stems_completed_at: completedAt,
          stems_error: null,
          stem_drums_url: workerBody.drumsUrl,
          stem_bass_url: workerBody.bassUrl,
          stem_vocals_url: workerBody.vocalsUrl,
          stem_other_url: workerBody.otherUrl,
          stems_metadata: {
            ...(workerBody.metadata || {}),
            mock: false,
            provider: "remote_worker",
            mode: "remote_worker",
            outputPrefix: workerPayload.outputPrefix,
          },
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

      if (remoteUpdateError) {
        return NextResponse.json({ error: remoteUpdateError.message }, { status: 500 });
      }

      console.log("STEM PROCESS COMPLETE", { trackVersionId, stemEngineMode });

      return NextResponse.json({
        ok: true,
        stemsStatus: remoteUpdated?.stems_status || "ready",
        stemEngineMode,
        stemsCompletedAt: remoteUpdated?.stems_completed_at || completedAt,
        stems: {
          drums: remoteUpdated?.stem_drums_url || workerBody.drumsUrl,
          bass: remoteUpdated?.stem_bass_url || workerBody.bassUrl,
          vocals: remoteUpdated?.stem_vocals_url || workerBody.vocalsUrl,
          other: remoteUpdated?.stem_other_url || workerBody.otherUrl,
        },
        stemsMetadata: remoteUpdated?.stems_metadata,
      });
    }

    const completedAt = new Date().toISOString();
    console.log("DRUM STEM URL", audioUrl);
    console.log("BASS STEM URL", audioUrl);
    console.log("VOCAL STEM URL", audioUrl);
    console.log("OTHER STEM URL", audioUrl);
    const { data: updated, error: completeError } = await serviceClient
      .from("track_versions")
      .update({
        stems_status: "ready",
        stems_completed_at: completedAt,
        stems_error: null,
        stem_drums_url: audioUrl,
        stem_bass_url: audioUrl,
        stem_vocals_url: audioUrl,
        stem_other_url: audioUrl,
        stems_metadata: {
          mock: true,
          provider: "mock-stem-worker-v1",
          mode: "mock",
        },
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

    console.log("STEM PROCESS READY UPDATE", {
      trackVersionId,
      updated,
      error: completeError
        ? {
            message: completeError.message,
            details: completeError.details,
            hint: completeError.hint,
            code: completeError.code,
          }
        : null,
    });

    if (completeError) {
      await serviceClient
        .from("track_versions")
        .update({
          stems_status: "error",
          stems_error: completeError.message,
        })
        .eq("id", trackVersionId);

      return NextResponse.json({ error: completeError.message }, { status: 500 });
    }

    console.log("STEM PROCESS COMPLETE", { trackVersionId });

    return NextResponse.json({
      ok: true,
      stemsStatus: updated?.stems_status || "ready",
      stemEngineMode,
      stemsCompletedAt: updated?.stems_completed_at || completedAt,
      stems: {
        drums: updated?.stem_drums_url || audioUrl,
        bass: updated?.stem_bass_url || audioUrl,
        vocals: updated?.stem_vocals_url || audioUrl,
        other: updated?.stem_other_url || audioUrl,
      },
      stemsMetadata: updated?.stems_metadata || {
        mock: true,
        provider: "mock-stem-worker-v1",
        mode: "mock",
      },
    });
  } catch (error: any) {
    if (failureTrackVersionId && failureSupabaseUrl && failureServiceRoleKey) {
      try {
        await buildServiceClient(failureSupabaseUrl, failureServiceRoleKey)
          .from("track_versions")
          .update({
            stems_status: "error",
            stems_error: error?.message || "Unexpected stem process error",
          })
          .eq("id", failureTrackVersionId);
      } catch (updateError) {
        console.error("STEM PROCESS ERROR STATUS UPDATE FAILED", {
          trackVersionId: failureTrackVersionId,
          message: updateError instanceof Error ? updateError.message : String(updateError),
        });
      }
    }
    console.error("STEM PROCESS ERROR", {
      code: "unexpected_error",
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return NextResponse.json(
      { error: error?.message || "Unexpected stem process error" },
      { status: 500 }
    );
  }
}
