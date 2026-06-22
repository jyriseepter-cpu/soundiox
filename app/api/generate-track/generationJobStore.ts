const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type GenerationJobRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  prompt: string | null;
  vocal_mode: string | null;
  provider: string;
  status: string;
  audio_url: string | null;
  error: string | null;
  client_generation_token: string | null;
  session_key: string | null;
  request_hash: string | null;
  provider_job_id: string | null;
  provider_status: string | null;
  storage_path: string | null;
  generation_mode: string | null;
  generation_intent: string | null;
  duration_seconds: number | null;
  parent_version_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  locked_until: string | null;
  track_group_id: string | null;
  track_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TrackVersionRow = {
  id: string;
  generation_job_id: string | null;
  parent_version_id: string | null;
  root_version_id?: string | null;
  track_group_id: string;
  version_number: number;
  title: string;
  version_label: string | null;
  provider: string | null;
  generation_mode: string | null;
  prompt: string | null;
  lyrics: string | null;
  vocal_mode: string | null;
  audio_url: string;
  artwork_url: string | null;
  artwork_concept?: unknown | null;
  generation_metadata?: unknown | null;
  imported_source?: string | null;
  vocal_url?: string | null;
  voiceover_url?: string | null;
  stems_status?: string | null;
  stems_requested_at?: string | null;
  stems_completed_at?: string | null;
  stems_error?: string | null;
  stem_drums_url?: string | null;
  stem_bass_url?: string | null;
  stem_vocals_url?: string | null;
  stem_other_url?: string | null;
  stems_metadata?: unknown | null;
  storage_path: string | null;
  duration: number | null;
  is_original: boolean;
  generation_intent?: string | null;
  created_at: string;
  updated_at: string;
};

type CreateGenerationJobInput = {
  clientGenerationToken: string;
  sessionKey: string;
  requestHash: string;
  title: string;
  prompt: string;
  provider: string;
  vocalMode: string;
  generationMode: string;
  generationIntent: string;
  durationSeconds: number;
  trackGroupId?: string | null;
  parentVersionId?: string | null;
  lockedUntil: string;
};

function requireSupabaseRestEnv() {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  }

  return {
    supabaseUrl: SUPABASE_URL.replace(/\/+$/, ""),
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  };
}

function restHeaders(prefer?: string) {
  const { serviceRoleKey } = requireSupabaseRestEnv();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function restUrl(path: string, query = "") {
  const { supabaseUrl } = requireSupabaseRestEnv();
  return `${supabaseUrl}/rest/v1/${path}${query ? `?${query}` : ""}`;
}

function selectGenerationJobFields() {
  return [
    "id",
    "user_id",
    "title",
    "prompt",
    "vocal_mode",
    "provider",
    "status",
    "audio_url",
    "error",
    "client_generation_token",
    "session_key",
    "request_hash",
    "provider_job_id",
    "provider_status",
    "storage_path",
    "generation_mode",
    "generation_intent",
    "duration_seconds",
    "parent_version_id",
    "started_at",
    "completed_at",
    "failed_at",
    "cancelled_at",
    "locked_until",
    "track_group_id",
    "track_version_id",
    "created_at",
    "updated_at",
  ].join(",");
}

function selectTrackVersionFields(
  includeExtendedFields = false,
  includeArtworkConceptOnly = false,
  includeStemFields = false,
  includeRootVersionId = true
) {
  const fields = [
    "id",
    "generation_job_id",
    "parent_version_id",
    ...(includeRootVersionId ? ["root_version_id"] : []),
    "track_group_id",
    "version_number",
    "title",
    "version_label",
    "provider",
    "generation_mode",
    "prompt",
    "lyrics",
    "vocal_mode",
    "audio_url",
    "artwork_url",
    ...(includeExtendedFields
      ? ["artwork_concept", "generation_metadata", "imported_source", "vocal_url", "voiceover_url"]
      : includeArtworkConceptOnly
        ? ["artwork_concept"]
        : []),
    ...(includeStemFields
      ? [
          "stems_status",
          "stems_requested_at",
          "stems_completed_at",
          "stems_error",
          "stem_drums_url",
          "stem_bass_url",
          "stem_vocals_url",
          "stem_other_url",
          "stems_metadata",
        ]
      : []),
    "storage_path",
    "duration",
    "is_original",
    "created_at",
    "updated_at",
  ];

  return fields.join(",");
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isMissingColumnPayload(payload: any) {
  const values = [payload?.message, payload?.details, payload?.hint, payload?.code]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return values.some(
    (value) =>
      value.includes("column") ||
      value.includes("schema cache") ||
      value.includes("42703") ||
      value.includes("pgrst204")
  );
}

export function buildPublicStorageUrl(bucket: string, objectPath: string) {
  const { supabaseUrl } = requireSupabaseRestEnv();
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}

export async function findGenerationJobByToken(clientGenerationToken: string) {
  const token = clientGenerationToken.trim();
  if (!token) return null;

  const query = new URLSearchParams({
    select: selectGenerationJobFields(),
    client_generation_token: `eq.${token}`,
    limit: "1",
  });

  const response = await fetch(restUrl("generation_jobs", query.toString()), {
    method: "GET",
    headers: restHeaders(),
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `generation_jobs lookup failed with status ${response.status}`
    );
  }

  return Array.isArray(payload) && payload[0] ? (payload[0] as GenerationJobRow) : null;
}

export async function findGenerationJobByProviderJobId(providerJobId: string) {
  const jobId = providerJobId.trim();
  if (!jobId) return null;

  const query = new URLSearchParams({
    select: selectGenerationJobFields(),
    provider_job_id: `eq.${jobId}`,
    limit: "1",
  });

  const response = await fetch(restUrl("generation_jobs", query.toString()), {
    method: "GET",
    headers: restHeaders(),
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `generation_jobs provider lookup failed with status ${response.status}`
    );
  }

  return Array.isArray(payload) && payload[0] ? (payload[0] as GenerationJobRow) : null;
}

export async function findReusableGenerationJob(args: {
  sessionKey: string;
  requestHash: string;
  provider: string;
}) {
  if (!args.sessionKey || !args.requestHash || !args.provider) return null;

  const query = new URLSearchParams({
    select: selectGenerationJobFields(),
    session_key: `eq.${args.sessionKey}`,
    request_hash: `eq.${args.requestHash}`,
    provider: `eq.${args.provider}`,
    status: "in.(starting,queued,running)",
    order: "created_at.desc",
    limit: "1",
  });

  const response = await fetch(restUrl("generation_jobs", query.toString()), {
    method: "GET",
    headers: restHeaders(),
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `generation_jobs reusable lookup failed with status ${response.status}`
    );
  }

  return Array.isArray(payload) && payload[0] ? (payload[0] as GenerationJobRow) : null;
}

export async function createGenerationJob(input: CreateGenerationJobInput) {
  const existing = await findGenerationJobByToken(input.clientGenerationToken);
  if (existing) return { job: existing, created: false };

  const response = await fetch(
    restUrl("generation_jobs", `select=${encodeURIComponent(selectGenerationJobFields())}`),
    {
      method: "POST",
      headers: restHeaders("return=representation"),
      body: JSON.stringify({
        user_id: null,
        title: input.title || null,
        prompt: input.prompt || null,
        vocal_mode: input.vocalMode || null,
        provider: input.provider,
        status: "starting",
        provider_status: "starting",
        generation_mode: input.generationMode,
        generation_intent: input.generationIntent,
        duration_seconds: input.durationSeconds,
        track_group_id: input.trackGroupId || null,
        parent_version_id: input.parentVersionId || null,
        client_generation_token: input.clientGenerationToken,
        session_key: input.sessionKey,
        request_hash: input.requestHash,
        started_at: new Date().toISOString(),
        locked_until: input.lockedUntil,
      }),
      cache: "no-store",
    }
  );
  const payload = await parseJsonResponse(response);

  if (response.status === 409) {
    const racedExisting = await findGenerationJobByToken(input.clientGenerationToken);
    if (racedExisting) return { job: racedExisting, created: false };

    const reusableExisting = await findReusableGenerationJob({
      sessionKey: input.sessionKey,
      requestHash: input.requestHash,
      provider: input.provider,
    });
    if (reusableExisting) return { job: reusableExisting, created: false };
  }

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `generation_jobs insert failed with status ${response.status}`
    );
  }

  if (!Array.isArray(payload) || !payload[0]) {
    throw new Error("generation_jobs insert returned no row");
  }

  return {
    job: payload[0] as GenerationJobRow,
    created: true,
  };
}

export async function updateGenerationJobById(
  id: string,
  updates: Partial<GenerationJobRow>
) {
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: selectGenerationJobFields(),
  });

  const response = await fetch(restUrl("generation_jobs", query.toString()), {
    method: "PATCH",
    headers: restHeaders("return=representation"),
    body: JSON.stringify(updates),
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `generation_jobs update failed with status ${response.status}`
    );
  }

  return Array.isArray(payload) && payload[0] ? (payload[0] as GenerationJobRow) : null;
}

export async function updateGenerationJobByProviderJobId(
  providerJobId: string,
  updates: Partial<GenerationJobRow>
) {
  const existing = await findGenerationJobByProviderJobId(providerJobId);
  if (!existing) return null;
  return await updateGenerationJobById(existing.id, updates);
}

export async function findTrackVersionById(id: string) {
  const versionId = id.trim();
  if (!versionId) return null;

  const buildQuery = (includeRootVersionId: boolean) => new URLSearchParams({
    select: selectTrackVersionFields(false, false, false, includeRootVersionId),
    id: `eq.${versionId}`,
    limit: "1",
  });

  let response = await fetch(restUrl("track_versions", buildQuery(true).toString()), {
    method: "GET",
    headers: restHeaders(),
    cache: "no-store",
  });
  let payload = await parseJsonResponse(response);

  if (!response.ok && isMissingColumnPayload(payload)) {
    response = await fetch(restUrl("track_versions", buildQuery(false).toString()), {
      method: "GET",
      headers: restHeaders(),
      cache: "no-store",
    });
    payload = await parseJsonResponse(response);
  }

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `track_versions lookup failed with status ${response.status}`
    );
  }

  return Array.isArray(payload) && payload[0] ? (payload[0] as TrackVersionRow) : null;
}

export async function findTrackVersionByGenerationJobId(generationJobId: string) {
  const jobId = generationJobId.trim();
  if (!jobId) return null;

  const buildQuery = (includeRootVersionId: boolean) => new URLSearchParams({
    select: selectTrackVersionFields(false, false, false, includeRootVersionId),
    generation_job_id: `eq.${jobId}`,
    limit: "1",
  });

  let response = await fetch(restUrl("track_versions", buildQuery(true).toString()), {
    method: "GET",
    headers: restHeaders(),
    cache: "no-store",
  });
  let payload = await parseJsonResponse(response);

  if (!response.ok && isMissingColumnPayload(payload)) {
    response = await fetch(restUrl("track_versions", buildQuery(false).toString()), {
      method: "GET",
      headers: restHeaders(),
      cache: "no-store",
    });
    payload = await parseJsonResponse(response);
  }

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `track_versions generation lookup failed with status ${response.status}`
    );
  }

  return Array.isArray(payload) && payload[0] ? (payload[0] as TrackVersionRow) : null;
}

export async function listTrackVersionsByGroupId(trackGroupId: string) {
  const groupId = trackGroupId.trim();
  if (!groupId) return [];

  const buildQuery = (
    includeExtendedFields: boolean,
    includeArtworkConceptOnly = false,
    includeStemFields = false,
    includeRootVersionId = true
  ) => new URLSearchParams({
    select: selectTrackVersionFields(includeExtendedFields, includeArtworkConceptOnly, includeStemFields, includeRootVersionId),
    track_group_id: `eq.${groupId}`,
    order: "version_number.desc",
  });

  let response = await fetch(restUrl("track_versions", buildQuery(true, false, true).toString()), {
    method: "GET",
    headers: restHeaders(),
    cache: "no-store",
  });
  let payload = await parseJsonResponse(response);

  if (!response.ok && isMissingColumnPayload(payload)) {
    response = await fetch(restUrl("track_versions", buildQuery(true, false, true, false).toString()), {
      method: "GET",
      headers: restHeaders(),
      cache: "no-store",
    });
    payload = await parseJsonResponse(response);
  }

  if (!response.ok && isMissingColumnPayload(payload)) {
    response = await fetch(restUrl("track_versions", buildQuery(false, true, true).toString()), {
      method: "GET",
      headers: restHeaders(),
      cache: "no-store",
    });
    payload = await parseJsonResponse(response);

    if (!response.ok && isMissingColumnPayload(payload)) {
      response = await fetch(restUrl("track_versions", buildQuery(false, false, true).toString()), {
        method: "GET",
        headers: restHeaders(),
        cache: "no-store",
      });
      payload = await parseJsonResponse(response);

      if (!response.ok && isMissingColumnPayload(payload)) {
        response = await fetch(restUrl("track_versions", buildQuery(true).toString()), {
          method: "GET",
          headers: restHeaders(),
          cache: "no-store",
        });
        payload = await parseJsonResponse(response);

        if (!response.ok && isMissingColumnPayload(payload)) {
          response = await fetch(restUrl("track_versions", buildQuery(false, true).toString()), {
            method: "GET",
            headers: restHeaders(),
            cache: "no-store",
          });
          payload = await parseJsonResponse(response);

          if (!response.ok && isMissingColumnPayload(payload)) {
            response = await fetch(restUrl("track_versions", buildQuery(false).toString()), {
              method: "GET",
              headers: restHeaders(),
              cache: "no-store",
            });
            payload = await parseJsonResponse(response);
          }
        }
      }
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `track_versions list failed with status ${response.status}`
    );
  }

  const versions = Array.isArray(payload) ? (payload as TrackVersionRow[]) : [];
  const generationJobIds = versions
    .map((version) => version.generation_job_id)
    .filter((id): id is string => Boolean(id));

  if (generationJobIds.length === 0) return versions;

  const jobsQuery = new URLSearchParams({
    select: "id,generation_intent",
    id: `in.(${generationJobIds.join(",")})`,
  });
  const jobsResponse = await fetch(restUrl("generation_jobs", jobsQuery.toString()), {
    method: "GET",
    headers: restHeaders(),
    cache: "no-store",
  });
  const jobsPayload = await parseJsonResponse(jobsResponse);

  if (!jobsResponse.ok || !Array.isArray(jobsPayload)) {
    return versions;
  }

  const intentByJobId = new Map(
    jobsPayload.map((job: { id: string; generation_intent: string | null }) => [
      job.id,
      job.generation_intent,
    ])
  );

  return versions.map((version) => ({
    ...version,
    generation_intent: version.generation_job_id
      ? intentByJobId.get(version.generation_job_id) || null
      : null,
  }));
}

async function createTrackVersion(input: {
  generationJob: GenerationJobRow;
  id: string;
  trackGroupId: string;
  rootVersionId: string;
  versionNumber: number;
  title: string;
  versionLabel: string;
  audioUrl: string;
  storagePath: string | null;
  duration: number;
  isOriginal: boolean;
}) {
  const response = await fetch(
    restUrl("track_versions", `select=${encodeURIComponent(selectTrackVersionFields())}`),
    {
      method: "POST",
      headers: restHeaders("return=representation"),
      body: JSON.stringify({
        generation_job_id: input.generationJob.id,
        id: input.id,
        parent_version_id: input.generationJob.parent_version_id || null,
        root_version_id: input.rootVersionId,
        track_group_id: input.trackGroupId,
        version_number: input.versionNumber,
        title: input.title,
        version_label: input.versionLabel,
        provider: input.generationJob.provider || null,
        generation_mode: input.generationJob.generation_mode || null,
        prompt: input.generationJob.prompt || null,
        lyrics: null,
        vocal_mode: input.generationJob.vocal_mode || null,
        audio_url: input.audioUrl,
        artwork_url: null,
        storage_path: input.storagePath,
        duration: input.duration,
        is_original: input.isOriginal,
      }),
      cache: "no-store",
    }
  );
  const payload = await parseJsonResponse(response);

  if (response.status === 409) {
    const existing = await findTrackVersionByGenerationJobId(input.generationJob.id);
    if (existing) return existing;
  }

  if (!response.ok) {
    throw new Error(
      typeof payload === "string"
        ? payload
        : payload?.message || `track_versions insert failed with status ${response.status}`
    );
  }

  if (!Array.isArray(payload) || !payload[0]) {
    throw new Error("track_versions insert returned no row");
  }

  return payload[0] as TrackVersionRow;
}

export async function ensureTrackVersionForGenerationJob(args: {
  generationJob: GenerationJobRow;
  title: string;
  audioUrl: string;
  storagePath: string | null;
  duration: number;
}) {
  if (args.generationJob.track_version_id) {
    const existingById = await findTrackVersionById(args.generationJob.track_version_id);
    if (existingById) return existingById;
  }

  const existingByGenerationJob = await findTrackVersionByGenerationJobId(args.generationJob.id);
  if (existingByGenerationJob) {
    if (
      args.generationJob.track_version_id !== existingByGenerationJob.id ||
      args.generationJob.track_group_id !== existingByGenerationJob.track_group_id
    ) {
      await updateGenerationJobById(args.generationJob.id, {
        track_group_id: existingByGenerationJob.track_group_id,
        track_version_id: existingByGenerationJob.id,
      });
    }

    return existingByGenerationJob;
  }

  const trackGroupId = args.generationJob.track_group_id || crypto.randomUUID();
  const existingVersions = await listTrackVersionsByGroupId(trackGroupId);
  const latestVersionNumber = existingVersions.reduce(
    (latest, version) => Math.max(latest, version.version_number || 0),
    0
  );
  const isOriginal = existingVersions.length === 0;
  const versionId = crypto.randomUUID();
  const rootVersionId =
    isOriginal
      ? versionId
      : existingVersions.find((version) => version.is_original)?.root_version_id ||
        existingVersions.find((version) => version.is_original)?.id ||
        existingVersions[existingVersions.length - 1]?.root_version_id ||
        args.generationJob.parent_version_id ||
        versionId;
  const versionNumber = isOriginal ? 1 : latestVersionNumber + 1;
  const versionLabel = isOriginal ? "Original" : `Version ${versionNumber}`;
  const version = await createTrackVersion({
    generationJob: args.generationJob,
    id: versionId,
    trackGroupId,
    rootVersionId,
    versionNumber,
    title: args.title,
    versionLabel,
    audioUrl: args.audioUrl,
    storagePath: args.storagePath,
    duration: args.duration,
    isOriginal,
  });

  await updateGenerationJobById(args.generationJob.id, {
    track_group_id: version.track_group_id,
    track_version_id: version.id,
  });

  return version;
}
