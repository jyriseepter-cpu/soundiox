import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getBearerToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
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

const versionSelect =
  "id,parent_version_id,root_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,audio_url,artwork_url,duration,is_original,created_at,stems_status,stems_requested_at,stems_completed_at,stems_error,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata";
const versionSelectWithoutRoot =
  "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,audio_url,artwork_url,duration,is_original,created_at,stems_status,stems_requested_at,stems_completed_at,stems_error,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata";
const trackSelectExtended =
  "id,title,artist,genre,audio_url,artwork_url,created_at,source_track_version_id,source_provider,source_generation_mode,imported_source";
const trackSelectBase = "id,title,artist,genre,audio_url,artwork_url,created_at";

function sortVersions(versions: any[]) {
  return [...versions].sort((a, b) => {
    const byVersion = Number(b.version_number || 0) - Number(a.version_number || 0);
    if (byVersion !== 0) return byVersion;
    return Date.parse(b.created_at || "") - Date.parse(a.created_at || "");
  });
}

async function listVersionsByGroup(serviceClient: ReturnType<typeof buildServiceClient>, trackGroupId: string) {
  const trackVersionsTable = (serviceClient as any).from("track_versions");
  let result = await trackVersionsTable
    .select(versionSelect)
    .eq("track_group_id", trackGroupId)
    .order("version_number", { ascending: false });

  if (isMissingColumnError(result.error)) {
    result = await trackVersionsTable
      .select(versionSelectWithoutRoot)
      .eq("track_group_id", trackGroupId)
      .order("version_number", { ascending: false });
  }

  const { data, error } = result;
  if (error) throw error;
  return data || [];
}

async function getVersionById(serviceClient: ReturnType<typeof buildServiceClient>, versionId: string) {
  const trackVersionsTable = (serviceClient as any).from("track_versions");
  let result = await trackVersionsTable
    .select(versionSelect)
    .eq("id", versionId)
    .maybeSingle();

  if (isMissingColumnError(result.error)) {
    result = await trackVersionsTable
      .select(versionSelectWithoutRoot)
      .eq("id", versionId)
      .maybeSingle();
  }

  const { data, error } = result;
  if (error) throw error;
  return data || null;
}

async function getVersionByAudioUrl(serviceClient: ReturnType<typeof buildServiceClient>, audioUrl: string) {
  const trackVersionsTable = (serviceClient as any).from("track_versions");
  let result = await trackVersionsTable
    .select(versionSelect)
    .eq("audio_url", audioUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingColumnError(result.error)) {
    result = await trackVersionsTable
      .select(versionSelectWithoutRoot)
      .eq("audio_url", audioUrl)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  const { data, error } = result;
  if (error) throw error;
  return data || null;
}

function buildProjectFromVersion(version: any) {
  return {
    id: `handoff-${version.track_group_id || version.id}`,
    title: version.title || "Untitled Studio track",
    artist: null,
    genre: null,
    trackGroupId: version.track_group_id || null,
    trackVersionId: version.id || null,
    audioUrl: version.audio_url || null,
    createdAt: version.created_at || null,
    source: "studio",
    sourceLabel: "Opened from Studio",
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingColumnError(error: any) {
  return error?.code === "42703" || String(error?.message || "").includes("does not exist");
}

export async function GET(request: NextRequest) {
  try {
    const trackId = request.nextUrl.searchParams.get("track")?.trim() || "";
    console.log("STUDIO PRO HANDOFF PARAM", trackId);
    console.log("HANDOFF PARAM RECEIVED", trackId);
    if (!trackId) {
      return NextResponse.json({ error: "track is required" }, { status: 400 });
    }

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

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);

    const sendResult = (branch: string, result: any, init?: ResponseInit) => {
      const payload = { branch, ...result };
      console.log("STUDIO PRO HANDOFF BRANCH", branch);
      console.log("STUDIO PRO HANDOFF RESULT", payload);
      console.log("HANDOFF BRANCH USED", branch);
      console.log("HANDOFF RESULT RETURNED", payload);
      return NextResponse.json(payload, init);
    };

    let versionById: any = null;
    let versionByIdError: any = null;
    if (isUuid(trackId)) {
      const trackVersionsTable = (serviceClient as any).from("track_versions");
      let versionResult = await trackVersionsTable
        .select(versionSelect)
        .eq("id", trackId)
        .maybeSingle();
      if (isMissingColumnError(versionResult.error)) {
        versionResult = await trackVersionsTable
          .select(versionSelectWithoutRoot)
          .eq("id", trackId)
          .maybeSingle();
      }
      versionById = versionResult.data;
      versionByIdError = versionResult.error;
    }

    if (versionByIdError) throw versionByIdError;
    if (versionById?.track_group_id) {
      const versions = await listVersionsByGroup(serviceClient, versionById.track_group_id);
      return sendResult("track_versions.id", {
        project: buildProjectFromVersion(versionById),
        versions: versions.length ? versions : [versionById],
      });
    }

    let trackRow: any = null;
    let trackError: any = null;
    let trackFallbackResult: any = null;
    if (isUuid(trackId)) {
      let trackResult = await serviceClient
        .from("tracks")
        .select(trackSelectExtended)
        .eq("id", trackId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (isMissingColumnError(trackResult.error)) {
        trackResult = await serviceClient
          .from("tracks")
          .select(trackSelectBase)
          .eq("id", trackId)
          .eq("user_id", user.id)
          .maybeSingle();
      }

      trackRow = trackResult.data;
      trackError = trackResult.error;
    }

    if (trackError) throw trackError;
    if (trackRow) {
      if (trackRow.source_track_version_id) {
        const linkedVersion = await getVersionById(serviceClient, trackRow.source_track_version_id);
        if (linkedVersion?.track_group_id) {
          const versions = await listVersionsByGroup(serviceClient, linkedVersion.track_group_id);
          return sendResult("tracks.source_track_version_id", {
            project: {
              id: String(trackRow.id),
              title: trackRow.title || linkedVersion.title || versions[0]?.title || "Untitled Studio track",
              artist: trackRow.artist || null,
              genre: trackRow.genre || null,
              trackGroupId: linkedVersion.track_group_id,
              trackVersionId: linkedVersion.id,
              audioUrl: trackRow.audio_url || linkedVersion.audio_url || versions[0]?.audio_url || null,
              createdAt: trackRow.created_at || linkedVersion.created_at || versions[0]?.created_at || null,
              source: "studio",
              sourceLabel: "Opened from Studio",
            },
            versions: versions.length ? versions : [linkedVersion],
          });
        }
      }

      if (trackRow.audio_url) {
        const linkedVersion = await getVersionByAudioUrl(serviceClient, trackRow.audio_url);
        if (linkedVersion?.track_group_id) {
          const versions = await listVersionsByGroup(serviceClient, linkedVersion.track_group_id);
          return sendResult("tracks.audio_url", {
            project: {
              id: String(trackRow.id),
              title: trackRow.title || linkedVersion.title || versions[0]?.title || "Untitled Studio track",
              artist: trackRow.artist || null,
              genre: trackRow.genre || null,
              trackGroupId: linkedVersion.track_group_id,
              trackVersionId: linkedVersion.id,
              audioUrl: trackRow.audio_url || linkedVersion.audio_url || versions[0]?.audio_url || null,
              createdAt: trackRow.created_at || linkedVersion.created_at || versions[0]?.created_at || null,
              source: "studio",
              sourceLabel: "Opened from Studio",
            },
            versions: versions.length ? versions : [linkedVersion],
          });
        }
      }

      const fallbackVersion = {
        id: `track-${trackRow.id}`,
        track_group_id: null,
        version_number: 1,
        title: trackRow.title || "Untitled Studio track",
        version_label: "Studio Track",
        provider: trackRow.source_provider || "studio",
        audio_url: trackRow.audio_url || null,
        artwork_url: trackRow.artwork_url || null,
        duration: null,
        created_at: trackRow.created_at || null,
        stems_status: "not_started",
      };

      trackFallbackResult = {
        project: {
          id: String(trackRow.id),
          title: trackRow.title || "Untitled Studio track",
          artist: trackRow.artist || null,
          genre: trackRow.genre || null,
          trackGroupId: null,
          trackVersionId: fallbackVersion.id,
          audioUrl: trackRow.audio_url || null,
          createdAt: trackRow.created_at || null,
          source: "studio",
          sourceLabel: "Opened from Studio",
        },
        versions: [fallbackVersion],
      };
    }

    let projectById: any = null;
    let projectByIdError: any = null;
    if (isUuid(trackId)) {
      const projectResult = await serviceClient
        .from("studio_projects")
        .select("id,track_group_id,project_name,created_at,updated_at")
        .eq("id", trackId)
        .eq("user_id", user.id)
        .maybeSingle();
      projectById = projectResult.data;
      projectByIdError = projectResult.error;
    }

    if (projectByIdError) throw projectByIdError;

    const projectGroupId = projectById?.track_group_id || (isUuid(trackId) ? trackId : "");
    const versionsByGroup = projectGroupId ? await listVersionsByGroup(serviceClient, projectGroupId) : [];
    if (versionsByGroup.length) {
      const sortedVersions = sortVersions(versionsByGroup);
      const active = sortedVersions[0];
      return sendResult(projectById ? "studio_projects.id" : "track_group_id/project id", {
        project: {
          id: projectById?.id || `handoff-${projectGroupId}`,
          title: active.title || projectById?.project_name || "Untitled Studio track",
          artist: null,
          genre: null,
          trackGroupId: active.track_group_id || projectGroupId,
          trackVersionId: active.id || null,
          audioUrl: active.audio_url || null,
          createdAt: active.created_at || projectById?.updated_at || projectById?.created_at || null,
          source: "studio",
          sourceLabel: "Opened from Studio",
        },
        versions: sortedVersions,
      });
    }

    let generationJob: any = null;
    let generationJobError: any = null;
    if (isUuid(trackId)) {
      const generationJobResult = await serviceClient
        .from("generation_jobs")
        .select("id,title,provider,status,audio_url,track_group_id,track_version_id,created_at")
        .eq("id", trackId)
        .eq("user_id", user.id)
        .maybeSingle();
      generationJob = generationJobResult.data;
      generationJobError = generationJobResult.error;
    }

    if (generationJobError) throw generationJobError;
    if (generationJob) {
      if (generationJob.track_group_id) {
        const versions = await listVersionsByGroup(serviceClient, generationJob.track_group_id);
        if (versions.length) {
          return sendResult("generation_jobs.id", {
            project: {
              id: `generation-job-${generationJob.id}`,
              title: versions[0]?.title || generationJob.title || "Untitled Studio track",
              artist: null,
              genre: null,
              trackGroupId: generationJob.track_group_id,
              trackVersionId: generationJob.track_version_id || versions[0]?.id || null,
              audioUrl: versions[0]?.audio_url || generationJob.audio_url || null,
              createdAt: versions[0]?.created_at || generationJob.created_at || null,
              source: "studio",
              sourceLabel: "Opened from Studio",
            },
            versions,
          });
        }
      }

      if (generationJob.audio_url) {
        const fallbackVersion = {
          id: `generation-job-${generationJob.id}`,
          track_group_id: generationJob.track_group_id || null,
          version_number: 1,
          title: generationJob.title || "Untitled Studio track",
          version_label: "Generated Result",
          provider: generationJob.provider || "studio",
          audio_url: generationJob.audio_url,
          artwork_url: null,
          duration: null,
          created_at: generationJob.created_at || null,
          stems_status: "not_started",
        };

        return sendResult("generation_jobs.id", {
          project: {
            id: `generation-job-${generationJob.id}`,
            title: fallbackVersion.title,
            artist: null,
            genre: null,
            trackGroupId: generationJob.track_group_id || null,
            trackVersionId: fallbackVersion.id,
            audioUrl: generationJob.audio_url,
            createdAt: generationJob.created_at || null,
            source: "studio",
            sourceLabel: "Opened from Studio",
          },
          versions: [fallbackVersion],
        });
      }
    }

    let studioJob: any = null;
    let studioJobError: any = null;
    if (isUuid(trackId)) {
      const studioJobResult = await serviceClient
        .from("studio_jobs")
        .select("id,title,provider,status,audio_url,artwork_url,created_at")
        .eq("id", trackId)
        .eq("user_id", user.id)
        .maybeSingle();
      studioJob = studioJobResult.data;
      studioJobError = studioJobResult.error;
    }

    if (studioJobError) throw studioJobError;
    if (studioJob?.audio_url) {
      const fallbackVersion = {
        id: `studio-job-${studioJob.id}`,
        track_group_id: null,
        version_number: 1,
        title: studioJob.title || "Untitled Studio track",
        version_label: "Generated Result",
        provider: studioJob.provider || "studio",
        audio_url: studioJob.audio_url,
        artwork_url: studioJob.artwork_url || null,
        duration: null,
        created_at: studioJob.created_at || null,
        stems_status: "not_started",
      };

      return sendResult("studio_jobs.id", {
        project: {
          id: `studio-job-${studioJob.id}`,
          title: fallbackVersion.title,
          artist: null,
          genre: null,
          trackGroupId: null,
          trackVersionId: fallbackVersion.id,
          audioUrl: studioJob.audio_url,
          createdAt: studioJob.created_at || null,
          source: "studio",
          sourceLabel: "Opened from Studio",
        },
        versions: [fallbackVersion],
      });
    }

    if (trackFallbackResult) {
      return sendResult("tracks.id.fallback", trackFallbackResult);
    }

    return sendResult(
      "none",
      {
        project: null,
        versions: [],
        error: "No Studio track, version, project, or job matched this handoff id.",
      },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("Studio PRO handoff resolver error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to resolve Studio PRO handoff" },
      { status: 500 }
    );
  }
}
