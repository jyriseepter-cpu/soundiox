import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_BUCKET || "tracks";
const LOOP_CROSSFADE_SECONDS = 1.0;
const EXTEND_CROSSFADE_SECONDS = 1.0;
const MIXER_OUTPUT_BITRATE = "320k";

class FfmpegMissingError extends Error {
  constructor(message = "ffmpeg binary is not available") {
    super(message);
    this.name = "FfmpegMissingError";
  }
}

type MixerRenderBody = {
  trackVersionId?: string;
  trackGroupId?: string;
  title?: string;
  mixer?: unknown;
  coproducerPreset?: string | null;
  preview?: boolean;
  previewSeconds?: number;
  stem_drums_url?: string;
  stem_bass_url?: string;
  stem_vocals_url?: string;
  stem_other_url?: string;
  stemDrumsUrl?: string;
  stemBassUrl?: string;
  stemVocalsUrl?: string;
  stemOtherUrl?: string;
  studioProMetadata?: unknown;
  arrangementMetadata?: unknown;
};
type LoopMode = "off" | "15" | "30" | "60";
type ExtendMode = "off" | "15" | "30" | "60";

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

function safeTitle(value: string) {
  return value.trim() || "Studio Mix";
}

function summarizeMixer(mixer: unknown) {
  if (!mixer || typeof mixer !== "object") return "Mixer settings not provided.";

  return Object.entries(mixer as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

function getMixerValues(mixer: unknown) {
  const raw = mixer && typeof mixer === "object" ? (mixer as Record<string, unknown>) : {};
  const read = (key: string, fallback: number, min = 0, max = 100) => {
    const value = Number(raw[key]);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
  };
  const readLoopMode = (): LoopMode => {
    const value = String(raw.loopMode || "off").trim().toLowerCase();
    if (value === "15" || value === "15s" || value === "15s loop") return "15";
    if (value === "30" || value === "30s" || value === "30s loop") return "30";
    if (value === "60" || value === "60s" || value === "60s loop") return "60";
    return "off";
  };
  const readExtendMode = (): ExtendMode => {
    const value = String(raw.extendMode || "off").trim().toLowerCase();
    if (value === "15" || value === "15s" || value === "extend 15s") return "15";
    if (value === "30" || value === "30s" || value === "extend 30s") return "30";
    if (value === "60" || value === "60s" || value === "extend 60s") return "60";
    return "off";
  };

  const loopMode = readLoopMode();
  const extendMode = readExtendMode();
  const masterNormalize =
    raw.masterNormalize === true ||
    raw.masterNormalize === "true" ||
    raw.masterNormalize === "on" ||
    raw.masterNormalize === 1;

  return {
    drums: read("drums", 100),
    bass: read("bass", 100),
    vocal: read("vocal", 100),
    music: read("music", 100),
    subBass: read("subBass", 0),
    speed: read("speed", 100, 70, 130),
    pitch: Math.round(read("pitch", 0, -12, 12)),
    loopMode,
    loopDurationSeconds: loopMode === "off" ? null : Number(loopMode),
    extendMode,
    extendSeconds: extendMode === "off" ? null : Number(extendMode),
    masterNormalize,
  };
}

function isNeutralMixer(mixerValues: ReturnType<typeof getMixerValues>) {
  return (
    mixerValues.drums === 100 &&
    mixerValues.bass === 100 &&
    mixerValues.vocal === 100 &&
    mixerValues.music === 100 &&
    mixerValues.speed === 100 &&
    mixerValues.pitch === 0 &&
    mixerValues.subBass === 0 &&
    mixerValues.loopMode === "off" &&
    mixerValues.extendMode === "off" &&
    mixerValues.masterNormalize === false
  );
}

function hasMockStemsMetadata(value: unknown) {
  return Boolean(value && typeof value === "object" && (value as { mock?: unknown }).mock);
}

function normalizeStudioProMetadata(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const dspChain = raw.dspChain && typeof raw.dspChain === "object" ? raw.dspChain : {};

  return {
    studioPro: raw.studioPro === true,
    studioProFreeze: raw.studioProFreeze === true,
    studioProRenderMode:
      typeof raw.studioProRenderMode === "string"
        ? raw.studioProRenderMode
        : "realtime-dsp-final-render-v1",
    freezeSourceVersionId:
      typeof raw.freezeSourceVersionId === "string" ? raw.freezeSourceVersionId : null,
    freezeType:
      typeof raw.freezeType === "string" ? raw.freezeType : null,
    committedAt:
      typeof raw.committedAt === "string" ? raw.committedAt : null,
    dspChain,
    humanDirectedEdit: raw.humanDirectedEdit !== false,
    activePreset: typeof raw.activePreset === "string" ? raw.activePreset : null,
    source: raw.source === "studio-pro" ? "studio-pro" : "studio",
  };
}

function normalizeArrangementMetadata(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const readNumber = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(raw[key]);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
  };

  return {
    arrangementRender: raw.arrangementRender === true,
    arrangementType: typeof raw.arrangementType === "string" ? raw.arrangementType : "arrangement-edit",
    section: typeof raw.section === "string" ? raw.section : null,
    repeatCount: Math.round(readNumber("repeatCount", 0, 0, 12)),
    trimStartSeconds: readNumber("trimStartSeconds", 0, 0, 120),
    trimEndSeconds: readNumber("trimEndSeconds", 0, 0, 120),
    labelBase: typeof raw.labelBase === "string" ? raw.labelBase.trim() : "",
    badge: typeof raw.badge === "string" ? raw.badge.trim() : "",
  };
}

async function columnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  table: string,
  column: string
) {
  const { error } = await serviceClient.from(table).select(column).limit(1);
  return !error;
}

function gainFromSlider(value: number) {
  return Math.max(0, Math.min(1.5, value / 100));
}

function subBassGains(value: number) {
  const amount = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)) / 100;
  return {
    subGainDb: amount * 5.5,
    punchGainDb: amount * 3.5,
  };
}

function atempoFromSpeed(speed: number) {
  return Math.max(0.5, Math.min(2, speed / 100));
}

function pitchRatioFromSemitones(semitones: number) {
  return Math.pow(2, semitones / 12);
}

function buildPitchFilter(semitones: number) {
  if (!semitones) return null;

  const ratio = pitchRatioFromSemitones(semitones);
  const sampleRate = Math.round(44100 * ratio);
  const compensationTempo = Math.max(0.5, Math.min(2, 1 / ratio));
  return `asetrate=${sampleRate},aresample=44100,atempo=${compensationTempo.toFixed(4)}`;
}

function finalizeAudioChain(chain: string, masterNormalize: boolean) {
  if (masterNormalize) {
    return `${chain},loudnorm=I=-16:TP=-1.5:LRA=11`;
  }

  return `${chain},alimiter=limit=0.98`;
}

function resolveFfmpegPath() {
  const platformPackage = `${process.platform}-${process.arch}`;
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const ffmpegPath = path.join(
    process.cwd(),
    "node_modules",
    "@ffmpeg-installer",
    platformPackage,
    binaryName
  );
  console.log("STUDIO MIXER FFMPEG PATH", ffmpegPath);

  if (!ffmpegPath) {
    throw new FfmpegMissingError();
  }

  return ffmpegPath;
}

async function downloadStem(url: string, filePath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Stem download failed with status ${response.status}`);
  }

  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

async function downloadAudioBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Source audio download failed with status ${response.status}`);
  }

  return {
    audioBuffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath();
    console.log("MIXER RENDER SPAWN DEBUG", {
      ffmpegInstallerPackage: `@ffmpeg-installer/${process.platform}-${process.arch}`,
      ffmpegPath,
      command: ffmpegPath,
      args,
    });
    const ffmpeg = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderr: Buffer[] = [];

    ffmpeg.stderr.on("data", (chunk) => {
      stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    ffmpeg.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new FfmpegMissingError(`ffmpeg binary is not available at ${ffmpegPath}`));
        return;
      }

      reject(new Error(`ffmpeg failed to start: ${error.message}`));
    });
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").slice(-2000)}`
        )
      );
    });
  });
}

function readableFfmpegMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown ffmpeg error");
  if (message.includes("ffmpeg exited")) {
    return "The selected audio section could not be rendered with the current duration and loop settings.";
  }
  return message.slice(0, 280);
}

async function renderStemMix(args: {
  stems: Array<{ name: string; url: string; gain: number }>;
  fallbackAudioUrl: string;
  mixerValues: ReturnType<typeof getMixerValues>;
  previewSeconds?: number | null;
  previewStartSeconds?: number;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  sourceDurationSeconds?: number | null;
  loopRepeatCount?: number;
}) {
  const workDir = await mkdtemp(path.join(tmpdir(), "soundiox-mix-"));

  try {
    const usableStems =
      args.stems.filter((stem) => stem.url) ||
      [];
    const stemsToRender =
      usableStems.length > 0
        ? usableStems
        : [{ name: "source", url: args.fallbackAudioUrl, gain: 1 }];

    const inputPaths = await Promise.all(
      stemsToRender.map(async (stem, index) => {
        const inputPath = path.join(workDir, `${index}-${stem.name}.audio`);
        await downloadStem(stem.url, inputPath);
        return inputPath;
      })
    );

    const outputPath = path.join(workDir, "rendered-mix.mp3");
    const inputArgs = inputPaths.flatMap((inputPath) => ["-i", inputPath]);
    const subBass = args.mixerValues.subBass;
    const { subGainDb, punchGainDb } = subBassGains(subBass);
    const volumeFilters = stemsToRender.map((stem, index) => {
      const gain = Number.isFinite(stem.gain) ? stem.gain : 1;
      const lowEndBoostEnabled = subBass > 0 && (stem.name === "bass" || stem.name === "other");
      const lowEndFilters = lowEndBoostEnabled
        ? [
            `equalizer=f=55:t=q:w=1.0:g=${subGainDb.toFixed(2)}`,
            `equalizer=f=100:t=q:w=1.2:g=${punchGainDb.toFixed(2)}`,
            "alimiter=limit=0.95",
          ]
        : [];

      return [`[${index}:a]volume=${gain.toFixed(4)}`, ...lowEndFilters].join(",") + `[a${index}]`;
    });
    const mixInputs = stemsToRender.map((_, index) => `[a${index}]`).join("");
    const tempo = atempoFromSpeed(args.mixerValues.speed);
    const pitchFilter = buildPitchFilter(args.mixerValues.pitch);
    const previewSeconds = args.previewSeconds || null;
    const previewStartSeconds = Math.max(0, args.previewStartSeconds || 0);
    const trimStartSeconds = Math.max(0, args.trimStartSeconds || 0);
    const trimEndSeconds = Math.max(0, args.trimEndSeconds || 0);
    const sourceDuration =
      typeof args.sourceDurationSeconds === "number" && Number.isFinite(args.sourceDurationSeconds)
        ? Math.max(0, args.sourceDurationSeconds)
        : null;
    const trimEnd =
      sourceDuration && sourceDuration > trimStartSeconds + trimEndSeconds
        ? sourceDuration - trimEndSeconds
        : null;
    const requestedLoopDuration = previewSeconds ? null : args.mixerValues.loopDurationSeconds;
    const availableLoopDuration =
      sourceDuration && sourceDuration > trimStartSeconds + trimEndSeconds
        ? Math.max(0.5, sourceDuration - trimStartSeconds - trimEndSeconds)
        : null;
    const loopDuration =
      typeof requestedLoopDuration === "number"
        ? Math.max(1, Math.min(requestedLoopDuration, availableLoopDuration || requestedLoopDuration))
        : null;
    const loopCrossfadeSeconds =
      typeof loopDuration === "number"
        ? Math.max(0.05, Math.min(LOOP_CROSSFADE_SECONDS, Math.max(0.05, loopDuration / 4)))
        : LOOP_CROSSFADE_SECONDS;
    const loopRepeatCount = Math.max(1, Math.min(12, Math.round(args.loopRepeatCount || 1)));
    const extendDuration =
      previewSeconds || typeof loopDuration === "number" ? null : args.mixerValues.extendSeconds;
    const mixStages = [
      `${mixInputs}amix=inputs=${stemsToRender.length}:duration=longest:normalize=0`,
      ...(pitchFilter ? [pitchFilter] : []),
      `atempo=${tempo.toFixed(4)}`,
    ];
    const mixedChain = mixStages.join(",");

    const buildLoopFilterGraph = (fallbackToSimpleConcat: boolean) => {
      const safeLoopDuration = Math.max(1, loopDuration || 1);
      const repeatLabels = Array.from({ length: loopRepeatCount }, (_, index) => `[loop${index}]`).join("");
      const loopedLabel = loopRepeatCount > 1 ? "[loopedrepeat]" : "[looped]";
      const repeatStages =
        loopRepeatCount > 1
          ? [
              `[looped]asplit=${loopRepeatCount}${repeatLabels}`,
              `${repeatLabels}concat=n=${loopRepeatCount}:v=0:a=1[loopedrepeat]`,
            ]
          : [];

      if (fallbackToSimpleConcat || safeLoopDuration <= loopCrossfadeSeconds * 2) {
        return [
          ...volumeFilters,
          `${mixedChain},atrim=0:${safeLoopDuration.toFixed(2)},asetpts=PTS-STARTPTS[looped]`,
          ...repeatStages,
          `${finalizeAudioChain(loopedLabel, args.mixerValues.masterNormalize)}[out]`,
        ].join(";");
      }

      const bodyDuration = Math.max(0.05, safeLoopDuration - loopCrossfadeSeconds);
      return [
        ...volumeFilters,
        `${mixedChain},atrim=0:${safeLoopDuration.toFixed(2)},asetpts=PTS-STARTPTS,asplit=3[loopbase][loopstart][loopend]`,
        `[loopbase]atrim=0:${bodyDuration.toFixed(2)},asetpts=PTS-STARTPTS[body]`,
        `[loopend]atrim=${bodyDuration.toFixed(2)}:${safeLoopDuration.toFixed(2)},asetpts=PTS-STARTPTS[end]`,
        `[loopstart]atrim=0:${loopCrossfadeSeconds.toFixed(2)},asetpts=PTS-STARTPTS[start]`,
        `[end][start]acrossfade=d=${loopCrossfadeSeconds.toFixed(2)}:c1=tri:c2=tri[xfade]`,
        `[body][xfade]concat=n=2:v=0:a=1[looped]`,
        ...repeatStages,
        `${finalizeAudioChain(loopedLabel, args.mixerValues.masterNormalize)}[out]`,
      ].join(";");
    };

    const buildFilterGraph = (fallbackLoop = false) =>
      typeof previewSeconds === "number"
        ? [
            ...volumeFilters,
            `${finalizeAudioChain(
              `${mixedChain},atrim=start=${previewStartSeconds.toFixed(
                2
              )}:duration=${previewSeconds},asetpts=PTS-STARTPTS`,
              args.mixerValues.masterNormalize
            )}[out]`,
          ].join(";")
        : typeof loopDuration === "number"
        ? buildLoopFilterGraph(fallbackLoop)
        : typeof extendDuration === "number"
          ? [
              ...volumeFilters,
              `${mixedChain},asplit=2[base][tailsrc]`,
              `[tailsrc]areverse,atrim=0:${(
                extendDuration + EXTEND_CROSSFADE_SECONDS
              ).toFixed(2)},areverse,asetpts=PTS-STARTPTS[tail]`,
              `${finalizeAudioChain(
                `[base][tail]acrossfade=d=${EXTEND_CROSSFADE_SECONDS}:c1=tri:c2=tri`,
                args.mixerValues.masterNormalize
              )}[out]`,
            ].join(";")
        : [
            ...volumeFilters,
            `${finalizeAudioChain(
              trimStartSeconds > 0 || trimEndSeconds > 0
                ? `${mixedChain},atrim=start=${trimStartSeconds.toFixed(2)}${
                    trimEnd ? `:end=${trimEnd.toFixed(2)}` : ""
                  },asetpts=PTS-STARTPTS`
                : mixedChain,
              args.mixerValues.masterNormalize
            )}[out]`,
          ].join(";");

    let filterGraph = buildFilterGraph(false);
    const buildFfmpegArgs = (graph: string) => [
      "-y",
      ...inputArgs,
      "-filter_complex",
      graph,
      "-map",
      "[out]",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      MIXER_OUTPUT_BITRATE,
      outputPath,
    ];

    try {
      await runFfmpeg(buildFfmpegArgs(filterGraph));
    } catch (error) {
      if (typeof loopDuration !== "number") {
        throw error;
      }
      console.warn("MIXER LOOP CROSSFADER FAILED, RETRYING SIMPLE CONCAT", {
        message: readableFfmpegMessage(error),
        loopDuration,
        loopCrossfadeSeconds,
        loopRepeatCount,
      });
      filterGraph = buildFilterGraph(true);
      try {
        await runFfmpeg(buildFfmpegArgs(filterGraph));
      } catch (fallbackError) {
        throw new Error(`Loop render failed. ${readableFfmpegMessage(fallbackError)}`);
      }
    }

    return {
      audioBuffer: await readFile(outputPath),
      sourceWasCopied: false,
      contentType: "audio/mpeg",
      filterGraph,
      renderedStemNames: stemsToRender.map((stem) => stem.name),
      usedLoudnorm: args.mixerValues.masterNormalize,
      outputBitrate: MIXER_OUTPUT_BITRATE,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
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

    const body = (await request.json().catch(() => null)) as MixerRenderBody | null;
    console.log("RENDER API INPUT", body);
    const trackVersionId = String(body?.trackVersionId || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim();
    const requestedTitle = safeTitle(String(body?.title || ""));
    const coproducerPreset = String(body?.coproducerPreset || "").trim() || null;
    const studioProMetadata = normalizeStudioProMetadata(body?.studioProMetadata);
    const arrangementMetadata = normalizeArrangementMetadata(body?.arrangementMetadata);
    const previewSeconds =
      body?.preview && (body.previewSeconds === 10 || body.previewSeconds === 20)
        ? body.previewSeconds
        : null;
    const stemDrumsUrl = String(body?.stem_drums_url || body?.stemDrumsUrl || "").trim();
    const stemBassUrl = String(body?.stem_bass_url || body?.stemBassUrl || "").trim();
    const stemVocalsUrl = String(body?.stem_vocals_url || body?.stemVocalsUrl || "").trim();
    const stemOtherUrl = String(body?.stem_other_url || body?.stemOtherUrl || "").trim();

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
      .maybeSingle<{ user_id: string }>();

    if (projectError) {
      console.warn("Studio mixer render ownership lookup warning:", projectError);
    }

    if (project?.user_id && project.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hasRootVersionId = await columnExists(serviceClient, "track_versions", "root_version_id");
    const trackVersionsTable = (serviceClient as any).from("track_versions");
    const sourceVersionSelect = hasRootVersionId
      ? "id,root_version_id,track_group_id,title,audio_url,duration,stems_status,stems_requested_at,stems_completed_at,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata"
      : "id,track_group_id,title,audio_url,duration,stems_status,stems_requested_at,stems_completed_at,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata";
    const { data: sourceVersion, error: sourceError } = await trackVersionsTable
      .select(sourceVersionSelect)
      .eq("id", trackVersionId)
      .eq("track_group_id", trackGroupId)
      .maybeSingle();

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }

    if (!sourceVersion) {
      return NextResponse.json({ error: "Source Studio version not found" }, { status: 404 });
    }

    const mixerValues = getMixerValues(body?.mixer);
    const neutralBypass = isNeutralMixer(mixerValues) && !arrangementMetadata?.arrangementRender;
    const allowStereoFallbackFreeze = studioProMetadata?.studioProFreeze === true && !previewSeconds;

    if (
      sourceVersion.stems_status !== "ready" &&
      !allowStereoFallbackFreeze &&
      (previewSeconds || !neutralBypass)
    ) {
      return NextResponse.json(
        { error: "Prepare stems before rendering a mix." },
        { status: 400 }
      );
    }

    const sourceStemUrls = {
      drums: sourceVersion.stem_drums_url || stemDrumsUrl || "",
      bass: sourceVersion.stem_bass_url || stemBassUrl || "",
      vocals: sourceVersion.stem_vocals_url || stemVocalsUrl || "",
      other: sourceVersion.stem_other_url || stemOtherUrl || "",
    };
    const renderSourceUrl =
      sourceStemUrls.other ||
      sourceStemUrls.drums ||
      sourceStemUrls.bass ||
      sourceStemUrls.vocals ||
      sourceVersion.audio_url ||
      "";

    if (!renderSourceUrl) {
      return NextResponse.json({ error: "No render source audio is available." }, { status: 400 });
    }

    let renderedMix: Awaited<ReturnType<typeof renderStemMix>>;
    try {
      if (!previewSeconds && neutralBypass && sourceVersion.audio_url) {
        const copiedAudio = await downloadAudioBuffer(sourceVersion.audio_url);
        renderedMix = {
          ...copiedAudio,
          sourceWasCopied: true,
          filterGraph: "neutral-bypass-copy",
          renderedStemNames: [],
          usedLoudnorm: false,
          outputBitrate: "source",
        };
      } else {
        const previewStartSeconds =
          previewSeconds && typeof sourceVersion.duration === "number"
            ? Math.max(0, (sourceVersion.duration - previewSeconds) / 2)
            : previewSeconds
              ? 30
              : 0;
        renderedMix = await renderStemMix({
          fallbackAudioUrl: renderSourceUrl,
          mixerValues,
          previewSeconds,
          previewStartSeconds,
          trimStartSeconds: arrangementMetadata?.trimStartSeconds || 0,
          trimEndSeconds: arrangementMetadata?.trimEndSeconds || 0,
          sourceDurationSeconds: sourceVersion.duration,
          loopRepeatCount:
            arrangementMetadata?.arrangementType === "loop-section"
              ? arrangementMetadata.repeatCount || 3
              : 1,
          stems: [
            { name: "drums", url: sourceStemUrls.drums, gain: gainFromSlider(mixerValues.drums) },
            { name: "bass", url: sourceStemUrls.bass, gain: gainFromSlider(mixerValues.bass) },
            { name: "vocals", url: sourceStemUrls.vocals, gain: gainFromSlider(mixerValues.vocal) },
            { name: "other", url: sourceStemUrls.other, gain: gainFromSlider(mixerValues.music) },
          ],
        });
      }
    } catch (error: any) {
      if (error instanceof FfmpegMissingError) {
        return NextResponse.json(
          { error: "ffmpeg_missing", message: "ffmpeg binary is not available" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: error?.message || "ffmpeg stem mix render failed",
          details: error?.stack || "Mixer render failed while preparing ffmpeg output.",
        },
        { status: 500 }
      );
    }

    const objectPath = previewSeconds
      ? `studio-previews/${user.id}/${Date.now()}-${randomUUID()}.mp3`
      : `studio-mixes/${user.id}/${trackGroupId}/${Date.now()}-${randomUUID()}.mp3`;
    const { error: uploadError } = await serviceClient.storage
      .from(BUCKET)
      .upload(objectPath, renderedMix.audioBuffer, {
        contentType: renderedMix.contentType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = serviceClient.storage.from(BUCKET).getPublicUrl(objectPath);

    if (previewSeconds) {
      const previewMetadata = {
        ...(studioProMetadata || {}),
        preview: true,
        previewSeconds,
        coproducerPreset,
        sourceWasCopied: renderedMix.sourceWasCopied,
        usedStems: renderedMix.renderedStemNames,
        usedLoudnorm: renderedMix.usedLoudnorm,
        outputBitrate: renderedMix.outputBitrate,
        ffmpegFilterGraph: renderedMix.filterGraph,
      };
      return NextResponse.json({
        ok: true,
        preview: true,
        previewSeconds,
        previewUrl: publicUrl,
        metadata: previewMetadata,
      });
    }

    const { data: latestVersion, error: latestError } = await serviceClient
      .from("track_versions")
      .select("version_number")
      .eq("track_group_id", trackGroupId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle<{ version_number: number | null }>();

    if (latestError) {
      return NextResponse.json({ error: latestError.message }, { status: 500 });
    }

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
    const studioProFreeze = studioProMetadata?.studioProFreeze === true;
    const baseTitle =
      requestedTitle
        .replace(/\s+-\s+(?:Mix|Loop|Extend) Edit(?:\s+\d+)?$/i, "")
        .replace(/\s+-\s+(?:PRO|Club|Mastered) Freeze(?:\s+\d+)?$/i, "")
        .trim() || requestedTitle;
    const loopEnabled = mixerValues.loopMode !== "off";
    const extendEnabled = !loopEnabled && mixerValues.extendMode !== "off";
    const renderMode = neutralBypass
      ? "neutral-bypass-copy"
      : loopEnabled
      ? "real-stem-mix-loop-v1"
      : extendEnabled
        ? "real-stem-mix-extend-v0"
        : mixerValues.pitch !== 0
          ? "real-stem-mix-pitch-v0"
          : "real-stem-mix-v1";
    const loopMetadataMode = loopEnabled ? `${mixerValues.loopMode}s` : "off";
    const extendMetadataMode = extendEnabled ? `extend ${mixerValues.extendMode}s` : "off";
    const editKind = loopEnabled ? "Loop" : extendEnabled ? "Extend" : "Mix";
    const presetPrefix =
      typeof studioProMetadata?.activePreset === "string" &&
      (studioProMetadata.activePreset === "Club Mix" || studioProMetadata.activePreset === "Clean Master")
        ? studioProMetadata.activePreset === "Club Mix"
          ? "Club"
          : "Mastered"
        : "PRO";
    const arrangementLabelBase =
      arrangementMetadata?.arrangementRender && arrangementMetadata.labelBase
        ? arrangementMetadata.labelBase
        : null;
    const mixLabel = arrangementLabelBase
      ? `${arrangementLabelBase} ${nextVersionNumber}`
      : studioProFreeze
      ? `${presetPrefix} Freeze ${nextVersionNumber}`
      : `${editKind} Edit ${nextVersionNumber}`;
    const mixTitle = `${baseTitle} - ${mixLabel}`;
    const prompt = [
      "Studio mixer render v0.",
      neutralBypass
        ? "Neutral render copied source audio directly to preserve quality. No stem remix, loudnorm, or re-encoding was applied."
        : "Rendered with local ffmpeg stem gain mixing. No Replicate, AI generation, or external GPU processing.",
      `Mixer settings: ${summarizeMixer(body?.mixer)}`,
      `ffmpeg filter graph: ${renderedMix.filterGraph}`,
    ].join("\n");
    const inheritedStemsMetadata =
      sourceVersion.stems_metadata && typeof sourceVersion.stems_metadata === "object"
        ? sourceVersion.stems_metadata
        : {};
    const usedMockStems = hasMockStemsMetadata(sourceVersion.stems_metadata);
    const renderMetadata = {
      ...(studioProMetadata || {}),
      ...(arrangementMetadata?.arrangementRender
        ? {
            arrangementRender: true,
            arrangementType: arrangementMetadata.arrangementType,
            section: arrangementMetadata.section,
            repeatCount: arrangementMetadata.repeatCount || null,
            trimStartSeconds: arrangementMetadata.trimStartSeconds || null,
            trimEndSeconds: arrangementMetadata.trimEndSeconds || null,
            arrangementBadge: arrangementMetadata.badge || null,
          }
        : {}),
      inheritedFromVersionId: sourceVersion.id,
      mixerRenderV0: true,
      mockStemRender: usedMockStems,
      renderIndex: nextVersionNumber,
      parentVersionId: trackVersionId,
      studioProFreeze,
      freezeSourceVersionId: studioProFreeze
        ? studioProMetadata?.freezeSourceVersionId || trackVersionId
        : null,
      freezeType: studioProFreeze
        ? studioProMetadata?.freezeType || "realtime-dsp-freeze-v1"
        : null,
      committedAt: studioProFreeze
        ? studioProMetadata?.committedAt || new Date().toISOString()
        : null,
      renderMode,
      loopMode: loopMetadataMode,
      loopDurationSeconds: mixerValues.loopDurationSeconds,
      loopCrossfadeSeconds: loopEnabled ? LOOP_CROSSFADE_SECONDS : null,
      extendMode: extendMetadataMode,
      extendSeconds: extendEnabled ? mixerValues.extendSeconds : null,
      extendCrossfadeSeconds: extendEnabled ? EXTEND_CROSSFADE_SECONDS : null,
      renderNote: loopEnabled && mixerValues.extendMode !== "off" ? "loopMode overrides extendMode" : null,
      pitchSemitones: mixerValues.pitch,
      subBass: mixerValues.subBass,
      coproducerPreset,
      mixerValues,
      sourceWasCopied: renderedMix.sourceWasCopied,
      usedStems: renderedMix.renderedStemNames,
      usedLoudnorm: renderedMix.usedLoudnorm,
      outputBitrate: renderedMix.outputBitrate,
      renderedAt: new Date().toISOString(),
      renderedStemNames: renderedMix.renderedStemNames,
      ffmpegFilterGraph: renderedMix.filterGraph,
    };
    const insertPayload: Record<string, unknown> = {
      generation_job_id: null,
      parent_version_id: trackVersionId,
      ...(hasRootVersionId ? { root_version_id: sourceVersion.root_version_id || sourceVersion.id } : {}),
      track_group_id: trackGroupId,
      version_number: nextVersionNumber,
      title: mixTitle,
      version_label: mixLabel,
      provider: studioProMetadata?.studioPro ? "studio-pro-mixer" : "studio-mixer",
      generation_mode: "mixer_render",
      prompt,
      lyrics: null,
      vocal_mode: null,
      audio_url: publicUrl,
      artwork_url: null,
      storage_path: objectPath,
      duration: sourceVersion.duration,
      is_original: false,
      stems_status: "ready",
      stems_requested_at: sourceVersion.stems_requested_at,
      stems_completed_at: sourceVersion.stems_completed_at || new Date().toISOString(),
      stems_error: null,
      stem_drums_url: sourceVersion.stem_drums_url || stemDrumsUrl || renderSourceUrl,
      stem_bass_url: sourceVersion.stem_bass_url || stemBassUrl || renderSourceUrl,
      stem_vocals_url: sourceVersion.stem_vocals_url || stemVocalsUrl || renderSourceUrl,
      stem_other_url: sourceVersion.stem_other_url || stemOtherUrl || renderSourceUrl,
      stems_metadata: {
        ...inheritedStemsMetadata,
        ...renderMetadata,
      },
    };

    if (await columnExists(serviceClient, "track_versions", "metadata")) {
      insertPayload.metadata = renderMetadata;
    } else if (await columnExists(serviceClient, "track_versions", "import_metadata")) {
      insertPayload.import_metadata = renderMetadata;
    }

    const renderVersionSelect = hasRootVersionId
      ? "id,parent_version_id,root_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original,stems_status,stems_requested_at,stems_completed_at,stems_error,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata,created_at"
      : "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original,stems_status,stems_requested_at,stems_completed_at,stems_error,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata,created_at";
    const { data: newVersion, error: insertError } = await trackVersionsTable
      .insert(insertPayload)
      .select(renderVersionSelect)
      .single();

    if (insertError || !newVersion) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to create mixer render version" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      version: newVersion,
      audioUrl: publicUrl,
      trackGroupId,
      trackVersionId: newVersion.id,
    });
  } catch (error) {
    console.error("STUDIO PRO RENDER ERROR", error);
    return NextResponse.json(
      {
        error: String(error),
      },
      { status: 500 }
    );
  }
}
