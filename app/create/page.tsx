"use client";

import { SOUNDIOX_GENRES } from "@/lib/genres";
import { supabase } from "@/lib/supabaseClient";
import { useRealtimeMixPreview } from "@/lib/useRealtimeMixPreview";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

type VocalMode = "instrumental" | "auto-lyrics" | "write-lyrics" | "male" | "female" | "duet";
type GenerationMode = "seed" | "full";
type GenerationIntent = "new_version" | "remix" | "instrumental" | "co_producer" | "seed" | "full";
type GenerationProvider = "modal" | "replicate";
type BranchActionType = "new-version" | "remix" | "instrumental" | "co-producer";
type VersionStatus = "generated" | "edit_plan";
type StemStatus = "not_started" | "queued" | "processing" | "ready" | "error";
type ActionStatus = "idle" | "working" | "success" | "error" | "disabled";
type MixerEditStatus = "Idle" | "Planning" | "Saved" | "Error";
type ActionKey =
  | "generateSeed"
  | "generateFull"
  | "generateSingingVersion"
  | "artworkConcept"
  | "coverImage"
  | "voiceoverLayer"
  | "createRemix"
  | "createNewVersion"
  | "instrumentalVersion"
  | "coProducerApply"
  | "submitSoundioX"
  | "preparePublicPublish"
  | "saveProject"
  | "importTrack"
  | "prepareStems"
  | "previewRender"
  | "renderMix"
  | "coProducerPreset"
  | "downloadVersion"
  | "exportStems"
  | "saveStudioVersion";
type PendingPaidEditGeneration = {
  actionType: BranchActionType;
  instruction: string;
  parentVersion: VersionRecord;
};
type ExportAction =
  | "Submit to SoundioX"
  | "Export for Spotify"
  | "Export release package";
type PublishVisibility = "Draft" | "Private" | "Public";
type PublishDraft = {
  title: string;
  artistName: string;
  genre: string;
  visibility: PublishVisibility;
  versionLabel: string;
  duration: number | null;
  vocalMode: string | null;
  provider: string | null;
  audioReady: boolean;
  artworkReady: boolean;
};
type StudioDraftTrack = {
  id: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  audio_url: string | null;
  artwork_url: string | null;
  is_published: boolean | null;
  ready_for_review?: boolean | null;
  review_requested_at?: string | null;
  review_status?: string | null;
  source_track_group_id?: string | null;
  source_track_version_id?: string | null;
  created_at: string | null;
};
type StudioDraftProjectGroup = {
  id: string;
  latestDraft: StudioDraftTrack;
  drafts: StudioDraftTrack[];
  status: StudioDraftStatus;
  latestCreatedAt: string | null;
};
type StudioDraftStatus = "Draft" | "Ready for review" | "Approved" | "Rejected" | "Published";
type VoiceRecordingStatus = "idle" | "requesting" | "recording" | "recorded" | "uploading" | "saved" | "error";
type ArtistVoicePreviewStatus = "idle" | "generating" | "ready" | "error";
type VoiceStyle = "cinematic" | "warm" | "broadcast" | "trailer" | "intimate";
type VoiceDelivery = "steady" | "dramatic" | "soft" | "urgent" | "measured";
type StepKey = "track" | "vocals" | "artwork";
type DirectionKey = "music" | "lyrics" | "artwork";
type CoProducerMode = "prompt" | DirectionKey | "voiceover" | "edit";
type LoopMode = "off" | "15" | "30" | "60";
type ExtendMode = "off" | "15" | "30" | "60";
type PreviewMode = "off" | "10" | "20";
type CoProducerPresetName =
  | "Car Bass"
  | "Club Mix"
  | "Retail Background"
  | "Vocal Down"
  | "TikTok Short"
  | "Clean Master"
  | "Podcast Voice"
  | "Cinematic";
type LegacyCoProducerPresetName =
  | CoProducerPresetName
  | "Warm Vocals"
  | "Club Energy"
  | "Bigger Bass"
  | "Wider Stereo"
  | "Cleaner Mix"
  | "Soft Ambient";
type FaderKey =
  | "drums"
  | "bass"
  | "music"
  | "vocal"
  | "voiceover"
  | "fx"
  | "master"
  | "speed"
  | "pitch"
  | "subBass";

type MixerState = Record<FaderKey, number> & {
  loopMode: LoopMode;
  extendMode: ExtendMode;
  masterNormalize: boolean;
};
type MuteState = Record<FaderKey, boolean>;
type SoloState = Record<FaderKey, boolean>;
type DynamicsKey = "fadeIn" | "fadeOut" | "compression" | "saturation" | "width";
type DynamicsState = Record<DynamicsKey, number>;
type ChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  canApply?: boolean;
  applyAdvice?: EditAdvice;
};
type EditAdvice = {
  raw: string;
  change: string;
  impact: string;
  finalDirection: string;
  versionNote: string;
};
type LatestAiEditAdvice = EditAdvice | null;
type ArtworkConcept = {
  concept: string;
  imagePrompt: string;
  palette: string;
  styleTags: string[];
  summary: string;
};

type VersionRecord = {
  id: string;
  label: string;
  title: string;
  note: string;
  prompt?: string | null;
  source: "generated" | "imported";
  mixer: MixerState;
  dynamics: DynamicsState;
  audioUrl?: string | null;
  trackGroupId?: string | null;
  parentVersionId?: string | null;
  rootVersionId?: string | null;
  versionNumber?: number | null;
  generationIntent?: GenerationIntent | null;
  isOriginal?: boolean | null;
  provider?: string | null;
  vocalMode?: string | null;
  duration?: number | null;
  artworkUrl?: string | null;
  artworkConcept?: ArtworkConcept | null;
  vocalUrl?: string | null;
  voiceoverUrl?: string | null;
  createdAt?: string | null;
  createdFrom?: BranchActionType | "generation" | "draft" | "import" | null;
  status?: VersionStatus | null;
  actionType?: BranchActionType | null;
  editInstruction?: string | null;
  importedSource?: string | null;
  coProducerInstruction?: string | null;
  directionSummary?: string | null;
  stemsStatus?: StemStatus | null;
  stemsRequestedAt?: string | null;
  stemsCompletedAt?: string | null;
  stemsError?: string | null;
  stemDrumsUrl?: string | null;
  stemBassUrl?: string | null;
  stemVocalsUrl?: string | null;
  stemOtherUrl?: string | null;
  stemsMetadata?: unknown | null;
};

type TrackVersionApiRecord = {
  id: string;
  track_group_id: string;
  parent_version_id: string | null;
  root_version_id?: string | null;
  version_number: number;
  title: string;
  version_label: string | null;
  provider: string | null;
  generation_mode: string | null;
  generation_intent?: string | null;
  prompt: string | null;
  vocal_mode: string | null;
  audio_url: string;
  artwork_url?: string | null;
  artwork_concept?: unknown | null;
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
  duration: number | null;
  is_original: boolean;
  created_at: string;
};

type VersionGenerationType =
  | "Original"
  | "New Version"
  | "Remix"
  | "Instrumental"
  | "Co-Producer"
  | "Edit Plan"
  | "Mix Edit"
  | "Paid AI Version";
type VoiceoverLayerStatus = "idle" | "generating" | "generated" | "error";

const sectionClass =
  "rounded-[32px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_28px_90px_rgba(14,165,233,0.14)] backdrop-blur-2xl";
const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-sky-300/40 focus:bg-black/30";
const primaryButtonClass =
  "inline-flex cursor-pointer items-center justify-center rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-white ring-1 ring-sky-200/60 shadow-[0_0_18px_rgba(56,189,248,0.25)] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-55";
const secondaryButtonClass =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/7 px-4 py-2.5 text-sm font-medium text-white/82 transition hover:bg-white/12";
const toolButtonClass =
  "inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/12 bg-white/7 px-4 py-3 text-sm font-medium text-white/86 transition hover:bg-white/12";
const actionButtonBaseClass =
  "inline-flex cursor-pointer items-center justify-center rounded-full px-5 py-3 text-sm font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-55";
const actionButtonClasses: Record<ActionStatus, string> = {
  idle: "bg-sky-400 text-white ring-sky-200/60 shadow-[0_0_18px_rgba(56,189,248,0.25)] hover:bg-sky-300",
  working: "animate-pulse bg-rose-400 text-white ring-rose-200/60 shadow-[0_0_18px_rgba(251,113,133,0.28)] hover:bg-rose-300",
  success: "bg-emerald-400 text-slate-950 ring-emerald-100/60 shadow-[0_0_18px_rgba(52,211,153,0.28)] hover:bg-emerald-300",
  error: "bg-rose-800 text-white ring-rose-300/35 hover:bg-rose-700",
  disabled: "bg-slate-600/45 text-white/45 ring-white/10",
};
const MAX_CO_PRODUCER_ACTIONS = 5;
const GENERATE_TIMEOUT_MS = 3 * 60 * 1000;
const exportActions: ExportAction[] = [
  "Submit to SoundioX",
  "Export for Spotify",
  "Export release package",
];
const STUDIO_DRAFT_EXTENDED_COLUMNS =
  "id,title,artist,genre,audio_url,artwork_url,is_published,created_at,ready_for_review,review_requested_at,review_status,source_track_group_id,source_track_version_id";
const STUDIO_DRAFT_BASE_COLUMNS =
  "id,title,artist,genre,audio_url,artwork_url,is_published,created_at";

const initialMixer: MixerState = {
  drums: 100,
  bass: 100,
  music: 100,
  vocal: 100,
  voiceover: 24,
  fx: 46,
  master: 70,
  speed: 100,
  pitch: 0,
  subBass: 0,
  loopMode: "off",
  extendMode: "off",
  masterNormalize: false,
};

const coProducerPresets: Array<{
  name: CoProducerPresetName;
  summary: string;
  mixer: Partial<Pick<MixerState, FaderKey | "masterNormalize">>;
  dynamics?: Partial<DynamicsState>;
}> = [
  {
    name: "Podcast Voice",
    summary: "Podcast Voice preset applied",
    mixer: { vocal: 112, music: 92, subBass: 12, masterNormalize: false },
    dynamics: { saturation: 46, compression: 48, width: 58 },
  },
  {
    name: "Club Mix",
    summary: "Club Mix preset applied",
    mixer: { drums: 118, bass: 116, music: 108, speed: 104, subBass: 58, masterNormalize: true },
    dynamics: { compression: 64, saturation: 50, width: 68 },
  },
  {
    name: "Car Bass",
    summary: "Car Bass preset applied",
    mixer: { bass: 122, music: 96, subBass: 82, masterNormalize: true },
    dynamics: { compression: 58, saturation: 44 },
  },
  {
    name: "Retail Background",
    summary: "Retail Background preset applied",
    mixer: { music: 106, fx: 62, masterNormalize: false },
    dynamics: { width: 72, saturation: 26, compression: 34 },
  },
  {
    name: "Clean Master",
    summary: "Clean Master preset applied",
    mixer: { drums: 100, bass: 96, vocal: 104, music: 98, subBass: 0, masterNormalize: false },
    dynamics: { compression: 42, saturation: 24, width: 62 },
  },
  {
    name: "Cinematic",
    summary: "Cinematic preset applied",
    mixer: { drums: 88, bass: 104, music: 116, fx: 78, speed: 98, pitch: -1, masterNormalize: false },
    dynamics: { width: 82, fadeIn: 34, fadeOut: 44, saturation: 40 },
  },
  {
    name: "TikTok Short",
    summary: "TikTok Short preset applied",
    mixer: { drums: 122, bass: 112, vocal: 110, music: 104, speed: 108, subBass: 44, masterNormalize: true },
    dynamics: { compression: 72, saturation: 48, width: 66 },
  },
  {
    name: "Vocal Down",
    summary: "Vocal Down preset applied",
    mixer: { vocal: 72, music: 106, drums: 98, bass: 102, masterNormalize: false },
    dynamics: { width: 70, compression: 36 },
  },
];

const initialDynamics: DynamicsState = {
  fadeIn: 18,
  fadeOut: 24,
  compression: 52,
  saturation: 38,
  width: 64,
};

const initialVersions: VersionRecord[] = [
  {
    id: "original",
    label: "Original",
    title: "Night Drive Signal",
    note: "Base generated version with the original arrangement intact.",
    source: "generated",
    mixer: initialMixer,
    dynamics: initialDynamics,
    versionNumber: 1,
    isOriginal: true,
    generationIntent: null,
  },
  {
    id: "version-2",
    label: "Version 2",
    title: "Night Drive Signal V2",
    note: "Hook tightened and intro shortened while keeping the original version intact.",
    source: "generated",
    parentVersionId: "original",
    versionNumber: 2,
    isOriginal: false,
    generationIntent: "new_version",
    mixer: {
      ...initialMixer,
      drums: 76,
      bass: 64,
      vocal: 58,
    },
    dynamics: {
      ...initialDynamics,
      compression: 56,
      width: 68,
    },
  },
  {
    id: "version-3",
    label: "Version 3",
    title: "Night Drive Signal V3",
    note: "Cleaner mix branch with lower vocal weight and brighter master balance.",
    source: "generated",
    parentVersionId: "version-2",
    versionNumber: 3,
    isOriginal: false,
    generationIntent: "new_version",
    mixer: {
      ...initialMixer,
      vocal: 42,
      voiceover: 18,
      master: 76,
      fx: 50,
    },
    dynamics: {
      ...initialDynamics,
      saturation: 44,
      fadeOut: 32,
    },
  },
];

const emptyWorkspaceVersion: VersionRecord = {
  id: "new-project",
  label: "New project",
  title: "Untitled Studio project",
  note: "Start a new Studio project by describing the track idea, choosing the voice mode, and generating a seed.",
  source: "generated",
  mixer: initialMixer,
  dynamics: initialDynamics,
  audioUrl: null,
  artworkUrl: null,
  trackGroupId: null,
  parentVersionId: null,
  versionNumber: null,
  generationIntent: null,
  isOriginal: false,
  provider: null,
  vocalMode: null,
  duration: null,
  createdAt: null,
};

function clampValue(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatVoiceRecordingTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function clampMixerValue(key: FaderKey, value: number) {
  if (key === "speed") {
    return Math.max(70, Math.min(130, value));
  }

  if (key === "pitch") {
    return Math.max(-12, Math.min(12, Math.round(value)));
  }

  return clampValue(value);
}

function summarizeMixer(mixer: MixerState, dynamics: DynamicsState, vocalMode: VocalMode) {
  const lines: string[] = [];

  if (mixer.bass >= 70) lines.push("heavy low end");
  else if (mixer.bass <= 35) lines.push("leaner bass");
  else lines.push("balanced bass");

  if (mixer.drums >= 72) lines.push("forward drums");
  else if (mixer.drums <= 35) lines.push("softer drums");
  else lines.push("steady drums");

  if (mixer.music >= 72) lines.push("full music bed");
  else if (mixer.music <= 35) lines.push("stripped arrangement");
  else lines.push("controlled arrangement");

  if (vocalMode === "instrumental") {
    lines.push("instrumental focus");
  } else if (mixer.voiceover >= 55) {
    lines.push("voiceover-forward narration");
  } else if (mixer.vocal >= 65) {
    lines.push("lead vocal up front");
  } else if (mixer.vocal <= 35) {
    lines.push("vocals tucked back");
  } else {
    lines.push("balanced vocal placement");
  }

  if (mixer.fx >= 65) lines.push("wider ambience");
  else if (mixer.fx <= 30) lines.push("dry ambience");
  else lines.push("moderate ambience");

  if (mixer.master >= 75) lines.push("louder master edge");
  else if (mixer.master <= 35) lines.push("softer master finish");
  else lines.push("controlled master");

  if (mixer.speed >= 112) lines.push("faster tempo");
  else if (mixer.speed <= 92) lines.push("slower tempo");
  else lines.push("original tempo");

  if (mixer.pitch > 0) lines.push(`pitch +${mixer.pitch} st`);
  else if (mixer.pitch < 0) lines.push(`pitch ${mixer.pitch} st`);
  else lines.push("original key");

  if (mixer.subBass >= 70) lines.push("heavy low-end punch");
  else if (mixer.subBass > 0) lines.push("sub bass boosted");

  if (mixer.masterNormalize) lines.push("master normalize on");

  if (mixer.loopMode !== "off") {
    lines.push(`loop edit: ${mixer.loopMode}s`);
  } else if (mixer.extendMode !== "off") {
    lines.push(`extended ${mixer.extendMode}s`);
  }

  if (dynamics.width >= 70) lines.push("wide stereo spread");
  else if (dynamics.width <= 30) lines.push("narrower image");

  if (dynamics.compression >= 68) lines.push("tighter compression");
  else if (dynamics.compression <= 30) lines.push("more open dynamics");

  if (dynamics.fadeIn >= 60) lines.push("long fade-in");
  if (dynamics.fadeOut >= 60) lines.push("long fade-out");
  if (dynamics.saturation >= 60) lines.push("more harmonic grit");

  return lines.join(" • ");
}

function buildVersionNote(
  action: string,
  mixer: MixerState,
  dynamics: DynamicsState,
  vocalMode: VocalMode
) {
  return `${action} created as a new branch. ${summarizeMixer(mixer, dynamics, vocalMode)}. Original remains intact.`;
}

function formatVersionDate(value: string | null | undefined) {
  if (!value) return "Just now";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isUuid(value: string | null | undefined) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  );
}

function buildBranchFinalDirection(args: {
  baseDirection: string;
  generationIntent: GenerationIntent;
  activeVersionLabel: string;
  durationSeconds: number;
  instruction?: string;
}) {
  const extraInstruction = args.instruction?.trim()
    ? `\n\nSpecific branch instruction:\n${args.instruction.trim()}`
    : "";

  if (args.generationIntent === "new_version") {
    return `${args.baseDirection}\n\nBranch request from ${args.activeVersionLabel}: keep the same song idea, genre, mood, title, and vocal mode. Create a refined alternate take with stronger structure, a better hook, a cleaner mix, and the same ${args.durationSeconds}s duration as the source version.${extraInstruction}`;
  }

  if (args.generationIntent === "remix") {
    return `${args.baseDirection}\n\nBranch request from ${args.activeVersionLabel}: create a remix version that keeps the core idea and title recognizable, but uses a new groove, fresh drums, changed energy, and an alternate arrangement while preserving the recognizable mood. Keep the same ${args.durationSeconds}s duration as the source version.${extraInstruction}`;
  }

  if (args.generationIntent === "instrumental") {
    return `${args.baseDirection}\n\nBranch request from ${args.activeVersionLabel}: create an instrumental version only. No vocals, no singing, no spoken voice, and no lyrics. Keep the same song idea, mood, title, arrangement identity, and the same ${args.durationSeconds}s duration as the source version.${extraInstruction}`;
  }

  if (args.generationIntent === "co_producer") {
    return `${args.baseDirection}\n\nCo-producer branch request from ${args.activeVersionLabel}: create a new generated version using the co-producer guidance. Preserve the core track identity, but apply the arrangement, energy, chorus timing, hook strength, emotional payoff, cinematic direction, and mix-balance notes. Keep the same ${args.durationSeconds}s duration as the source version.${extraInstruction}`;
  }

  return args.baseDirection;
}

function getBranchWorkspaceStatus(intent: GenerationIntent, label: string) {
  if (intent === "new_version") return `Creating new version from ${label}`;
  if (intent === "remix") return `Creating remix from ${label}`;
  if (intent === "instrumental") return `Creating instrumental version from ${label}`;
  if (intent === "co_producer") return `Creating co-producer version from ${label}`;
  return `Creating version from ${label}`;
}

function getGenerationIntentForBranchAction(actionType: BranchActionType): GenerationIntent {
  if (actionType === "remix") return "remix";
  if (actionType === "instrumental") return "instrumental";
  if (actionType === "co-producer") return "co_producer";
  return "new_version";
}

function getBranchActionTitle(actionType: BranchActionType) {
  if (actionType === "remix") return "Remix";
  if (actionType === "instrumental") return "Instrumental version";
  if (actionType === "co-producer") return "Co-Producer edit";
  return "New version";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripBranchTitleSuffixes(value: string) {
  let normalized = value.trim() || "Untitled track";
  let previous = "";

  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized
      .replace(/\s+-\s+Remix(?:\s+\d+)?$/i, "")
      .replace(/\s+-\s+Version\s+\d+$/i, "")
      .trim();
  }

  return normalized || value.trim() || "Untitled track";
}

function stripAudioExtension(fileName: string) {
  return fileName.replace(/\.(mp3|wav|flac|m4a)$/i, "").trim();
}

function sanitizeDownloadName(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "studio-version"
  );
}

function getAudioDownloadFilename(audioUrl: string, title: string) {
  try {
    const pathName = new URL(audioUrl).pathname;
    const lastSegment = decodeURIComponent(pathName.split("/").filter(Boolean).pop() || "");
    if (lastSegment.match(/\.(mp3|wav|flac|m4a|aac|ogg)$/i)) {
      return sanitizeDownloadName(lastSegment);
    }
  } catch {
    // Fall back to the title-derived filename below.
  }

  return `${sanitizeDownloadName(title || "studio-version")}.mp3`;
}

function getActionButtonClass(status: ActionStatus, extra = "") {
  return `${actionButtonBaseClass} ${actionButtonClasses[status]} ${extra}`;
}

function getActionStatusLabel(status: ActionStatus, labels: Partial<Record<ActionStatus, string>>, idleLabel: string) {
  if (status === "working") return labels.working || "Working...";
  if (status === "success") return labels.success || "Done";
  if (status === "error") return labels.error || "Error";
  return idleLabel;
}

function formatPlaybackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isExportAction(action: string): action is ExportAction {
  return exportActions.includes(action as ExportAction);
}

function isMissingColumnError(error: any) {
  const values = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ]
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

function logStudioDraftsLoadError(error: any, selectedColumns: string) {
  void error;
  void selectedColumns;
}

function normalizeStudioDrafts(data: unknown): StudioDraftTrack[] {
  if (!Array.isArray(data)) return [];

  return data.map((draft: any) => ({
    id: String(draft?.id || ""),
    title: draft?.title ?? null,
    artist: draft?.artist ?? null,
    genre: draft?.genre ?? null,
    audio_url: draft?.audio_url ?? null,
    artwork_url: draft?.artwork_url ?? null,
    is_published: draft?.is_published ?? false,
    ready_for_review: draft?.ready_for_review ?? false,
    review_requested_at: draft?.review_requested_at ?? null,
    review_status: draft?.review_status ?? "draft",
    source_track_group_id: draft?.source_track_group_id ?? null,
    source_track_version_id: draft?.source_track_version_id ?? null,
    created_at: draft?.created_at ?? null,
  }));
}

function getDraftCreatedTime(draft: StudioDraftTrack) {
  if (!draft.created_at) return 0;

  const timestamp = Date.parse(draft.created_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getStudioDraftGroupKey(draft: StudioDraftTrack) {
  return draft.source_track_group_id || draft.id;
}

function isStudioDraftActive(
  draft: StudioDraftTrack,
  activeVersion: VersionRecord,
  activeVersionId: string,
  activeTrackGroupId: string | null
) {
  if (activeVersionId === `draft-${draft.id}` || activeVersionId === `studio-draft-${draft.id}`) {
    return true;
  }

  if (draft.source_track_version_id && activeVersion.id === draft.source_track_version_id) {
    return true;
  }

  if (!draft.source_track_group_id) return false;

  const activeGroupId = activeVersion.trackGroupId || activeTrackGroupId;
  if (activeGroupId !== draft.source_track_group_id) return false;

  return !draft.source_track_version_id || activeVersion.id === draft.source_track_version_id;
}

function isLocalStudioVersion(version: VersionRecord) {
  return (
    version.id.startsWith("draft-") ||
    version.id.startsWith("studio-draft-") ||
    version.status === "edit_plan" ||
    !version.trackGroupId ||
    !isUuid(version.id)
  );
}

function isPersistedStudioVersion(version: VersionRecord) {
  return !isLocalStudioVersion(version);
}

function filterStudioCreatedTracks(drafts: StudioDraftTrack[]) {
  return drafts.filter((draft) => {
    const hasStudioSource = Boolean(draft.source_track_group_id || draft.source_track_version_id);
    return hasStudioSource || draft.is_published === false;
  });
}

function getStudioDraftStatus(draft: StudioDraftTrack): StudioDraftStatus {
  if (draft.is_published) return "Published";
  if (draft.review_status === "approved") return "Approved";
  if (draft.review_status === "rejected") return "Rejected";
  if (draft.ready_for_review) return "Ready for review";
  return "Draft";
}

function getStudioDraftProjectStatus(drafts: StudioDraftTrack[], latestDraft: StudioDraftTrack): StudioDraftStatus {
  if (drafts.some((draft) => Boolean(draft.is_published))) return "Published";
  if (drafts.some((draft) => draft.review_status === "approved")) return "Approved";
  if (latestDraft.review_status === "rejected") return "Rejected";
  if (drafts.some((draft) => Boolean(draft.ready_for_review))) return "Ready for review";
  return "Draft";
}

function getStudioDraftStatusBadgeClass(status: StudioDraftStatus) {
  if (status === "Published") {
    return "border-cyan-200/35 bg-cyan-400/15 text-cyan-100";
  }

  if (status === "Approved") {
    return "border-blue-200/35 bg-blue-400/15 text-blue-100";
  }

  if (status === "Rejected") {
    return "border-rose-200/35 bg-rose-400/15 text-rose-100";
  }

  if (status === "Ready for review") {
    return "border-emerald-200/35 bg-emerald-400/15 text-emerald-100";
  }

  return "border-white/10 bg-white/5 text-white/65";
}

function isStudioDraftReviewActionDisabled(status: StudioDraftStatus) {
  return status === "Ready for review" || status === "Approved" || status === "Published";
}

function getStudioDraftReviewButtonLabel(status: StudioDraftStatus) {
  if (status === "Approved") return "Approved";
  if (status === "Published") return "Published";
  return "Prepare public publish";
}

function getExportWorkspaceStatus(action: ExportAction, versionLabel: string) {
  if (action === "Submit to SoundioX") {
    return `SoundioX submission prepared for ${versionLabel}.`;
  }

  if (action === "Export for Spotify") {
    return `Spotify export prepared for ${versionLabel}.`;
  }

  return `Release package prepared for ${versionLabel}.`;
}

function buildPublishDraftFromVersion(version: VersionRecord): PublishDraft {
  return {
    title: version.title || "Untitled track",
    artistName: "SoundioX Artist",
    genre: "Electronic",
    visibility: "Draft",
    versionLabel: version.label,
    duration: typeof version.duration === "number" ? version.duration : null,
    vocalMode: version.vocalMode || null,
    provider: version.provider || null,
    audioReady: Boolean(version.audioUrl),
    artworkReady: Boolean(version.artworkUrl),
  };
}

function normalizeGenerationIntent(value: string | null | undefined): GenerationIntent | null {
  return value === "new_version" ||
    value === "remix" ||
    value === "instrumental" ||
    value === "co_producer" ||
    value === "seed" ||
    value === "full"
    ? value
    : null;
}

function normalizeArtworkConcept(value: unknown): ArtworkConcept | null {
  if (!value) return null;

  let normalizedValue = value;
  if (typeof value === "string") {
    try {
      normalizedValue = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!normalizedValue || typeof normalizedValue !== "object") return null;

  const raw = normalizedValue as Partial<ArtworkConcept> & {
    image_prompt?: unknown;
    style_tags?: unknown;
  };
  const concept = typeof raw.concept === "string" ? raw.concept.trim() : "";
  const imagePrompt =
    typeof raw.imagePrompt === "string"
      ? raw.imagePrompt.trim()
      : typeof raw.image_prompt === "string"
        ? raw.image_prompt.trim()
        : "";
  const palette = typeof raw.palette === "string" ? raw.palette.trim() : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const rawStyleTags = Array.isArray(raw.styleTags)
    ? raw.styleTags
    : Array.isArray(raw.style_tags)
      ? raw.style_tags
      : [];
  const styleTags = rawStyleTags.length > 0
    ? rawStyleTags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  if (!concept && !imagePrompt && !palette && !summary && styleTags.length === 0) return null;

  return {
    concept,
    imagePrompt,
    palette,
    styleTags,
    summary,
  };
}

function summarizeArtworkText(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157).trim()}...`;
}

function buildArtworkConceptFromDirection(value: string): ArtworkConcept | null {
  const direction = value.trim();
  if (!direction) return null;

  return {
    concept: direction,
    imagePrompt: direction,
    palette: "Use the palette described in the artwork direction.",
    styleTags: ["Studio artwork direction"],
    summary: summarizeArtworkText(direction),
  };
}

function normalizeVocalMode(value: string | null | undefined): VocalMode | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (normalized === "instrumental") return "instrumental";
  if (normalized === "auto-lyrics" || normalized === "auto lyrics") return "auto-lyrics";
  if (normalized === "write-lyrics" || normalized === "write lyrics") return "write-lyrics";
  if (normalized === "male" || normalized === "male-vocal" || normalized === "male vocal") return "male";
  if (normalized === "female" || normalized === "female-vocal" || normalized === "female vocal") return "female";
  if (normalized === "duet") return "duet";

  return null;
}

function normalizeStemStatus(value: string | null | undefined): StemStatus {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (normalized === "queued") return "queued";
  if (normalized === "processing") return "processing";
  if (normalized === "ready") return "ready";
  if (normalized === "error") return "error";
  return "not_started";
}

function getStemStatusLabel(status: StemStatus) {
  if (status === "queued") return "Queued";
  if (status === "processing") return "Processing";
  if (status === "ready") return "Ready";
  if (status === "error") return "Error";
  return "Not started";
}

function getStemStatusBadgeClass(status: StemStatus) {
  if (status === "ready") return "border-emerald-200/35 bg-emerald-400/12 text-emerald-100";
  if (status === "queued" || status === "processing") {
    return "border-rose-200/35 bg-rose-400/12 text-rose-100 animate-pulse";
  }
  if (status === "error") return "border-rose-300/35 bg-rose-900/40 text-rose-100";
  return "border-white/10 bg-white/5 text-white/65";
}

function getVersionNumber(version: VersionRecord, fallbackIndex: number) {
  if (typeof version.versionNumber === "number" && Number.isFinite(version.versionNumber)) {
    return version.versionNumber;
  }

  const labelMatch = version.label.match(/(\d+)/);
  if (labelMatch?.[1]) {
    return Number(labelMatch[1]);
  }

  return version.isOriginal || version.label.toLowerCase() === "original" ? 1 : fallbackIndex + 1;
}

function getVersionGenerationType(version: VersionRecord): VersionGenerationType {
  if (version.status === "edit_plan") return "Edit Plan";
  if (version.isOriginal || version.label.toLowerCase() === "original") return "Original";
  if (version.provider === "studio-mixer" || version.label.toLowerCase().includes("mix edit")) {
    return "Mix Edit";
  }
  if (
    version.provider === "replicate" &&
    version.createdFrom &&
    ["new-version", "remix", "instrumental", "co-producer"].includes(version.createdFrom)
  ) {
    return "Paid AI Version";
  }
  if (version.createdFrom === "import" || version.provider === "studio-import") return "Original";
  if (version.createdFrom === "co-producer" || version.generationIntent === "co_producer") return "Co-Producer";
  if (version.generationIntent === "remix") return "Remix";
  if (version.vocalMode === "instrumental" || version.generationIntent === "instrumental") {
    return "Instrumental";
  }

  return "New Version";
}

function getVersionBadgeClass(type: VersionGenerationType) {
  if (type === "Edit Plan") {
    return "border-amber-200/45 bg-amber-400/15 text-amber-100";
  }

  if (type === "Paid AI Version") {
    return "border-rose-200/40 bg-rose-400/15 text-rose-100";
  }

  if (type === "Mix Edit") {
    return "border-teal-200/40 bg-teal-400/15 text-teal-100";
  }

  if (type === "Co-Producer") {
    return "border-fuchsia-200/40 bg-fuchsia-400/15 text-fuchsia-100";
  }

  if (type === "Original") {
    return "border-cyan-200/40 bg-cyan-300/15 text-cyan-100";
  }

  if (type === "Remix") {
    return "border-purple-200/40 bg-purple-400/15 text-purple-100";
  }

  if (type === "Instrumental") {
    return "border-emerald-200/40 bg-emerald-400/15 text-emerald-100";
  }

  return "border-blue-200/40 bg-blue-400/15 text-blue-100";
}

function getCreatedFromLabel(version: VersionRecord, versions: VersionRecord[]) {
  if (version.isOriginal || version.label.toLowerCase() === "original") {
    return "Original source";
  }

  if (version.parentVersionId) {
    const parent = versions.find((candidate) => candidate.id === version.parentVersionId);
    if (parent) return `Created from ${parent.label}`;
  }

  const versionNumber = getVersionNumber(version, 0);
  const previous = versions.find((candidate) => {
    if (candidate.id === version.id) return false;
    return getVersionNumber(candidate, 0) === versionNumber - 1;
  });

  return `Created from ${previous?.label || "Original"}`;
}

function hasMockStemsMetadata(value: unknown) {
  return Boolean(value && typeof value === "object" && (value as { mock?: unknown }).mock);
}

function Fader({
  label,
  value,
  muted,
  soloed,
  showMuteSolo = true,
  min = 0,
  max = 100,
  displayValue,
  onChange,
  onMute,
  onSolo,
}: {
  label: string;
  value: number;
  muted: boolean;
  soloed: boolean;
  showMuteSolo?: boolean;
  min?: number;
  max?: number;
  displayValue?: string;
  onChange: (value: number) => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  function getFaderTrackColor(value: number) {
    const span = Math.max(1, max - min);
    const clamped = Math.max(0, Math.min(100, ((value - min) / span) * 100));

    if (clamped <= 50) {
      const ratio = clamped / 50;
      const r = Math.round(0 + (255 - 0) * ratio);
      const g = Math.round(255 + (230 - 255) * ratio);
      const b = Math.round(90 + (0 - 90) * ratio);
      return `rgb(${r},${g},${b})`;
    }

    const ratio = (clamped - 50) / 50;
    const r = Math.round(255 + (255 - 255) * ratio);
    const g = Math.round(230 + (40 - 230) * ratio);
    const b = Math.round(0 + (40 - 0) * ratio);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <div className="flex min-w-[80px] flex-col items-center rounded-[22px] border border-sky-200/15 bg-[linear-gradient(180deg,rgba(125,211,252,0.08),rgba(2,6,23,0.38))] px-2.5 py-4">
      <div className="mb-2 flex min-h-[38px] items-center text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
        {label}
      </div>

      <div className="mb-3 text-xs font-semibold text-white">{displayValue || `${value}%`}</div>

      <div className="relative flex h-48 items-center justify-center">
        <div className="absolute h-36 w-5 rounded-full bg-white/6 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]" />
        <div
          className="absolute h-36 w-2 rounded-full"
          style={{
            background: getFaderTrackColor(value),
          }}
        />
        <div className="pointer-events-none absolute inset-y-6 left-1/2 flex h-32 -translate-x-1/2 flex-col justify-between">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="h-px w-5 bg-white/12" />
          ))}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ accentColor: "rgb(125,211,252)" }}
          className="h-36 w-48 -rotate-90 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[10px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[4px] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/90 [&::-webkit-slider-thumb]:bg-[linear-gradient(to_right,white_0%,white_44%,rgba(0,0,0,0.75)_44%,rgba(0,0,0,0.75)_56%,white_56%,white_100%)] [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.35)] [&::-moz-range-track]:h-[10px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-[4px] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/90 [&::-moz-range-thumb]:bg-[linear-gradient(to_right,white_0%,white_44%,rgba(0,0,0,0.75)_44%,rgba(0,0,0,0.75)_56%,white_56%,white_100%)] [&::-moz-range-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
        />
      </div>

      {showMuteSolo ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onMute}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              muted
                ? "bg-rose-500 text-white"
                : "border border-white/12 bg-white/7 text-white/75 hover:bg-white/12"
            }`}
          >
            M
          </button>
          <button
            type="button"
            onClick={onSolo}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              soloed
                ? "bg-sky-400 text-white"
                : "border border-white/12 bg-white/7 text-white/75 hover:bg-white/12"
            }`}
          >
            S
          </button>
        </div>
      ) : (
        <div className="mt-3 h-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
          DSP
        </div>
      )}
    </div>
  );
}

export default function CreatePage() {
  const [idea, setIdea] = useState(
    "Late-night skyline anthem with glossy synths, emotional lift, and a chorus that opens up fast."
  );
  const [title, setTitle] = useState("Night Drive Signal");
  const [projectName, setProjectName] = useState("Night Drive Signal");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [projectNameUnsaved, setProjectNameUnsaved] = useState(false);
  const [projectNameSaving, setProjectNameSaving] = useState(false);
  const [studioProjectNames, setStudioProjectNames] = useState<Record<string, string>>({});
  const [artistIdentity, setArtistIdentity] = useState("");
  const [trackGenre, setTrackGenre] = useState("Electronic");
  const [references, setReferences] = useState(
    "Reference: widescreen synth-pop, dramatic pre-chorus tension, premium streaming-ready finish"
  );

  const [musicDirection, setMusicDirection] = useState(
    "Build a polished SoundioX release with a fast emotional payoff, a memorable hook, and a chorus lift that feels ready for repeat listens."
  );
  const [finalDirection, setFinalDirection] = useState(
    "Build a polished SoundioX release with a fast emotional payoff, a memorable hook, and a chorus lift that feels ready for repeat listens."
  );
  const [lyricsDirection, setLyricsDirection] = useState(
    "Write lyrics that feel intimate in the verse and emotionally direct in the chorus, with a short repeatable hook."
  );
  const [artworkDirection, setArtworkDirection] = useState(
    "Create glassy skyline cover art with cool light bloom, reflective surfaces, and a premium midnight blue palette."
  );
  const [artworkDirectionConcept, setArtworkDirectionConcept] = useState<ArtworkConcept | null>(null);
  const [songLanguage, setSongLanguage] = useState("");
  const [directionLoading, setDirectionLoading] = useState<Record<DirectionKey, boolean>>({
    music: false,
    lyrics: false,
    artwork: false,
  });
  const [coProducerLoading, setCoProducerLoading] = useState<Record<CoProducerMode, boolean>>({
    prompt: false,
    music: false,
    lyrics: false,
    artwork: false,
    voiceover: false,
    edit: false,
  });
  const [coProducerRemaining, setCoProducerRemaining] = useState(MAX_CO_PRODUCER_ACTIONS);
  const [coProducerError, setCoProducerError] = useState<string | null>(null);
  const [promptHelpSuggestion, setPromptHelpSuggestion] = useState("");
  const [lyricsHelpSuggestion, setLyricsHelpSuggestion] = useState("");

  const [lyricsPrompt, setLyricsPrompt] = useState(
    "Emotional synth-pop lyric with a strong first chorus payoff and a compact memorable hook."
  );
  const [lyricsPreview, setLyricsPreview] = useState(
    "City lights on the glass again\nYour name in the static air\nHold the night before it ends\nMeet me where the skyline stares"
  );

  const [voiceoverScript, setVoiceoverScript] = useState(
    "When the skyline wakes, let the first note arrive like a signal through the dark."
  );
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("cinematic");
  const [voiceDelivery, setVoiceDelivery] = useState<VoiceDelivery>("dramatic");

  const [vocalMode, setVocalMode] = useState<VocalMode>("auto-lyrics");

  const [uploadedTrackName, setUploadedTrackName] = useState("");
  const [uploadedTrackNotes, setUploadedTrackNotes] = useState(
    "Use this imported track as a starting point and push the chorus harder without losing the core feel."
  );
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "uploading" | "imported" | "error">("idle");
  const [importMessage, setImportMessage] = useState("Choose an MP3, WAV, FLAC, or M4A file.");
  const [stemPrepareError, setStemPrepareError] = useState<{
    httpStatus: number | null;
    message: string;
    trackVersionId: string;
    trackGroupId: string;
    hasAudioUrl: boolean;
    rawApiResponse?: unknown;
  } | null>(null);

  const [studioPhase, setStudioPhase] = useState<"idle" | "loading" | "complete">("idle");
  const [stepState, setStepState] = useState<Record<StepKey, boolean>>({
    track: false,
    vocals: false,
    artwork: false,
  });

  const [versions, setVersions] = useState<VersionRecord[]>(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState("original");
  const [activeTrackGroupId, setActiveTrackGroupId] = useState<string | null>(null);

  const [mixer, setMixer] = useState<MixerState>(initialMixer);
  const [mixerEditStatus, setMixerEditStatus] = useState<MixerEditStatus>("Idle");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("off");
  const [previewRenderUrl, setPreviewRenderUrl] = useState<string | null>(null);
  const [activeCoProducerPreset, setActiveCoProducerPreset] =
    useState<CoProducerPresetName | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [heroPlaying, setHeroPlaying] = useState(false);
  const [heroCurrentTime, setHeroCurrentTime] = useState(0);
  const [heroDuration, setHeroDuration] = useState(0);
  const [dynamics, setDynamics] = useState<DynamicsState>(initialDynamics);
  const [muted, setMuted] = useState<MuteState>({
    drums: false,
    bass: false,
    music: false,
    vocal: false,
    voiceover: false,
    fx: false,
    master: false,
    speed: false,
    pitch: false,
    subBass: false,
  });
  const [soloed, setSoloed] = useState<SoloState>({
    drums: false,
    bass: false,
    music: false,
    vocal: false,
    voiceover: false,
    fx: false,
    master: false,
    speed: false,
    pitch: false,
    subBass: false,
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "ai-1",
      role: "ai",
      text: "I’d tighten the intro, push the chorus payoff earlier, and keep the skyline mood premium rather than too busy.",
      canApply: true,
    },
    {
      id: "user-1",
      role: "user",
      text: "Keep the emotional lift, but make the first chorus arrive faster and cleaner.",
    },
    {
      id: "ai-2",
      role: "ai",
      text: "For imported tracks, we can branch a remix or instrumental without ever touching the source version.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState("No export or submission action triggered yet.");
  const [selectedExportAction, setSelectedExportAction] = useState<ExportAction | null>(null);
  const [actionStates, setActionStates] = useState<Partial<Record<ActionKey, ActionStatus>>>({});
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishedTrackId, setPublishedTrackId] = useState<string | null>(null);
  const [studioProHandoffWarning, setStudioProHandoffWarning] = useState("");
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [pendingPaidEditGeneration, setPendingPaidEditGeneration] =
    useState<PendingPaidEditGeneration | null>(null);
  const [studioDrafts, setStudioDrafts] = useState<StudioDraftTrack[]>([]);
  const [studioDraftsLoading, setStudioDraftsLoading] = useState(false);
  const [expandedDraftGroups, setExpandedDraftGroups] = useState<Record<string, boolean>>({});
  const [pendingDeleteStudioProject, setPendingDeleteStudioProject] = useState<{
    trackGroupId: string;
    projectName: string;
  } | null>(null);
  const [studioProjectDeleting, setStudioProjectDeleting] = useState(false);
  const [publicReviewDraft, setPublicReviewDraft] = useState<StudioDraftTrack | null>(null);
  const [publicReviewSaving, setPublicReviewSaving] = useState(false);
  const [publicReviewMessage, setPublicReviewMessage] = useState<string | null>(null);
  const [vocalLayerLoading, setVocalLayerLoading] = useState(false);
  const [artworkConceptLoading, setArtworkConceptLoading] = useState(false);
  const [artworkImageLoading, setArtworkImageLoading] = useState(false);
  const [singingVersionLoading, setSingingVersionLoading] = useState(false);
  const [singingVersionMessage, setSingingVersionMessage] = useState("");
  const [voiceoverLayerStatus, setVoiceoverLayerStatus] = useState<VoiceoverLayerStatus>("idle");
  const [voiceoverLayerMessage, setVoiceoverLayerMessage] = useState(
    "Idle. Generate a spoken layer after selecting a generated version and lyrics."
  );
  const [voiceoverMixPlaying, setVoiceoverMixPlaying] = useState(false);
  const [musicPreviewVolume, setMusicPreviewVolume] = useState(0.85);
  const [voiceoverPreviewVolume, setVoiceoverPreviewVolume] = useState(0.75);
  const [voiceRecordingStatus, setVoiceRecordingStatus] = useState<VoiceRecordingStatus>("idle");
  const [voiceRecordingMessage, setVoiceRecordingMessage] = useState("No artist voice sample recorded yet.");
  const [pendingVoiceSampleBlob, setPendingVoiceSampleBlob] = useState<Blob | null>(null);
  const [voiceRecordingElapsedSeconds, setVoiceRecordingElapsedSeconds] = useState(0);
  const [voiceSampleUrl, setVoiceSampleUrl] = useState<string | null>(null);
  const [artistVoicePreviewStatus, setArtistVoicePreviewStatus] =
    useState<ArtistVoicePreviewStatus>("idle");
  const [artistVoicePreviewMessage, setArtistVoicePreviewMessage] = useState("");
  const [artistVoicePreviewUrl, setArtistVoicePreviewUrl] = useState<string | null>(null);
  const [publishDraft, setPublishDraft] = useState<PublishDraft>({
    title: "",
    artistName: "SoundioX Artist",
    genre: "Electronic",
    visibility: "Draft",
    versionLabel: "",
    duration: null,
    vocalMode: null,
    provider: null,
    audioReady: false,
    artworkReady: false,
  });
  const [latestAiEditAdvice, setLatestAiEditAdvice] = useState<LatestAiEditAdvice>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [generateStartedAt, setGenerateStartedAt] = useState<number | null>(null);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("seed");

  const activeGenerateJobIdRef = useRef<string | null>(null);
  const activeGenerateStartedAtRef = useRef<number | null>(null);
  const activeGenerateTokenRef = useRef<string | null>(null);
  const activeGenerateProviderRef = useRef<GenerationProvider | null>(null);
  const generatePollTimeoutRef = useRef<number | null>(null);
  const generationDeadlineRef = useRef<number | null>(null);
  const projectNameTouchedRef = useRef(false);
  const musicMixRef = useRef<HTMLAudioElement | null>(null);
  const voiceoverMixRef = useRef<HTMLAudioElement | null>(null);
  const mixerStatusTimeoutRef = useRef<number | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceRecorderStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderChunksRef = useRef<Blob[]>([]);
  const voiceRecordingStartedAtRef = useRef<number | null>(null);

  function setActionFeedback(key: ActionKey, status: ActionStatus, resetDelayMs = 1600) {
    setActionStates((current) => ({ ...current, [key]: status }));

    if (status === "success" || status === "error") {
      window.setTimeout(() => {
        setActionStates((current) => {
          if (current[key] !== status) return current;
          return { ...current, [key]: "idle" };
        });
      }, resetDelayMs);
    }
  }

  function getActionState(key: ActionKey, fallback: ActionStatus = "idle") {
    return actionStates[key] || fallback;
  }

  function getVoiceSampleMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/mp4", "audio/aac"];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
  }

  function stopVoiceRecorderStream() {
    voiceRecorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceRecorderStreamRef.current = null;
  }

  async function saveVoiceSample(blob: Blob) {
    setVoiceRecordingStatus("uploading");
    setVoiceRecordingMessage("Uploading artist voice sample...");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Log in to save your artist voice sample.");
    }

    const timestamp = Date.now();
    const path = `${user.id}/voice-sample-${timestamp}.m4a`;
    const uploadFile = new File([blob], `voice-sample-${timestamp}.m4a`, {
      type: blob.type || "audio/mp4",
    });
    const { error: uploadError } = await supabase.storage
      .from("voice-samples")
      .upload(path, uploadFile, {
        contentType: uploadFile.type || "audio/mp4",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Voice sample upload failed: ${uploadError.message}`);
    }

    const publicUrl = supabase.storage.from("voice-samples").getPublicUrl(path).data.publicUrl;
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ voice_sample_url: publicUrl })
      .eq("id", user.id);

    if (profileError) {
      throw new Error(`Voice sample profile save failed: ${profileError.message}`);
    }

    setVoiceSampleUrl(publicUrl);
    setPendingVoiceSampleBlob(null);
    setVoiceRecordingStatus("saved");
    setVoiceRecordingMessage("Artist voice sample saved.");
    setWorkspaceStatus("Artist voice sample saved for this profile.");
  }

  function savePendingVoiceSample() {
    if (!pendingVoiceSampleBlob) {
      setVoiceRecordingStatus("error");
      setVoiceRecordingMessage("No recorded voice sample to save.");
      return;
    }

    void saveVoiceSample(pendingVoiceSampleBlob).catch((error: any) => {
      const message = error?.message || "Voice sample save failed.";
      setVoiceRecordingStatus("error");
      setVoiceRecordingMessage(message);
      setWorkspaceStatus(message);
    });
  }

  async function startVoiceRecording() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceRecordingStatus("error");
      setVoiceRecordingMessage("Voice recording is not supported in this browser.");
      return;
    }

    const mimeType = getVoiceSampleMimeType();
    if (!mimeType) {
      setVoiceRecordingStatus("error");
      setVoiceRecordingMessage("This browser cannot record an M4A voice sample.");
      return;
    }

    try {
      setVoiceRecordingStatus("requesting");
      setVoiceRecordingMessage("Allow microphone access to record your artist voice.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      voiceRecorderChunksRef.current = [];
      setPendingVoiceSampleBlob(null);
      voiceRecorderStreamRef.current = stream;
      voiceRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceRecorderChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = voiceRecorderChunksRef.current;
        voiceRecorderChunksRef.current = [];
        stopVoiceRecorderStream();
        voiceRecorderRef.current = null;

        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) {
          setVoiceRecordingStatus("error");
          setVoiceRecordingMessage("Voice recording was empty.");
          return;
        }

        setPendingVoiceSampleBlob(blob);
        setVoiceRecordingStatus("recorded");
        setVoiceRecordingMessage("Voice sample recorded");
        setWorkspaceStatus("Voice sample recorded. Save it when you are ready.");
      };

      recorder.start();
      voiceRecordingStartedAtRef.current = Date.now();
      setVoiceRecordingElapsedSeconds(0);
      setVoiceRecordingStatus("recording");
      setVoiceRecordingMessage("Recording artist voice sample...");
      setWorkspaceStatus("Recording artist voice sample. Click Stop recording when finished.");
    } catch (error: any) {
      stopVoiceRecorderStream();
      voiceRecorderRef.current = null;
      voiceRecordingStartedAtRef.current = null;
      setVoiceRecordingStatus("error");
      setVoiceRecordingMessage(error?.message || "Could not start voice recording.");
      setWorkspaceStatus(error?.message || "Could not start voice recording.");
    }
  }

  function stopVoiceRecording() {
    if (voiceRecorderRef.current?.state === "recording") {
      voiceRecorderRef.current.stop();
      voiceRecordingStartedAtRef.current = null;
      setVoiceRecordingMessage("Preparing artist voice sample...");
      return;
    }

    stopVoiceRecorderStream();
    voiceRecorderRef.current = null;
    voiceRecordingStartedAtRef.current = null;
  }

  function handleRecordVoiceClick() {
    if (voiceRecordingStatus === "recording") {
      stopVoiceRecording();
      return;
    }

    if (voiceRecordingStatus === "recorded") {
      savePendingVoiceSample();
      return;
    }

    void startVoiceRecording();
  }

  async function generateArtistVoicePreview() {
    setArtistVoicePreviewStatus("generating");
    setArtistVoicePreviewMessage("Generating artist voice...");
    setArtistVoicePreviewUrl(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to generate an artist voice preview.");
      }

      const script =
        artistIdentity.trim() ||
        "This is my SoundioX artist voice. Welcome to my sound.";
      const response = await fetch("/api/studio/artist-voice-preview", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script,
          vocalMode,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Artist voice preview generation failed"));
      }

      const previewUrl =
        typeof payload?.artistVoicePreviewUrl === "string"
          ? payload.artistVoicePreviewUrl.trim()
          : "";
      if (!previewUrl) {
        throw new Error("Artist voice preview response was missing audio.");
      }

      setArtistVoicePreviewUrl(previewUrl);
      setArtistVoicePreviewStatus("ready");
      setArtistVoicePreviewMessage("Artist voice preview ready ✓");
    } catch (error: any) {
      setArtistVoicePreviewStatus("error");
      setArtistVoicePreviewMessage(`Failed: ${error?.message || "Artist voice preview failed."}`);
    }
  }

  function markMixerEditPlanned() {
    setMixerEditStatus("Planning");
    setWorkspaceStatus(
      realtimeMixPreview.playing
        ? "Mixer changes are live in Realtime Mix Preview."
        : "Mixer changes are heard in Realtime Mix Preview, not Source Reference."
    );

    if (mixerStatusTimeoutRef.current) {
      window.clearTimeout(mixerStatusTimeoutRef.current);
    }

    mixerStatusTimeoutRef.current = window.setTimeout(() => {
      setMixerEditStatus("Saved");
      mixerStatusTimeoutRef.current = window.setTimeout(() => {
        setMixerEditStatus("Idle");
      }, 1800);
    }, 450);
  }

  useEffect(() => {
    setFinalDirection(musicDirection);
  }, [musicDirection]);

  useEffect(() => {
    setGenerateError(null);
  }, [finalDirection, idea, title, vocalMode]);

  useEffect(() => {
    if (voiceRecordingStatus !== "recording") return;

    const intervalId = window.setInterval(() => {
      const startedAt = voiceRecordingStartedAtRef.current;
      if (!startedAt) {
        setVoiceRecordingElapsedSeconds(0);
        return;
      }

      setVoiceRecordingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [voiceRecordingStatus]);

  useEffect(() => {
    return () => {
      if (generatePollTimeoutRef.current) {
        window.clearTimeout(generatePollTimeoutRef.current);
      }
      if (mixerStatusTimeoutRef.current) {
        window.clearTimeout(mixerStatusTimeoutRef.current);
      }
      if (voiceRecorderRef.current?.state === "recording") {
        voiceRecorderRef.current.stop();
      } else {
        stopVoiceRecorderStream();
      }
    };
  }, []);

  useEffect(() => {
    void loadStudioDrafts();
    void loadArtistVoiceSampleStatus();
  }, []);

  const activeVersion = useMemo(
    () => versions.find((version) => version.id === activeVersionId) ?? versions[0] ?? emptyWorkspaceVersion,
    [activeVersionId, versions]
  );
  const activeStudioDraft = useMemo(
    () =>
      studioDrafts.find((draft) =>
        isStudioDraftActive(draft, activeVersion, activeVersionId, activeTrackGroupId)
      ) || null,
    [activeTrackGroupId, activeVersion, activeVersionId, studioDrafts]
  );
  const activeVersionVoiceoverUrl = activeVersion.voiceoverUrl || activeVersion.vocalUrl || null;
  const selectedVoiceoverMode =
    normalizeVocalMode(vocalMode) || normalizeVocalMode(activeVersion.vocalMode);
  const voiceoverLayerMissingReason = !activeVersion.audioUrl
    ? "Generate a track first."
    : !lyricsPreview.trim()
      ? "Add or generate lyrics first."
      : selectedVoiceoverMode !== "male" && selectedVoiceoverMode !== "female"
        ? "Choose Male vocal or Female vocal."
        : "";
  const voiceoverLayerDisabled = vocalLayerLoading || Boolean(voiceoverLayerMissingReason);
  const activeStemStatus = normalizeStemStatus(activeVersion.stemsStatus);
  const realtimeMixPreview = useRealtimeMixPreview({
    sourceUrl: activeVersion.audioUrl || null,
    stemsReady: activeStemStatus === "ready",
    stems: {
      drums: activeVersion.stemDrumsUrl || null,
      bass: activeVersion.stemBassUrl || null,
      vocals: activeVersion.stemVocalsUrl || null,
      other: activeVersion.stemOtherUrl || null,
    },
    controls: {
      drums: mixer.drums,
      bass: mixer.bass,
      vocal: mixer.vocal,
      music: mixer.music,
      master: mixer.master,
      subBass: mixer.subBass,
      speed: mixer.speed,
    },
  });
  const activeVersionIsPersisted = isPersistedStudioVersion(activeVersion);
  const studioProHandoffTrackId =
    (activeVersion.id && isUuid(activeVersion.id) ? activeVersion.id : "") ||
    publishedTrackId ||
    activeStudioDraft?.id ||
    activeVersion.trackGroupId ||
    activeTrackGroupId ||
    generateJobId ||
    "";
  const activePrepareTrackGroupId = activeVersion.trackGroupId || activeTrackGroupId || null;
  const prepareStemsDisabledReason = !activeVersion
    ? "no activeVersion"
    : !activeVersion.id
      ? "no activeVersion.id"
      : !activeVersion.audioUrl
        ? "no audioUrl"
        : !activeVersionIsPersisted
          ? "local draft"
          : activeStemStatus === "queued"
            ? "stems queued"
            : activeStemStatus === "processing"
              ? "stems processing"
              : activeStemStatus === "ready"
                ? "stems ready"
                : null;

  useEffect(() => {
    if (vocalLayerLoading) return;

    if (activeVersionVoiceoverUrl) {
      setVoiceoverLayerStatus("generated");
      setVoiceoverLayerMessage("Voiceover layer is attached to this version.");
      return;
    }

    setVoiceoverLayerStatus("idle");
    setVoiceoverLayerMessage(
      "Idle. Generate a spoken layer after selecting a generated version and lyrics."
    );
  }, [activeVersion.id, activeVersionVoiceoverUrl, vocalLayerLoading]);

  useEffect(() => {
    setHeroPlaying(false);
    setHeroCurrentTime(0);
    setHeroDuration(0);
  }, [activeVersion.id, activeVersion.audioUrl]);

  useEffect(() => {
    setHeroPlaying(realtimeMixPreview.playing);
    setHeroCurrentTime(realtimeMixPreview.currentTime);
    setHeroDuration(realtimeMixPreview.duration);
  }, [realtimeMixPreview.currentTime, realtimeMixPreview.duration, realtimeMixPreview.playing]);

  useEffect(() => {
    if (!activeVersion.trackGroupId) return;
    if (activeStemStatus !== "queued" && activeStemStatus !== "processing") return;

    const intervalId = window.setInterval(() => {
      void loadTrackVersions(activeVersion.trackGroupId!, activeVersion, activeVersion.id);
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [activeStemStatus, activeVersion.id, activeVersion.trackGroupId]);

  const displayedVersions = useMemo(
    () =>
      [...versions].sort((a, b) => {
        const byVersionNumber = getVersionNumber(b, 0) - getVersionNumber(a, 0);
        if (byVersionNumber !== 0) return byVersionNumber;

        const bCreated = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
        const aCreated = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
        return bCreated - aCreated;
      }),
    [versions]
  );
  const versionTimeline = useMemo(
    () =>
      [...versions].sort((a, b) => {
        const byVersionNumber = getVersionNumber(a, 0) - getVersionNumber(b, 0);
        if (byVersionNumber !== 0) return byVersionNumber;

        const aCreated = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
        const bCreated = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
        return aCreated - bCreated;
      }),
    [versions]
  );
  const activeVersionTimelineIndex = versionTimeline.findIndex(
    (version) => version.id === activeVersionId
  );
  const previousVersion =
    activeVersionTimelineIndex > 0 ? versionTimeline[activeVersionTimelineIndex - 1] : null;
  const nextVersion =
    activeVersionTimelineIndex >= 0 && activeVersionTimelineIndex < versionTimeline.length - 1
      ? versionTimeline[activeVersionTimelineIndex + 1]
      : null;

  const studioDraftGroups = useMemo<StudioDraftProjectGroup[]>(() => {
    const groups = new Map<string, StudioDraftTrack[]>();

    studioDrafts.forEach((draft) => {
      const groupKey = getStudioDraftGroupKey(draft);
      groups.set(groupKey, [...(groups.get(groupKey) || []), draft]);
    });

    return Array.from(groups.entries())
      .map(([id, groupDrafts]) => {
        const drafts = [...groupDrafts].sort(
          (a, b) => getDraftCreatedTime(b) - getDraftCreatedTime(a)
        );
        const latestDraft = drafts[0];

        return {
          id,
          latestDraft,
          drafts,
          status: getStudioDraftProjectStatus(drafts, latestDraft),
          latestCreatedAt: latestDraft?.created_at ?? null,
        };
      })
      .filter((group): group is StudioDraftProjectGroup => Boolean(group.latestDraft))
      .sort((a, b) => getDraftCreatedTime(b.latestDraft) - getDraftCreatedTime(a.latestDraft));
  }, [studioDrafts]);

  const mixerSummary = useMemo(
    () => summarizeMixer(mixer, dynamics, vocalMode),
    [dynamics, mixer, vocalMode]
  );

  useEffect(() => {
    if (versions.length === 0) return;
    if (versions.some((version) => version.id === activeVersionId)) return;

    const newestVersion = displayedVersions[0] || versions[0];
    if (newestVersion) {
      setActiveVersionId(newestVersion.id);
    }
  }, [activeVersionId, displayedVersions, versions]);

  useEffect(() => {
    setMixer(activeVersion.mixer);
    setDynamics(activeVersion.dynamics);
  }, [activeVersion]);

  useEffect(() => {
    setVoiceoverMixPlaying(false);
    if (musicMixRef.current) {
      musicMixRef.current.pause();
      musicMixRef.current.currentTime = 0;
    }
    if (voiceoverMixRef.current) {
      voiceoverMixRef.current.pause();
      voiceoverMixRef.current.currentTime = 0;
    }
  }, [activeVersion.id, activeVersion.audioUrl, activeVersion.vocalUrl, activeVersion.voiceoverUrl]);

  useEffect(() => {
    const concept = normalizeArtworkConcept(activeVersion.artworkConcept);
    if (!concept) {
      if (activeVersion.trackGroupId) {
        setArtworkDirectionConcept(null);
      }
      return;
    }

    setArtworkDirectionConcept(concept);
    if (concept.imagePrompt) {
      setArtworkDirection(concept.imagePrompt);
    }
  }, [activeVersion.id, activeVersion.artworkConcept]);

  useEffect(() => {
    if (musicMixRef.current) {
      musicMixRef.current.volume = musicPreviewVolume;
    }
  }, [musicPreviewVolume]);

  useEffect(() => {
    if (voiceoverMixRef.current) {
      voiceoverMixRef.current.volume = voiceoverPreviewVolume;
    }
  }, [voiceoverPreviewVolume]);

  function setDirectionState(key: DirectionKey, next: boolean) {
    setDirectionLoading((current) => ({ ...current, [key]: next }));
  }

  function setCoProducerState(key: CoProducerMode, next: boolean) {
    setCoProducerLoading((current) => ({ ...current, [key]: next }));
  }

  function getCurrentDirectionForMode(mode: CoProducerMode) {
    if (mode === "prompt") return idea;
    if (mode === "music") return finalDirection;
    if (mode === "lyrics") return lyricsDirection;
    if (mode === "artwork") return artworkDirection;
    if (mode === "voiceover") return voiceoverScript;
    return `${finalDirection}\n\n${uploadedTrackNotes}`;
  }

  function getLanguageInstruction() {
    const language = songLanguage.trim();
    if (!language) return "";

    return `Write and sing entirely in ${language}. Do not use any other language unless explicitly requested.`;
  }

  function appendLanguageInstruction(value: string) {
    const instruction = getLanguageInstruction();
    const trimmedValue = value.trim();
    if (!instruction) return trimmedValue;
    if (!trimmedValue) return instruction;
    if (trimmedValue.includes(instruction)) return trimmedValue;

    return `${trimmedValue}\n\n${instruction}`;
  }

  function getActiveArtworkConcept() {
    return normalizeArtworkConcept(activeVersion.artworkConcept) || artworkDirectionConcept;
  }

  function getArtworkConceptForGeneration(parentVersion?: VersionRecord | null) {
    return (
      normalizeArtworkConcept(parentVersion?.artworkConcept) ||
      artworkDirectionConcept ||
      null
    );
  }

  function applyArtworkConceptToActiveVersion(concept: ArtworkConcept) {
    setVersions((current) =>
      current.map((version) =>
        version.id === activeVersion.id
          ? {
              ...version,
              artworkConcept: concept,
              note: version.note.includes("Artwork concept:")
                ? version.note
                : `${version.note} Artwork concept: ${concept.summary}`,
            }
          : version
      )
    );
  }

  function updateReleaseTitle(nextTitle: string) {
    setTitle(nextTitle);
    if (!projectNameTouchedRef.current) {
      setProjectName(nextTitle);
      setProjectNameUnsaved(true);
    }
  }

  function updateProjectName(nextProjectName: string) {
    projectNameTouchedRef.current = true;
    setProjectName(nextProjectName);
    setProjectNameTouched(true);
    setProjectNameUnsaved(true);
  }

  function getProjectNameFallback(draftTitle?: string | null) {
    const trimmedProjectName = projectName.trim();
    return trimmedProjectName || draftTitle?.trim() || title.trim() || "Untitled Studio project";
  }

  function getCurrentTrackGroupId() {
    return activeVersion.trackGroupId || activeTrackGroupId || null;
  }

  function applyCoProducerResult(mode: CoProducerMode, result: string, source: "chat" | "action") {
    if (mode === "music") {
      setMusicDirection(result);
      setFinalDirection(result);
      return;
    }

    if (mode === "lyrics") {
      if (source === "chat") {
        setLyricsDirection(result);
      } else {
        setLyricsPreview(result);
      }
      return;
    }

    if (mode === "artwork") {
      setArtworkDirection(result);
      const concept = buildArtworkConceptFromDirection(result);
      setArtworkDirectionConcept(concept);
      return;
    }

    if (mode === "voiceover") {
      setVoiceoverScript(result);
      return;
    }

    setWorkspaceStatus(result);
  }

  function parseEditAdvice(result: string) {
    const changeMatch = result.match(
      /CHANGE:\s*([\s\S]*?)(?:\nIMPACT:|\nFINAL DIRECTION:|\nVERSION NOTE:|$)/i
    );
    const impactMatch = result.match(
      /IMPACT:\s*([\s\S]*?)(?:\nFINAL DIRECTION:|\nVERSION NOTE:|$)/i
    );
    const finalDirectionMatch = result.match(
      /FINAL DIRECTION:\s*([\s\S]*?)(?:\nVERSION NOTE:|$)/i
    );
    const versionNoteMatch = result.match(/VERSION NOTE:\s*([\s\S]*?)$/i);

    return {
      raw: result.trim(),
      change: changeMatch?.[1]?.trim() || "",
      impact: impactMatch?.[1]?.trim() || "",
      finalDirection: finalDirectionMatch?.[1]?.trim() || "",
      versionNote: versionNoteMatch?.[1]?.trim() || "",
    };
  }

  function buildLocalCoProducerAdvice(userRequest: string): EditAdvice {
    const currentProjectName = getProjectNameFallback();
    const currentVersionTitle = activeVersion.title || title || "Untitled track";
    const currentVersionNote = activeVersion.note || "No active version note yet.";
    const vocalLabel =
      vocalMode === "instrumental"
        ? "instrumental"
        : vocalMode === "auto-lyrics"
          ? "auto-lyrics vocal"
          : vocalMode === "write-lyrics"
            ? "written-lyrics vocal"
            : vocalMode === "duet"
              ? "duet vocal"
              : `${vocalMode} vocal`;
    const requestedFocus = userRequest.trim() || "strengthen the track";
    const directionSummary = [
      `Project: ${currentProjectName}`,
      `Release title: ${title || currentVersionTitle}`,
      `Genre: ${trackGenre}`,
      `Vocal mode: ${vocalLabel}`,
      `Current version: ${activeVersion.label} / ${currentVersionTitle}`,
      `Mixer: ${mixerSummary}`,
      `Current note: ${currentVersionNote}`,
    ].join("\n");
    const change = `Treat "${requestedFocus}" as a production brief for ${currentProjectName}. Keep the cinematic direction, but tighten the arrangement so the intro has less waiting, the pre-chorus points faster at the hook, and the chorus timing lands with a clearer emotional payoff. Raise energy in the transition moments without crowding the vocal or lead motif.`;
    const impact = `This branch should feel more intentional: stronger hook strength, cleaner mix balance, more obvious chorus lift, and a wider cinematic finish. Keep the ${trackGenre} identity, but make the emotional payoff arrive sooner and make the last chorus feel earned rather than simply louder.`;
    const finalDirection = `${musicDirection}\n\nCo-Producer branch direction:\n${directionSummary}\n\nRequest: ${requestedFocus}\n\nArrangement: shorten or simplify the opening phrase, make the chorus arrive with a stronger setup, and let the bridge create contrast before the final lift.\nEnergy: add controlled lift into each chorus while preserving the core mood.\nMix balance: keep the vocal/lead hook forward, keep low end steady, widen the cinematic layers, and avoid masking the hook.\nLyrics direction: ${lyricsDirection}\nArtwork direction: ${artworkDirection}`;
    const versionNote = `Co-producer edit draft from "${requestedFocus}". Arrangement tightened, chorus timing pushed forward, emotional payoff strengthened, energy shaped around the hook, and mix balance adjusted for a wider cinematic direction. Audio preview reuses the parent version until regenerated.`;
    const raw = `CHANGE: ${change}\nIMPACT: ${impact}\nFINAL DIRECTION: ${finalDirection}\nVERSION NOTE: ${versionNote}`;

    return {
      raw,
      change,
      impact,
      finalDirection,
      versionNote,
    };
  }

  function resolveChatMode(input: string): CoProducerMode {
    const normalized = input.toLowerCase();

    if (
      normalized.includes("cover") ||
      normalized.includes("artwork") ||
      normalized.includes("album art") ||
      normalized.includes("image")
    ) {
      return "artwork";
    }

    if (
      normalized.includes("voiceover") ||
      normalized.includes("spoken intro") ||
      normalized.includes("narration")
    ) {
      return "voiceover";
    }

    if (
      normalized.includes("lyric") ||
      normalized.includes("write lyrics") ||
      normalized.includes("song words") ||
      normalized.includes("verse") ||
      normalized.includes("chorus lyrics")
    ) {
      return "lyrics";
    }

    if (normalized.trim()) {
      return "edit";
    }

    return "music";
  }

  async function requestCoProducer({
    mode,
    userRequest,
    currentDirection,
  }: {
    mode: CoProducerMode;
    userRequest: string;
    currentDirection: string;
  }) {
    if (coProducerRemaining <= 0) {
      setCoProducerError("No co-producer actions remaining for this track.");
      return null;
    }

    setCoProducerError(null);
    setCoProducerState(mode, true);
    if (mode === "music" || mode === "lyrics" || mode === "artwork") {
      setDirectionState(mode, true);
    }

    try {
      const response = await fetch("/api/co-producer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          idea: `${title}\n${idea}${references.trim() ? `\n${references.trim()}` : ""}`,
          currentDirection,
          userRequest,
          remaining: coProducerRemaining,
          context: {
            surface: "studio",
            activeVersionId: activeVersion.id || null,
            title: activeVersion.title || title || null,
            genre: trackGenre || activeStudioDraft?.genre || null,
            moodVibe: references.trim() || musicDirection || finalDirection || idea || null,
            prompt: activeVersion.prompt || finalDirection || idea || null,
            lyrics: lyricsPreview.trim() || null,
            lyricsDirection: lyricsDirection.trim() || null,
            artistIdentityText: artistIdentity.trim() || null,
            voiceSampleAvailable: Boolean(voiceSampleUrl),
            vocalMode: activeVersion.vocalMode || vocalMode || null,
            stemsStatus: activeStemStatus,
            masteringSettings: {
              mixer,
              dynamics,
              summary: mixerSummary,
            },
            versionNumber: activeVersion.versionNumber || null,
            rootVersionId: activeVersion.rootVersionId || activeVersion.id || null,
            parentVersionId: activeVersion.parentVersionId || null,
            trackGroupId: activeVersion.trackGroupId || activeTrackGroupId || null,
            exportStatus: activeVersion.audioUrl ? "audio ready" : "missing audio URL",
            exportReadiness: {
              hasAudioUrl: Boolean(activeVersion.audioUrl),
              persisted: activeVersionIsPersisted,
              studioProHandoffReady: Boolean(studioProHandoffTrackId),
            },
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Co-producer request failed");
      }

      const result = typeof payload?.result === "string" ? payload.result.trim() : "";

      if (!result) {
        throw new Error("Co-producer returned an empty result");
      }

      setCoProducerRemaining(
        typeof payload?.usage?.remaining === "number"
          ? Math.max(0, payload.usage.remaining)
          : Math.max(0, coProducerRemaining - 1)
      );

      return result;
    } catch (error: any) {
      setCoProducerError(error?.message || "Co-producer request failed");
      return null;
    } finally {
      setCoProducerState(mode, false);
      if (mode === "music" || mode === "lyrics" || mode === "artwork") {
        setDirectionState(mode, false);
      }
    }
  }

  async function generateDirection(key: DirectionKey) {
    const requests: Record<DirectionKey, string> = {
      music: "Generate or improve the music direction for this track.",
      lyrics: "Generate or improve the lyrics direction with stronger emotional clarity and hook focus.",
      artwork: "Generate or improve premium streaming cover artwork direction.",
    };

    const result = await requestCoProducer({
      mode: key,
      userRequest: requests[key],
      currentDirection: getCurrentDirectionForMode(key),
    });

    if (result) {
      applyCoProducerResult(key, result, "action");
    }
  }

  async function improveDirection(key: DirectionKey, addition: string) {
    const result = await requestCoProducer({
      mode: key,
      userRequest: addition,
      currentDirection: getCurrentDirectionForMode(key),
    });

    if (result) {
      applyCoProducerResult(key, result, "action");
    }
  }

  async function requestPromptHelp(userRequest: string) {
    const result = await requestCoProducer({
      mode: "prompt",
      userRequest,
      currentDirection: [
        `Project idea: ${idea}`,
        `Music direction: ${musicDirection}`,
        `Final direction: ${finalDirection}`,
      ].join("\n\n"),
    });

    if (result) {
      setPromptHelpSuggestion(result);
      setWorkspaceStatus("Co-producer prompt suggestion ready.");
    }
  }

  function applyPromptHelpSuggestion() {
    const suggestion = promptHelpSuggestion.trim();
    if (!suggestion) return;

    setIdea(suggestion);
    setMusicDirection(suggestion);
    setFinalDirection(suggestion);
    setWorkspaceStatus("Co-producer prompt suggestion applied.");
  }

  async function requestLyricsHelp(userRequest: string) {
    const result = await requestCoProducer({
      mode: "lyrics",
      userRequest,
      currentDirection: [
        `Title: ${title}`,
        `Genre: ${trackGenre}`,
        `Mood/vibe: ${references.trim() || musicDirection || finalDirection || idea}`,
        `Lyrics direction: ${lyricsDirection}`,
        `Lyrics prompt: ${lyricsPrompt}`,
        getLanguageInstruction(),
        `Current lyrics:\n${lyricsPreview}`,
        `Artist identity: ${artistIdentity.trim() || "None provided."}`,
        `Voice sample available: ${Boolean(voiceSampleUrl)}`,
      ].join("\n\n"),
    });

    if (result) {
      setLyricsHelpSuggestion(result);
      setWorkspaceStatus("Co-producer lyrics suggestion ready.");
    }
  }

  function applyLyricsHelpSuggestion() {
    const suggestion = lyricsHelpSuggestion.trim();
    if (!suggestion) return;

    setLyricsPreview(suggestion);
    setWorkspaceStatus("Co-producer lyrics suggestion applied.");
  }

  async function handleLyricsAction(action: "generate" | "hook" | "emotional" | "chorus") {
    const actionMap = {
      generate: "generate",
      hook: "improve_hook",
      emotional: "make_emotional",
      chorus: "rewrite_chorus",
    } as const;

    if (coProducerRemaining <= 0) {
      setWorkspaceStatus("No co-producer actions remaining for this track.");
      return;
    }

    setCoProducerError(null);
    setCoProducerState("lyrics", true);
    setDirectionState("lyrics", true);

    try {
      const response = await fetch("/api/studio/lyrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: actionMap[action],
          projectName: getProjectNameFallback(),
          title,
          genre: trackGenre,
          lyricsPrompt: appendLanguageInstruction(lyricsPrompt),
          lyricsDirection: appendLanguageInstruction(lyricsDirection),
          currentLyrics: lyricsPreview,
          vocalMode,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Lyrics request failed"));
      }

      const nextLyrics = typeof payload?.lyrics === "string" ? payload.lyrics.trim() : "";
      const summary = typeof payload?.summary === "string" ? payload.summary.trim() : "";

      if (!nextLyrics) {
        throw new Error("Lyrics response was empty.");
      }

      setLyricsPreview(nextLyrics);
      setCoProducerRemaining((current) => Math.max(0, current - 1));
      setWorkspaceStatus(`Lyrics updated: ${summary || "New lyrics prepared."}`);
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Lyrics update failed.");
    } finally {
      setCoProducerState("lyrics", false);
      setDirectionState("lyrics", false);
    }
  }

  async function handleVoiceoverAction(action: "generate" | "warmer" | "dramatic" | "shorter") {
    const requests = {
      generate: "Generate a short spoken intro or voiceover script.",
      warmer: "Make the voiceover warmer and more human.",
      dramatic: "Make the voiceover more dramatic and cinematic.",
      shorter: "Shorten the spoken intro while keeping the key image.",
    };

    const result = await requestCoProducer({
      mode: "voiceover",
      userRequest: requests[action],
      currentDirection: voiceoverScript,
    });

    if (result) {
      setVoiceoverScript(result);
    }
  }

  function stringifyDetails(value: unknown) {
    if (typeof value === "string") return value;

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function extractApiError(payload: any, fallback: string) {
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
    if (typeof payload?.details === "string" && payload.details.trim()) return payload.details.trim();
    if (typeof payload?.runpod?.error === "string" && payload.runpod.error.trim()) {
      return payload.runpod.error.trim();
    }
    if (payload?.runpod) return stringifyDetails(payload.runpod);
    if (payload) return stringifyDetails(payload);
    return fallback;
  }

  function createGenerationToken() {
    return `${Date.now()}-${crypto.randomUUID()}`;
  }

  function isActiveGeneration(jobId: string | null, startedAt: number, token: string) {
    return (
      activeGenerateJobIdRef.current === jobId &&
      activeGenerateStartedAtRef.current === startedAt &&
      activeGenerateTokenRef.current === token
    );
  }

  function stopGenerationPolling() {
    if (generatePollTimeoutRef.current) {
      window.clearTimeout(generatePollTimeoutRef.current);
      generatePollTimeoutRef.current = null;
    }
    generationDeadlineRef.current = null;
  }

  function clearActiveGenerationRefs() {
    activeGenerateJobIdRef.current = null;
    activeGenerateStartedAtRef.current = null;
    activeGenerateTokenRef.current = null;
    activeGenerateProviderRef.current = null;
  }

  function normalizeLoadedVersion(version: VersionRecord, previous?: VersionRecord): VersionRecord {
    return {
      ...version,
      title: version.title?.trim() || previous?.title || title.trim() || "Untitled track",
      audioUrl: version.audioUrl || previous?.audioUrl || null,
      artworkConcept:
        normalizeArtworkConcept(version.artworkConcept) ||
        normalizeArtworkConcept(previous?.artworkConcept),
      vocalUrl: version.vocalUrl || version.voiceoverUrl || previous?.vocalUrl || previous?.voiceoverUrl || null,
      voiceoverUrl: version.voiceoverUrl || version.vocalUrl || previous?.voiceoverUrl || previous?.vocalUrl || null,
      vocalMode:
        normalizeVocalMode(version.vocalMode) ||
        normalizeVocalMode(previous?.vocalMode) ||
        normalizeVocalMode(vocalMode),
      duration:
        typeof version.duration === "number" && Number.isFinite(version.duration)
          ? version.duration
          : previous?.duration ?? null,
      stemsStatus: normalizeStemStatus(version.stemsStatus || previous?.stemsStatus),
      stemsRequestedAt: version.stemsRequestedAt || previous?.stemsRequestedAt || null,
      stemsCompletedAt: version.stemsCompletedAt || previous?.stemsCompletedAt || null,
      stemsError: version.stemsError || previous?.stemsError || null,
      stemDrumsUrl: version.stemDrumsUrl || previous?.stemDrumsUrl || null,
      stemBassUrl: version.stemBassUrl || previous?.stemBassUrl || null,
      stemVocalsUrl: version.stemVocalsUrl || previous?.stemVocalsUrl || null,
      stemOtherUrl: version.stemOtherUrl || previous?.stemOtherUrl || null,
      stemsMetadata: version.stemsMetadata || previous?.stemsMetadata || null,
    };
  }

  function mapTrackVersion(version: TrackVersionApiRecord): VersionRecord {
    const raw = version as TrackVersionApiRecord & {
      audioUrl?: string | null;
      artwork_concept?: unknown | null;
      artworkConcept?: unknown | null;
      artwork_url?: string | null;
      artworkUrl?: string | null;
      createdAt?: string | null;
      isOriginal?: boolean | null;
      parentVersionId?: string | null;
      rootVersionId?: string | null;
      trackGroupId?: string | null;
      versionLabel?: string | null;
      versionNumber?: number | null;
      vocal_url?: string | null;
      vocalUrl?: string | null;
      voiceover_url?: string | null;
      voiceoverUrl?: string | null;
      vocalMode?: string | null;
      imported_source?: string | null;
      importedSource?: string | null;
      stems_status?: string | null;
      stemsStatus?: string | null;
      stems_requested_at?: string | null;
      stemsRequestedAt?: string | null;
      stems_completed_at?: string | null;
      stemsCompletedAt?: string | null;
      stems_error?: string | null;
      stemsError?: string | null;
      stem_drums_url?: string | null;
      stemDrumsUrl?: string | null;
      stem_bass_url?: string | null;
      stemBassUrl?: string | null;
      stem_vocals_url?: string | null;
      stemVocalsUrl?: string | null;
      stem_other_url?: string | null;
      stemOtherUrl?: string | null;
      stems_metadata?: unknown | null;
      stemsMetadata?: unknown | null;
    };
    const versionNumber = raw.version_number ?? raw.versionNumber ?? 1;
    const createdAt = raw.created_at ?? raw.createdAt ?? null;
    const provider = raw.provider ?? null;
    const mappedVocalMode = normalizeVocalMode(raw.vocal_mode ?? raw.vocalMode ?? null);
    const mappedDuration =
      typeof raw.duration === "number" && Number.isFinite(raw.duration)
        ? raw.duration
        : null;

    const normalizedVersion = normalizeLoadedVersion({
      id: raw.id,
      label: raw.version_label || raw.versionLabel || `Version ${versionNumber}`,
      title: raw.title,
      prompt: raw.prompt || null,
      note: [
        formatVersionDate(createdAt),
        provider ? `Provider: ${provider}` : "",
        mappedVocalMode ? `Vocal: ${mappedVocalMode}` : "",
        typeof mappedDuration === "number" ? `${mappedDuration}s` : "",
      ]
        .filter(Boolean)
        .join(" • "),
      source: "generated",
      mixer: { ...initialMixer },
      dynamics: { ...initialDynamics },
      audioUrl: raw.audio_url || raw.audioUrl || null,
      artworkUrl: raw.artwork_url || raw.artworkUrl || null,
      artworkConcept: normalizeArtworkConcept(raw.artwork_concept ?? raw.artworkConcept ?? null),
      vocalUrl: raw.vocal_url || raw.vocalUrl || raw.voiceover_url || raw.voiceoverUrl || null,
      voiceoverUrl: raw.voiceover_url || raw.voiceoverUrl || raw.vocal_url || raw.vocalUrl || null,
      trackGroupId: raw.track_group_id || raw.trackGroupId || null,
      parentVersionId: raw.parent_version_id || raw.parentVersionId || null,
      rootVersionId: raw.root_version_id || raw.rootVersionId || null,
      versionNumber,
      generationIntent: normalizeGenerationIntent(raw.generation_intent),
      isOriginal: raw.is_original ?? raw.isOriginal ?? false,
      provider,
      vocalMode: mappedVocalMode,
      duration: mappedDuration,
      createdAt,
      createdFrom:
        raw.generation_mode === "import" || raw.imported_source || raw.importedSource
          ? "import"
          : raw.generation_intent === "co_producer"
            ? "co-producer"
            : "generation",
      importedSource: raw.imported_source || raw.importedSource || null,
      stemsStatus: normalizeStemStatus(raw.stems_status || raw.stemsStatus),
      stemsRequestedAt: raw.stems_requested_at || raw.stemsRequestedAt || null,
      stemsCompletedAt: raw.stems_completed_at || raw.stemsCompletedAt || null,
      stemsError: raw.stems_error || raw.stemsError || null,
      stemDrumsUrl: raw.stem_drums_url || raw.stemDrumsUrl || null,
      stemBassUrl: raw.stem_bass_url || raw.stemBassUrl || null,
      stemVocalsUrl: raw.stem_vocals_url || raw.stemVocalsUrl || null,
      stemOtherUrl: raw.stem_other_url || raw.stemOtherUrl || null,
      stemsMetadata: raw.stems_metadata || raw.stemsMetadata || null,
    });

    console.log("NORMALIZED VERSION ARTWORK", {
      id: normalizedVersion.id,
      title: normalizedVersion.title,
      hasArtworkUrl: Boolean(normalizedVersion.artworkUrl),
      hasArtworkConcept: Boolean(normalizedVersion.artworkConcept),
      artworkConceptKeys: normalizedVersion.artworkConcept
        ? Object.keys(normalizedVersion.artworkConcept)
        : [],
      stemsStatus: normalizedVersion.stemsStatus,
      hasStemDrumsUrl: Boolean(normalizedVersion.stemDrumsUrl),
      hasStemBassUrl: Boolean(normalizedVersion.stemBassUrl),
      hasStemVocalsUrl: Boolean(normalizedVersion.stemVocalsUrl),
      hasStemOtherUrl: Boolean(normalizedVersion.stemOtherUrl),
    });

    return normalizedVersion;
  }

  async function loadTrackVersions(
    trackGroupId: string,
    fallbackVersion: VersionRecord,
    preferredVersionId?: string | null
  ) {
    try {
      const response = await fetch(
        `/api/generate-track/versions?trackGroupId=${encodeURIComponent(trackGroupId)}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null);
      console.log("LOADED REOPEN VERSIONS PAYLOAD:", JSON.stringify(payload, null, 2));

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Failed to load versions"));
      }

      const dbVersions: VersionRecord[] = Array.isArray(payload?.versions)
        ? payload.versions.map((version: TrackVersionApiRecord) => mapTrackVersion(version))
        : [];
      const previousVersionsById = new Map(
        [...versions, fallbackVersion].map((version) => [version.id, version])
      );
      const mergedDbVersions = dbVersions.map((version) => {
        const previous = previousVersionsById.get(version.id);
        return normalizeLoadedVersion({
          ...version,
          generationIntent: version.generationIntent || previous?.generationIntent || null,
          audioUrl: version.audioUrl || previous?.audioUrl || null,
          artworkConcept:
            normalizeArtworkConcept(version.artworkConcept) ||
            normalizeArtworkConcept(previous?.artworkConcept),
          vocalUrl: version.vocalUrl || version.voiceoverUrl || previous?.vocalUrl || previous?.voiceoverUrl || null,
          voiceoverUrl: version.voiceoverUrl || version.vocalUrl || previous?.voiceoverUrl || previous?.vocalUrl || null,
          vocalMode: version.vocalMode || previous?.vocalMode || null,
          title: version.title || previous?.title || "",
          duration:
            typeof version.duration === "number" && Number.isFinite(version.duration)
              ? version.duration
              : previous?.duration ?? null,
          mixer: previous?.mixer || version.mixer,
          dynamics: previous?.dynamics || version.dynamics,
        }, previous);
      });

      if (mergedDbVersions.length === 0) {
        setVersions((current) => [...current, fallbackVersion]);
        setActiveVersionId(fallbackVersion.id);
        return false;
      }

      setVersions(mergedDbVersions);
      const preferredVersion = preferredVersionId
        ? mergedDbVersions.find((version) => version.id === preferredVersionId)
        : null;
      setActiveVersionId((preferredVersion || mergedDbVersions[0]).id);
      setActiveTrackGroupId(trackGroupId);
      return true;
    } catch (error) {
      setVersions((current) => [...current, fallbackVersion]);
      setActiveVersionId(fallbackVersion.id);
      return false;
    }
  }

  async function fetchSavedStudioProjectName(trackGroupId: string) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return null;

      const response = await fetch(
        `/api/studio/projects/upsert?trackGroupId=${encodeURIComponent(trackGroupId)}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        return null;
      }

      const savedProjectName =
        typeof payload?.project?.projectName === "string"
          ? payload.project.projectName.trim()
          : "";

      return savedProjectName || null;
    } catch (error) {
      void error;
      return null;
    }
  }

  async function loadStudioProjectNames(userId: string) {
    const { data, error } = await supabase
      .from("studio_projects")
      .select("track_group_id,project_name")
      .eq("user_id", userId)
      .not("track_group_id", "is", null);

    if (error) {
      setStudioProjectNames({});
      return;
    }

    const nextProjectNames: Record<string, string> = {};
    (data || []).forEach((project: { track_group_id: string | null; project_name: string | null }) => {
      const groupId = project.track_group_id?.trim();
      const savedProjectName = project.project_name?.trim();
      if (groupId && savedProjectName) {
        nextProjectNames[groupId] = savedProjectName;
      }
    });
    setStudioProjectNames(nextProjectNames);
  }

  async function loadGeneratedStudioProjectDrafts() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return [];

    try {
      const response = await fetch("/api/studio/projects/list", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        logStudioDraftsLoadError(payload || { error: "Generated Studio projects route failed" }, "/api/studio/projects/list");
        return [];
      }

      const drafts = Array.isArray(payload?.drafts) ? payload.drafts : [];
      return normalizeStudioDrafts(drafts);
    } catch (error) {
      logStudioDraftsLoadError(error, "/api/studio/projects/list");
      return [];
    }
  }

  function mergeStudioDraftSources(
    trackDrafts: StudioDraftTrack[],
    generatedProjectDrafts: StudioDraftTrack[]
  ) {
    const merged = new Map<string, StudioDraftTrack>();

    [...trackDrafts, ...generatedProjectDrafts].forEach((draft) => {
      const key = draft.source_track_group_id || draft.id;
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, draft);
        return;
      }

      const draftTime = getDraftCreatedTime(draft);
      const existingTime = getDraftCreatedTime(existing);
      const draftHasAudio = Boolean(draft.audio_url);
      const existingHasAudio = Boolean(existing.audio_url);

      if ((draftHasAudio && !existingHasAudio) || draftTime >= existingTime) {
        merged.set(key, draft);
      }
    });

    return Array.from(merged.values()).sort((a, b) => getDraftCreatedTime(b) - getDraftCreatedTime(a));
  }

  async function loadStudioDrafts() {
    setStudioDraftsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setStudioDrafts([]);
        setStudioProjectNames({});
        return;
      }

      await loadStudioProjectNames(user.id);
      const generatedProjectDrafts = await loadGeneratedStudioProjectDrafts();

      const loadDraftsWithColumns = (selectedColumns: string) =>
        supabase
          .from("tracks")
          .select(selectedColumns)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

      const extendedResult = await loadDraftsWithColumns(STUDIO_DRAFT_EXTENDED_COLUMNS);

      if (!extendedResult.error) {
        const trackDrafts = filterStudioCreatedTracks(normalizeStudioDrafts(extendedResult.data));
        setStudioDrafts(mergeStudioDraftSources(trackDrafts, generatedProjectDrafts));
        return;
      }

      logStudioDraftsLoadError(extendedResult.error, STUDIO_DRAFT_EXTENDED_COLUMNS);

      if (!isMissingColumnError(extendedResult.error)) {
        setStudioDrafts(mergeStudioDraftSources([], generatedProjectDrafts));
        return;
      }

      const baseResult = await loadDraftsWithColumns(STUDIO_DRAFT_BASE_COLUMNS);

      if (baseResult.error) {
        logStudioDraftsLoadError(baseResult.error, STUDIO_DRAFT_BASE_COLUMNS);
        setStudioDrafts(mergeStudioDraftSources([], generatedProjectDrafts));
        return;
      }

      const trackDrafts = normalizeStudioDrafts(baseResult.data).filter((draft) => draft.is_published === false);
      setStudioDrafts(mergeStudioDraftSources(trackDrafts, generatedProjectDrafts));
      setWorkspaceStatus("Studio drafts loaded with fallback fields.");
    } catch (error) {
      logStudioDraftsLoadError(error, STUDIO_DRAFT_EXTENDED_COLUMNS);
      setStudioDrafts([]);
    } finally {
      setStudioDraftsLoading(false);
    }
  }

  async function loadArtistVoiceSampleStatus() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("voice_sample_url")
      .eq("id", user.id)
      .maybeSingle<{ voice_sample_url: string | null }>();

    if (error) return;

    const savedVoiceSampleUrl = data?.voice_sample_url?.trim() || "";
    if (savedVoiceSampleUrl) {
      setVoiceSampleUrl(savedVoiceSampleUrl);
    }
  }

  async function cancelActiveGeneration(jobId: string, provider: GenerationProvider) {
    try {
      const response = await fetch("/api/generate-track/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId, provider }),
      });

      const payload = await response.json().catch(() => null);
      const label = provider === "replicate" ? "Full test generation" : "Seed generation";

      return {
        cancelled: Boolean(payload?.cancelled),
        available: payload?.available !== false,
        message: extractApiError(
          payload,
          payload?.cancelled
            ? `${label} timed out and the fallback job was cancelled.`
            : `${label} timed out. Cancellation was not available.`
        ),
        details:
          typeof payload?.details === "string" && payload.details.trim()
            ? payload.details.trim()
            : payload?.runpod
              ? stringifyDetails(payload.runpod)
              : null,
      };
    } catch {
      const label = provider === "replicate" ? "Full test generation" : "Seed generation";

      return {
        cancelled: false,
        available: false,
        message: `${label} timed out. Cancellation was not available.`,
        details: null,
      };
    }
  }

  async function pollGenerateStatus(
    jobId: string,
    trackTitle: string,
    startedAt: number,
    token: string,
    provider: GenerationProvider,
    requestVocalMode: VocalMode,
    generationIntent: GenerationIntent,
    parentVersionId: string | null,
    isBranchGeneration: boolean,
    branchActionType?: BranchActionType
  ) {
    if (!isActiveGeneration(jobId, startedAt, token)) {
      return;
    }

    if (generationDeadlineRef.current && Date.now() >= generationDeadlineRef.current) {
      stopGenerationPolling();
      const cancellation = await cancelActiveGeneration(jobId, provider);
      if (!isActiveGeneration(jobId, startedAt, token)) {
        return;
      }
      clearActiveGenerationRefs();
      setStudioPhase("idle");
      setGenerateStatus(cancellation.message);
      setGenerateError(
        cancellation.details ? `${cancellation.message} ${cancellation.details}` : cancellation.message
      );
      setGenerateJobId(null);
      setGenerateStartedAt(null);
      setStepState({
        track: false,
        vocals: false,
        artwork: false,
      });
      return;
    }

    try {
      const response = await fetch(
        `/api/generate-track/status?jobId=${encodeURIComponent(jobId)}&title=${encodeURIComponent(trackTitle)}&startedAt=${startedAt}&provider=${encodeURIComponent(provider)}`,
        {
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => null);

      if (!isActiveGeneration(jobId, startedAt, token)) {
        return;
      }

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Generation status request failed"));
      }

      if (payload?.status === "IN_QUEUE") {
        if (!isActiveGeneration(jobId, startedAt, token)) {
          return;
        }
        setGenerateStatus(
          provider === "replicate"
            ? "Queued for experimental full-track generation..."
            : "Queued for seed generation..."
        );
        generatePollTimeoutRef.current = window.setTimeout(() => {
          void pollGenerateStatus(
            jobId,
            trackTitle,
            startedAt,
            token,
            provider,
            requestVocalMode,
            generationIntent,
            parentVersionId,
            isBranchGeneration,
            branchActionType
          );
        }, 3000);
        return;
      }

      if (payload?.status === "IN_PROGRESS") {
        if (!isActiveGeneration(jobId, startedAt, token)) {
          return;
        }
        setGenerateStatus(
          provider === "replicate"
            ? "Generating your experimental full track..."
            : "Generating your seed..."
        );
        setStepState({
          track: true,
          vocals: false,
          artwork: false,
        });
        generatePollTimeoutRef.current = window.setTimeout(() => {
          void pollGenerateStatus(
            jobId,
            trackTitle,
            startedAt,
            token,
            provider,
            requestVocalMode,
            generationIntent,
            parentVersionId,
            isBranchGeneration,
            branchActionType
          );
        }, 3000);
        return;
      }

      if (payload?.status === "COMPLETED" && payload?.track?.audioUrl) {
        if (!isActiveGeneration(jobId, startedAt, token)) {
          return;
        }
        stopGenerationPolling();
        clearActiveGenerationRefs();
        setStudioPhase("complete");
        setGenerateStatus("Generation completed");
        setGenerateJobId(null);
        setGenerateStartedAt(null);
        setStepState({
          track: false,
          vocals: false,
          artwork: false,
        });
        setActionFeedback(
          generationIntent === "full" ? "generateFull" : "generateSeed",
          "success"
        );

        const nextNumber = versions.length + 1;
        const nextId =
          typeof payload?.trackVersionId === "string" && payload.trackVersionId.trim()
            ? payload.trackVersionId.trim()
            : `version-${nextNumber}`;
        const nextVersion: VersionRecord = {
          id: nextId,
          label: `Version ${nextNumber}`,
          title: payload.track.title || trackTitle,
          note: `Generated ${branchActionType ? `${branchActionType} branch` : "version"} from ${provider === "replicate" ? "experimental Replicate full-track" : "seed"} generation job ${jobId}. ${mixerSummary}. Original remains intact.`,
          source: "generated",
          mixer: { ...mixer },
          dynamics: { ...dynamics },
      audioUrl: payload.track.audioUrl,
      trackGroupId:
        typeof payload?.trackGroupId === "string" ? payload.trackGroupId : null,
      parentVersionId,
      versionNumber: null,
      generationIntent,
      isOriginal: !isBranchGeneration && versions.length === 0,
      createdFrom: branchActionType || "generation",
      provider,
      vocalMode: requestVocalMode,
          duration:
            typeof payload?.track?.duration === "number" ? payload.track.duration : null,
          createdAt: new Date().toISOString(),
        };

        setVersions((current) => {
          const withoutDuplicate = current.filter((version) => version.id !== nextVersion.id);
          return [...withoutDuplicate, nextVersion];
        });
        setActiveVersionId(nextVersion.id);

        if (typeof payload?.trackGroupId === "string" && payload.trackGroupId.trim()) {
          await loadTrackVersions(payload.trackGroupId.trim(), nextVersion);
        }
        return;
      }

      throw new Error(extractApiError(payload, "Unexpected generation status response"));
    } catch (error: any) {
      if (!isActiveGeneration(jobId, startedAt, token)) {
        return;
      }
      stopGenerationPolling();
      clearActiveGenerationRefs();
      setStudioPhase("idle");
      setGenerateJobId(null);
      setGenerateStartedAt(null);
      setStepState({
        track: false,
        vocals: false,
        artwork: false,
      });
      setGenerateError(error?.message || "Generation status check failed");
      setGenerateStatus(
        typeof error?.message === "string" && error.message.includes("timed out")
          ? error.message
          : null
      );
      setActionFeedback(
        generationIntent === "full" ? "generateFull" : "generateSeed",
        "error"
      );
    }
  }

  async function handleGenerate(options?: {
    generationIntent?: GenerationIntent;
    branchInstruction?: string;
    branchActionType?: BranchActionType;
    parentVersion?: VersionRecord;
  }) {
    const trimmedTitle = title.trim();
    const trimmedIdea = idea.trim();
    const trimmedFinalDirection = finalDirection.trim() || musicDirection.trim();
    const generationIntent = options?.generationIntent || generationMode;
    const selectedParentVersion = options?.parentVersion || activeVersion;
    const isBranchGeneration = ["new_version", "remix", "instrumental", "co_producer"].includes(generationIntent);
    const sourceTrackGroupId = isBranchGeneration
      ? selectedParentVersion.trackGroupId || activeTrackGroupId
      : null;
    const parentVersionId = isBranchGeneration && isUuid(selectedParentVersion.id)
      ? selectedParentVersion.id
      : null;
    const requestVocalMode: VocalMode =
      generationIntent === "instrumental" ? "instrumental" : vocalMode;

    if (!trimmedTitle) {
      setGenerateError("Add a track title before previewing generation.");
      return;
    }

    if (!trimmedIdea) {
      setGenerateError("Add the main track idea before previewing generation.");
      return;
    }

    if (!trimmedFinalDirection) {
      setGenerateError("Add a final music direction before previewing generation.");
      return;
    }

    if (!requestVocalMode) {
      setGenerateError("Choose a vocal mode before previewing generation.");
      return;
    }

    if (
      isBranchGeneration &&
      (typeof selectedParentVersion.duration !== "number" || !Number.isFinite(selectedParentVersion.duration)) &&
      sourceTrackGroupId
    ) {
      setGenerateError("Active version duration is missing. Generate or select a saved version before branching.");
      return;
    }

    setGenerateError(null);
    setGenerateStatus("Starting generation...");
    const previousJobId = activeGenerateJobIdRef.current || generateJobId;
    const previousProvider = activeGenerateProviderRef.current || "replicate";
    stopGenerationPolling();
    clearActiveGenerationRefs();
    setGenerateJobId(null);
    setGenerateStartedAt(null);
    if (previousJobId) {
      await cancelActiveGeneration(previousJobId, previousProvider);
    }
    setStudioPhase("loading");
    setStepState({
      track: true,
      vocals: false,
      artwork: false,
    });

    const startedAt = Date.now();
    const token = createGenerationToken();
    const generationProvider: GenerationProvider = "replicate";
    const generationActionKey: ActionKey =
      generationIntent === "full" || generationMode === "full" ? "generateFull" : "generateSeed";
    setActionFeedback(generationActionKey, "working", 0);
    const requestedDurationSeconds = isBranchGeneration
      ? Math.max(1, Math.floor(selectedParentVersion.duration || (generationMode === "seed" ? 15 : 30)))
      : generationIntent === "seed"
        ? 15
        : 30;
    const generationModeForRequest: GenerationMode =
      requestedDurationSeconds <= 15 ? "seed" : "full";
    const finalDirectionForRequest = isBranchGeneration
      ? buildBranchFinalDirection({
          baseDirection: trimmedFinalDirection,
          generationIntent,
          activeVersionLabel: selectedParentVersion.label,
          durationSeconds: requestedDurationSeconds,
          instruction: options?.branchInstruction,
        })
      : trimmedFinalDirection;
    const shouldAskProviderForLyrics = ["auto-lyrics", "male", "female", "duet"].includes(requestVocalMode);
    const lyricsPreviewForRequest =
      lyricsPreview.trim() ||
      (shouldAskProviderForLyrics
        ? "No written lyrics were provided. Generate original lyrics from the final music direction, lyrics direction, and lyrics prompt."
        : "");
    const artworkConceptForGeneration = getArtworkConceptForGeneration(selectedParentVersion);
    activeGenerateStartedAtRef.current = startedAt;
    activeGenerateTokenRef.current = token;
    activeGenerateProviderRef.current = generationProvider;
    setGenerateStartedAt(startedAt);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const generationHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        generationHeaders.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch("/api/generate-track", {
        method: "POST",
        headers: generationHeaders,
        body: JSON.stringify({
          title: trimmedTitle,
          finalDirection: finalDirectionForRequest,
          vocalMode: requestVocalMode,
          generationMode: generationModeForRequest,
          generationIntent,
          durationSeconds: requestedDurationSeconds,
          clientGenerationToken: token,
          provider: generationProvider,
          sourceTrackGroupId,
          parentVersionId,
          lyricsPreview: lyricsPreviewForRequest,
          lyricsPrompt: lyricsPrompt.trim(),
          lyricsDirection: lyricsDirection.trim(),
          artworkConcept: artworkConceptForGeneration,
          artistIdentity: {
            text: artistIdentity.trim(),
          },
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Generation start failed"));
      }

      const immediatePreviewUrl =
        typeof payload?.track?.previewUrl === "string" && payload.track.previewUrl.trim()
          ? payload.track.previewUrl.trim()
          : "";

      if (immediatePreviewUrl) {
        if (
          activeGenerateStartedAtRef.current !== startedAt ||
          activeGenerateTokenRef.current !== token
        ) {
          return;
        }

        stopGenerationPolling();
        clearActiveGenerationRefs();
        setStudioPhase("complete");
        setGenerateStatus("Generation completed");
        setGenerateJobId(null);
        setGenerateStartedAt(null);
        setStepState({
          track: false,
          vocals: false,
          artwork: false,
        });
        setActionFeedback(generationActionKey, "success");

        const nextNumber = versions.length + 1;
        const nextId = `version-${nextNumber}`;
        const nextVersion: VersionRecord = {
          id: nextId,
          label: `Version ${nextNumber}`,
          title: payload?.track?.title || trimmedTitle,
          note: `Generated from seed generation. ${mixerSummary}. Original remains intact.`,
          source: "generated",
          mixer: { ...mixer },
          dynamics: { ...dynamics },
          audioUrl: immediatePreviewUrl,
          artworkConcept: artworkConceptForGeneration,
          parentVersionId,
          versionNumber: null,
          generationIntent,
          isOriginal: !isBranchGeneration && versions.length === 0,
          createdFrom: options?.branchActionType || "generation",
        };

        setVersions((current) => [...current, nextVersion]);
        setActiveVersionId(nextId);
        setActionFeedback(generationActionKey, "success");
        return;
      }

      const jobId = typeof payload?.jobId === "string" ? payload.jobId.trim() : "";
      const status = typeof payload?.status === "string" ? payload.status.trim() : "";

      if (
        activeGenerateStartedAtRef.current !== startedAt ||
        activeGenerateTokenRef.current !== token
      ) {
        return;
      }

      if (!jobId || !status) {
        throw new Error("Seed generation start response missing job id");
      }

      activeGenerateJobIdRef.current = jobId;
      activeGenerateProviderRef.current = generationProvider;
      setGenerateJobId(jobId);
      setGenerateStatus(
        generationProvider === "replicate"
          ? "Queued for experimental full-track generation..."
          : "Queued for seed generation..."
      );
      generationDeadlineRef.current = startedAt + GENERATE_TIMEOUT_MS;
      void pollGenerateStatus(
        jobId,
        trimmedTitle,
        startedAt,
        token,
        generationProvider,
        requestVocalMode,
        generationIntent,
        parentVersionId,
        isBranchGeneration,
        options?.branchActionType
      );
    } catch (error: any) {
      if (
        activeGenerateStartedAtRef.current !== startedAt ||
        activeGenerateTokenRef.current !== token
      ) {
        return;
      }
      stopGenerationPolling();
      clearActiveGenerationRefs();
      setStudioPhase("idle");
      setStepState({
        track: false,
        vocals: false,
        artwork: false,
      });
      setGenerateError(error?.message || "Generation start failed");
      setGenerateStatus(null);
      setGenerateStartedAt(null);
      setGenerateJobId(null);
      setActionFeedback(generationActionKey, "error");
    }
  }

  function updateFader(key: FaderKey, value: number) {
    setMixer((current) => ({
      ...current,
      [key]: clampMixerValue(key, value),
    }));
    markMixerEditPlanned();
  }

  function updateLoopMode(loopMode: LoopMode) {
    setMixer((current) => ({
      ...current,
      loopMode,
    }));
    markMixerEditPlanned();
  }

  function updateExtendMode(extendMode: ExtendMode) {
    setMixer((current) => ({
      ...current,
      extendMode,
    }));
    markMixerEditPlanned();
  }

  function updateMasterNormalize(masterNormalize: boolean) {
    setMixer((current) => ({
      ...current,
      masterNormalize,
    }));
    markMixerEditPlanned();
  }

  function updatePreviewMode(nextPreviewMode: PreviewMode) {
    setPreviewMode(nextPreviewMode);
    setPreviewRenderUrl(null);
  }

  function applyCoProducerPreset(presetName: CoProducerPresetName) {
    const preset = coProducerPresets.find((candidate) => candidate.name === presetName);
    if (!preset) return;

    setMixer((current) => ({
      ...current,
      ...preset.mixer,
    }));
    setDynamics((current) => ({
      ...current,
      ...(preset.dynamics || {}),
    }));
    setActiveCoProducerPreset(preset.name);
    setWorkspaceStatus(preset.summary);
    setActionFeedback("coProducerPreset", "success");
    markMixerEditPlanned();
  }

  async function toggleHeroPlayback() {
    if (!activeVersion.audioUrl) return;

    try {
      await realtimeMixPreview.toggle();
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Could not start playback.");
      setHeroPlaying(false);
    }
  }

  function updateDynamics(key: DynamicsKey, value: number) {
    setDynamics((current) => ({
      ...current,
      [key]: clampValue(value),
    }));
    markMixerEditPlanned();
  }

  function toggleMute(key: FaderKey) {
    setMuted((current) => ({ ...current, [key]: !current[key] }));
    markMixerEditPlanned();
  }

  function toggleSolo(key: FaderKey) {
    setSoloed((current) => ({ ...current, [key]: !current[key] }));
    markMixerEditPlanned();
  }

  function createVersion(action: string, source: "generated" | "imported") {
    const nextNumber = versions.length + 1;
    const nextId = `version-${nextNumber}`;
    const nextLabel = `Version ${nextNumber}`;
    const nextMixer = { ...mixer };
    const nextDynamics = { ...dynamics };

    if (action === "Instrumental version") {
      nextMixer.vocal = 0;
      nextMixer.voiceover = 0;
    }

    if (action === "Create remix") {
      nextMixer.drums = clampValue(nextMixer.drums + 10);
      nextMixer.bass = clampValue(nextMixer.bass + 8);
      nextMixer.fx = clampValue(nextMixer.fx + 12);
      nextMixer.master = clampValue(nextMixer.master + 6);
    }

    if (action === "Create new version") {
      nextMixer.master = clampValue(nextMixer.master + 4);
    }

    if (action === "Apply & Create Version") {
      nextMixer.music = clampValue(nextMixer.music + 6);
      nextMixer.fx = clampValue(nextMixer.fx + 8);
      nextDynamics.width = clampValue(nextDynamics.width + 8);
      nextDynamics.compression = clampValue(nextDynamics.compression + 6);
    }

    if (action === "Submit to SoundioX") {
      nextDynamics.compression = clampValue(nextDynamics.compression + 3);
    }

    if (action === "Export for Spotify") {
      nextMixer.master = clampValue(nextMixer.master + 2);
      nextDynamics.width = clampValue(nextDynamics.width + 4);
    }

    if (action === "Export release package") {
      nextDynamics.fadeOut = clampValue(nextDynamics.fadeOut + 4);
    }

    const nextVersion: VersionRecord = {
      id: nextId,
      label: nextLabel,
      title: `${title} ${action}`,
      note: buildVersionNote(action, nextMixer, nextDynamics, vocalMode),
      source,
      mixer: nextMixer,
      dynamics: nextDynamics,
    };

    setVersions((current) => [...current, nextVersion]);
    setActiveVersionId(nextId);
  }

  function createEditPlanVersion({
    actionType,
    instruction,
    parentVersion,
  }: PendingPaidEditGeneration) {
    const actionKey =
      actionType === "remix"
        ? "createRemix"
        : actionType === "instrumental"
          ? "instrumentalVersion"
          : actionType === "co-producer"
            ? "coProducerApply"
            : "createNewVersion";
    const nextNumber =
      Math.max(0, ...versions.map((version, index) => getVersionNumber(version, index))) + 1;
    const nextId = `edit-plan-${Date.now()}`;
    const nextLabel = `Version ${nextNumber}`;
    const editTitle = `${parentVersion.title || title || "Untitled track"} - ${getBranchActionTitle(
      actionType
    )}`;
    const plannedVocalMode = actionType === "instrumental" ? "instrumental" : vocalMode;

    const nextVersion: VersionRecord = {
      id: nextId,
      label: nextLabel,
      title: editTitle,
      note: "Edit plan saved. Low-cost audio edit engine is not connected yet.",
      source: parentVersion.source,
      mixer: { ...mixer },
      dynamics: { ...dynamics },
      audioUrl: null,
      artworkUrl: parentVersion.artworkUrl || null,
      artworkConcept: parentVersion.artworkConcept || null,
      vocalUrl: null,
      voiceoverUrl: null,
      trackGroupId: parentVersion.trackGroupId || activeTrackGroupId || null,
      parentVersionId: parentVersion.id,
      versionNumber: nextNumber,
      generationIntent: getGenerationIntentForBranchAction(actionType),
      isOriginal: false,
      provider: null,
      vocalMode: plannedVocalMode,
      duration: parentVersion.duration ?? null,
      createdAt: new Date().toISOString(),
      createdFrom: actionType,
      status: "edit_plan",
      actionType,
      editInstruction: instruction,
      coProducerInstruction: actionType === "co-producer" ? instruction : null,
      directionSummary: instruction,
    };

    if (actionType === "instrumental") {
      setVocalMode("instrumental");
    }

    setVersions((current) => [...current, nextVersion]);
    setActiveVersionId(nextId);
    setActionFeedback(actionKey, "success");
    setWorkspaceStatus(
      "Edit plan saved. Low-cost audio edit engine is not connected yet. This is an edit plan. Audio has not been changed yet."
    );
  }

  function buildBranchInstruction(args: {
    actionType: BranchActionType;
    instruction: string;
    parentVersion: VersionRecord;
  }) {
    const sourceAudioNote = args.parentVersion.audioUrl
      ? `Source audio reference available: ${args.parentVersion.audioUrl}. Use it only as contextual reference if the provider supports source audio; otherwise follow the prompt.`
      : "No source audio reference is available, so this must be prompt-based.";
    const actionInstruction =
      args.actionType === "remix"
        ? "Create a remix/rearranged version with a new groove, fresh drums, changed energy, and alternate arrangement while keeping the core mood recognizable."
        : args.actionType === "instrumental"
          ? "Create an instrumental-only version. No vocals, no singing, no spoken voice, no lyrics."
          : args.actionType === "co-producer"
            ? "Apply the co-producer guidance as a new generated version with improved arrangement, chorus timing, emotional payoff, energy, hook strength, cinematic direction, and mix balance."
            : "Create a refined alternate take with stronger structure, better hook, cleaner mix, and the same core song identity.";

    return [
      `Project name: ${getProjectNameFallback()}`,
      `Track/release title: ${title.trim() || args.parentVersion.title || "Untitled track"}`,
      `Genre: ${trackGenre}`,
      `Action type: ${args.actionType}`,
      `Parent version: ${args.parentVersion.label} - ${args.parentVersion.title}`,
      `Parent version note: ${args.parentVersion.note}`,
      sourceAudioNote,
      `Branch goal: ${actionInstruction}`,
      args.instruction ? `User/co-producer instruction: ${args.instruction}` : "",
      `Music direction: ${musicDirection}`,
      `Lyrics direction: ${lyricsDirection}`,
      `Artwork direction: ${artworkDirection}`,
      lyricsPreview.trim() ? `Current lyrics:\n${lyricsPreview.trim()}` : "",
      `Vocal mode: ${args.actionType === "instrumental" ? "instrumental" : vocalMode}`,
      `Mixer values: ${summarizeMixer(mixer, dynamics, args.actionType === "instrumental" ? "instrumental" : vocalMode)}`,
      `Detailed mixer state: drums ${mixer.drums}, bass ${mixer.bass}, music ${mixer.music}, vocal ${mixer.vocal}, voiceover ${mixer.voiceover}, fx ${mixer.fx}, master ${mixer.master}, compression ${dynamics.compression}, saturation ${dynamics.saturation}, stereo width ${dynamics.width}, fade out ${dynamics.fadeOut}.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async function createGeneratedVersionBranch({
    actionType,
    instruction,
    parentVersion,
  }: {
    actionType: BranchActionType;
    instruction: string;
    parentVersion: VersionRecord;
  }) {
    const generationIntent = getGenerationIntentForBranchAction(actionType);
    const branchInstruction = buildBranchInstruction({
      actionType,
      instruction,
      parentVersion,
    });
    const durationSeconds = Math.max(
      1,
      Math.floor(parentVersion.duration || (generationMode === "seed" ? 15 : 30))
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "STUDIO PAID EDIT GENERATION START",
        JSON.stringify(
          {
            actionType,
            parentVersionId: isUuid(parentVersion.id) ? parentVersion.id : null,
            trackGroupId: parentVersion.trackGroupId || activeTrackGroupId || null,
            durationSeconds,
          },
          null,
          2
        )
      );
    }

    setWorkspaceStatus(
      "This is prompt-based regeneration. True low-cost stem remix/edit is not connected yet."
    );

    if (actionType === "instrumental") {
      setVocalMode("instrumental");
    }

    await handleGenerate({
      generationIntent,
      branchInstruction,
      branchActionType: actionType,
      parentVersion,
    });
  }

  function requestPaidEditGeneration(args: PendingPaidEditGeneration) {
    setWorkspaceStatus(
      "This is prompt-based regeneration. True low-cost stem remix/edit is not connected yet."
    );
    setPendingPaidEditGeneration(args);
  }

  function cancelPaidEditGeneration() {
    setPendingPaidEditGeneration(null);
  }

  function confirmPaidEditGeneration() {
    const pending = pendingPaidEditGeneration;
    if (!pending) return;

    setPendingPaidEditGeneration(null);
    void createGeneratedVersionBranch(pending);
  }

  function requestPaidGenerationForEditPlan(version: VersionRecord) {
    const actionType = version.actionType || version.createdFrom;
    const normalizedActionType: BranchActionType =
      actionType === "remix" ||
      actionType === "instrumental" ||
      actionType === "co-producer" ||
      actionType === "new-version"
        ? actionType
        : "new-version";
    const parentVersion =
      (version.parentVersionId
        ? versions.find((candidate) => candidate.id === version.parentVersionId)
        : null) || version;

    requestPaidEditGeneration({
      actionType: normalizedActionType,
      instruction:
        version.editInstruction ||
        version.coProducerInstruction ||
        version.directionSummary ||
        version.note ||
        "Generate paid AI version from this edit plan.",
      parentVersion,
    });
  }

  function applyAiAdviceToTrack(advice = latestAiEditAdvice) {
    if (!advice) return;

    if (advice.finalDirection) {
      setMusicDirection(advice.finalDirection);
      setFinalDirection(advice.finalDirection);
    }

    createEditPlanVersion({
      actionType: "co-producer",
      instruction: advice.raw || advice.change || advice.versionNote || "Apply co-producer guidance.",
      parentVersion: activeVersion,
    });
  }

  function getGenerationIntentForAction(action: string): GenerationIntent | null {
    if (action === "Instrumental version") return "instrumental";
    if (action === "Create remix") return "remix";
    if (action === "Create new version") return "new_version";
    return null;
  }

  function canGenerateElevenMusicBranch(version: VersionRecord | null | undefined) {
    return Boolean(
      version?.provider === "eleven_music" &&
        version.audioUrl &&
        version.trackGroupId
    );
  }

  function resolveGenerationSourceVersion(
    selectedActiveVersion: VersionRecord,
    allLoadedVersions = versions,
    currentActiveTrackGroupId = activeTrackGroupId
  ) {
    if (canGenerateElevenMusicBranch(selectedActiveVersion)) {
      return selectedActiveVersion;
    }

    const byId = new Map(allLoadedVersions.map((version) => [version.id, version]));

    if (selectedActiveVersion.status === "edit_plan") {
      const visited = new Set<string>();
      let parentVersionId = selectedActiveVersion.parentVersionId || null;

      while (parentVersionId && !visited.has(parentVersionId)) {
        visited.add(parentVersionId);
        const parentVersion = byId.get(parentVersionId);
        if (!parentVersion) break;
        if (canGenerateElevenMusicBranch(parentVersion)) {
          return parentVersion;
        }
        parentVersionId = parentVersion.parentVersionId || null;
      }
    }

    const targetTrackGroupId = selectedActiveVersion.trackGroupId || currentActiveTrackGroupId;
    if (!targetTrackGroupId) return null;

    return (
      allLoadedVersions
        .filter(
          (version) =>
            version.trackGroupId === targetTrackGroupId &&
            version.provider === "eleven_music" &&
            Boolean(version.audioUrl)
        )
        .sort((a, b) => {
          const byVersionNumber = getVersionNumber(b, 0) - getVersionNumber(a, 0);
          if (byVersionNumber !== 0) return byVersionNumber;

          const bCreated = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
          const aCreated = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
          return bCreated - aCreated;
        })[0] || null
    );
  }

  function buildBranchTitle(parentVersion: VersionRecord, actionType: BranchActionType) {
    const baseTitle = stripBranchTitleSuffixes(
      parentVersion.title?.trim() || title.trim() || "Untitled track"
    );

    if (actionType === "remix") {
      const remixPattern = new RegExp(`^${escapeRegExp(baseTitle)}\\s+-\\s+Remix(?:\\s+(\\d+))?$`, "i");
      const highestRemixNumber = versions.reduce((highest, version) => {
        const match = version.title?.trim().match(remixPattern);
        if (!match) return highest;
        const remixNumber = match[1] ? Number(match[1]) : 1;
        return Number.isFinite(remixNumber) ? Math.max(highest, remixNumber) : highest;
      }, 0);
      const nextRemixNumber = highestRemixNumber + 1;
      return nextRemixNumber <= 1
        ? `${baseTitle} - Remix`
        : `${baseTitle} - Remix ${nextRemixNumber}`;
    }

    const nextVersionNumber =
      Math.max(1, ...versions.map((version, index) => getVersionNumber(version, index))) + 1;
    return `${baseTitle} - Version ${nextVersionNumber}`;
  }

  function restoreVersion(version: VersionRecord, message = "Version restored as active. No files were changed.") {
    setActiveVersionId(version.id);
    if (version.trackGroupId) {
      setActiveTrackGroupId(version.trackGroupId);
    }
    setWorkspaceStatus(message);
  }

  function selectVersion(version: VersionRecord) {
    restoreVersion(version);
  }

  function navigateVersion(version: VersionRecord | null, direction: "previous" | "next") {
    if (!version) return;
    restoreVersion(
      version,
      direction === "previous"
        ? "Previous version restored as active. No files were changed."
        : "Next version restored as active. No files were changed."
    );
  }

  function handleWorkspaceAction(action: string) {
    const selectedActiveVersion =
      versions.find((version) => version.id === activeVersionId) || activeVersion;
    const generationIntent = getGenerationIntentForAction(action);
    if (generationIntent) {
      const actionType: BranchActionType =
        generationIntent === "remix"
          ? "remix"
          : generationIntent === "instrumental"
            ? "instrumental"
            : "new-version";
      const branchInstruction = buildBranchFinalDirection({
        baseDirection: finalDirection.trim() || musicDirection.trim(),
        generationIntent,
        activeVersionLabel: selectedActiveVersion.label,
        durationSeconds:
          typeof selectedActiveVersion.duration === "number"
            ? selectedActiveVersion.duration
            : generationMode === "seed"
              ? 15
              : 30,
      });

      if (
        actionType === "remix" ||
        actionType === "new-version"
      ) {
        const generationSourceVersion = resolveGenerationSourceVersion(selectedActiveVersion);

        if (generationSourceVersion) {
          const sourceBranchInstruction = buildBranchFinalDirection({
            baseDirection: finalDirection.trim() || musicDirection.trim(),
            generationIntent,
            activeVersionLabel: generationSourceVersion.label,
            durationSeconds:
              typeof generationSourceVersion.duration === "number"
                ? generationSourceVersion.duration
                : generationMode === "seed"
                  ? 15
                  : 30,
          });

          void generateSingingVersion({
            actionKey: actionType === "remix" ? "createRemix" : "createNewVersion",
            generationMode: actionType === "remix" ? "remix" : "new_version",
            parentVersion: generationSourceVersion,
            promptOverride: buildBranchInstruction({
              actionType,
              instruction: sourceBranchInstruction,
              parentVersion: generationSourceVersion,
            }),
            titleOverride: buildBranchTitle(generationSourceVersion, actionType),
            generatingMessage:
              actionType === "remix" ? "Generating remix..." : "Generating new version...",
            uploadingMessage:
              actionType === "remix" ? "Uploading remix..." : "Uploading new version...",
            readyMessage:
              actionType === "remix" ? "Remix version ready ✓" : "New version ready ✓",
          });
          return;
        }
      }

      setWorkspaceStatus(getBranchWorkspaceStatus(generationIntent, selectedActiveVersion.label));
      createEditPlanVersion({
        actionType,
        instruction: branchInstruction,
        parentVersion: selectedActiveVersion,
      });
      return;
    }

    if (isExportAction(action)) {
      const hasPlayableVersion = Boolean(selectedActiveVersion?.audioUrl);
      const isSoundioXSubmitReady = Boolean(
        selectedActiveVersion?.audioUrl &&
          selectedActiveVersion.title?.trim() &&
          selectedActiveVersion.vocalMode
      );

      if (
        (action === "Submit to SoundioX" && !isSoundioXSubmitReady) ||
        (action !== "Submit to SoundioX" && !hasPlayableVersion)
      ) {
        setWorkspaceStatus("Create or select a generated version first.");
        return;
      }

      if (action === "Submit to SoundioX") {
        setPublishDraft(buildPublishDraftFromVersion(selectedActiveVersion));
        setPublishedTrackId(null);
        setShowPublishModal(true);
        return;
      }

      setSelectedExportAction(action);
      setWorkspaceStatus(getExportWorkspaceStatus(action, selectedActiveVersion.label));
      return;
    }

    setWorkspaceStatus(`${action} prepared as a mock studio step. A new branch can be created without overwriting the original.`);
    createVersion(action, "generated");
  }

  async function saveArtworkConceptForActiveVersion(concept: ArtworkConcept) {
    if (!isUuid(activeVersion.id) || !activeVersion.trackGroupId) {
      return false;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Log in to save this artwork concept.");
    }

    const response = await fetch("/api/studio/versions/artwork-concept", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trackVersionId: activeVersion.id,
        trackGroupId: activeVersion.trackGroupId,
        artworkConcept: concept,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractApiError(payload, "Artwork concept save failed"));
    }

    return true;
  }

  async function createArtworkConcept() {
    setArtworkConceptLoading(true);
    setActionFeedback("artworkConcept", "working", 0);
    setWorkspaceStatus("Creating artwork concept...");

    try {
      const response = await fetch("/api/studio/artwork-concept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName: getProjectNameFallback(),
          title: activeVersion.title || title,
          genre: trackGenre,
          artworkDirection,
          musicDirection,
          lyricsDirection,
          mixerSummary,
          currentArtworkConcept: getActiveArtworkConcept()?.concept || "",
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Artwork concept generation failed"));
      }

      const concept: ArtworkConcept = {
        concept: typeof payload?.concept === "string" ? payload.concept.trim() : "",
        imagePrompt: typeof payload?.imagePrompt === "string" ? payload.imagePrompt.trim() : "",
        palette: typeof payload?.palette === "string" ? payload.palette.trim() : "",
        styleTags: Array.isArray(payload?.styleTags)
          ? payload.styleTags
              .map((tag: unknown) => String(tag || "").trim())
              .filter(Boolean)
          : [],
        summary: typeof payload?.summary === "string" ? payload.summary.trim() : "",
      };

      if (!concept.concept || !concept.imagePrompt || !concept.palette || !concept.summary) {
        throw new Error("Artwork concept response was incomplete.");
      }

      applyArtworkConceptToActiveVersion(concept);
      setArtworkDirectionConcept(concept);
      setArtworkDirection(concept.imagePrompt);
      const saved = await saveArtworkConceptForActiveVersion(concept);
      setWorkspaceStatus(
        saved
          ? `Artwork concept saved for ${activeVersion.label}: ${concept.summary}`
          : `Artwork concept ready for ${activeVersion.label}: ${concept.summary}`
      );
      setActionFeedback("artworkConcept", "success");
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Artwork concept generation failed.");
      setActionFeedback("artworkConcept", "error");
    } finally {
      setArtworkConceptLoading(false);
    }
  }

  async function generateCoverImage() {
    const artworkConcept = getActiveArtworkConcept();
    const imagePrompt = artworkConcept?.imagePrompt?.trim() || "";

    if (!imagePrompt) {
      setWorkspaceStatus("Create an artwork concept before generating a cover image.");
      return;
    }

    setArtworkImageLoading(true);
    setActionFeedback("coverImage", "working", 0);
    setWorkspaceStatus("Generating cover image...");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to generate a cover image.");
      }

      const response = await fetch("/api/studio/artwork-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: activeVersion.id,
          trackGroupId: activeVersion.trackGroupId || activeTrackGroupId,
          imagePrompt,
          artworkConcept,
          title: activeVersion.title || title,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Cover image generation failed"));
      }

      const artworkUrl = typeof payload?.artworkUrl === "string" ? payload.artworkUrl.trim() : "";
      if (!artworkUrl) {
        throw new Error("Cover image response was missing artwork.");
      }

      setVersions((current) =>
        current.map((version) =>
          version.id === activeVersion.id
            ? {
                ...version,
                artworkUrl,
                artworkConcept,
                note: version.note.includes("Cover image:")
                  ? version.note
                  : `${version.note} Cover image: generated from Studio artwork concept.`,
              }
            : version
        )
      );

      const warning = typeof payload?.warning === "string" ? payload.warning.trim() : "";
      setWorkspaceStatus(
        warning
          ? `Cover image generated for ${activeVersion.title || title}. ${warning}`
          : `Cover image generated for ${activeVersion.title || title}.`
      );
      setActionFeedback("coverImage", "success");
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Cover image generation failed.");
      setActionFeedback("coverImage", "error");
    } finally {
      setArtworkImageLoading(false);
    }
  }

  async function generateVocalLayer() {
    const selectedVocalMode = normalizeVocalMode(vocalMode) || normalizeVocalMode(activeVersion.vocalMode);
    const hasLyrics = Boolean(lyricsPreview.trim());
    setActionFeedback("voiceoverLayer", "working", 0);
    setWorkspaceStatus("Generating voiceover layer...");
    setVoiceoverLayerStatus("generating");
    setVoiceoverLayerMessage("Requesting spoken voiceover from ElevenLabs...");

    if (!activeVersion.id || activeVersion.id === "new-project" || !activeVersion.audioUrl) {
      const message = "Create or select a generated version first.";
      setWorkspaceStatus(message);
      setVoiceoverLayerStatus("error");
      setVoiceoverLayerMessage(message);
      setActionFeedback("voiceoverLayer", "error");
      return;
    }

    if (!hasLyrics) {
      const message = "Add or generate lyrics before creating a voiceover layer.";
      setWorkspaceStatus(message);
      setVoiceoverLayerStatus("error");
      setVoiceoverLayerMessage(message);
      setActionFeedback("voiceoverLayer", "error");
      return;
    }

    if (selectedVocalMode !== "male" && selectedVocalMode !== "female") {
      const message = "Real voiceover layer currently supports male or female voice only.";
      setWorkspaceStatus(message);
      setVoiceoverLayerStatus("error");
      setVoiceoverLayerMessage(message);
      setActionFeedback("voiceoverLayer", "error");
      return;
    }

    setVocalLayerLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to generate a voiceover layer.");
      }

      const response = await fetch("/api/studio/vocals", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: activeVersion.id,
          trackGroupId: activeVersion.trackGroupId || activeTrackGroupId,
          audioUrl: activeVersion.audioUrl,
          lyrics: lyricsPreview,
          vocalMode: selectedVocalMode,
          title: activeVersion.title || title,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Voiceover layer generation failed"));
      }

      const vocalUrl =
        typeof payload?.voiceoverUrl === "string"
          ? payload.voiceoverUrl.trim()
          : typeof payload?.vocalUrl === "string"
            ? payload.vocalUrl.trim()
            : "";
      if (!vocalUrl) {
        throw new Error("Voiceover layer response was missing audio.");
      }

      const voiceoverVersion = payload?.version
        ? mapTrackVersion(payload.version as TrackVersionApiRecord)
        : null;

      if (voiceoverVersion?.id) {
        setVersions((current) => [
          {
            ...voiceoverVersion,
            vocalUrl,
            voiceoverUrl: vocalUrl,
            note: voiceoverVersion.note.includes("Voiceover layer:")
              ? voiceoverVersion.note
              : `${voiceoverVersion.note} Voiceover layer: generated separately with ElevenLabs. Singing vocals use the Eleven Music generator.`,
          },
          ...current.filter((version) => version.id !== voiceoverVersion.id),
        ]);
        setActiveVersionId(voiceoverVersion.id);
        setActiveTrackGroupId(voiceoverVersion.trackGroupId || activeTrackGroupId);
      } else {
        setVersions((current) =>
          current.map((version) =>
            version.id === activeVersion.id
              ? {
                  ...version,
                  vocalUrl,
                  voiceoverUrl: vocalUrl,
                  note: version.note.includes("Voiceover layer:")
                    ? version.note
                    : `${version.note} Voiceover layer: generated separately with ElevenLabs. Singing vocals use the Eleven Music generator.`,
                }
              : version
          )
        );
      }
      setVoiceoverLayerStatus("generated");
      setVoiceoverLayerMessage(
        voiceoverVersion?.id
          ? "Voiceover layer generated and attached to a new version."
          : "Voiceover layer generated and attached to this version."
      );
      setWorkspaceStatus(
        voiceoverVersion?.id
          ? `Voiceover version created for ${activeVersion.title || title}.`
          : `Voiceover layer generated for ${activeVersion.title || title}.`
      );
      setActionFeedback("voiceoverLayer", "success");
    } catch (error: any) {
      const message = error?.message || "Voiceover layer generation failed.";
      setVoiceoverLayerStatus("error");
      setVoiceoverLayerMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback("voiceoverLayer", "error");
    } finally {
      setVocalLayerLoading(false);
    }
  }

  async function generateSingingVersion(options?: {
    actionKey?: ActionKey;
    generationMode?: "singing" | "remix" | "new_version";
    parentVersion?: VersionRecord;
    promptOverride?: string;
    titleOverride?: string;
    durationSeconds?: number;
    requireVocalMode?: boolean;
    generatingMessage?: string;
    uploadingMessage?: string;
    readyMessage?: string;
  }) {
    const actionKey = options?.actionKey || "generateSingingVersion";
    const parentVersion = options?.parentVersion || activeVersion;
    const trimmedTitle =
      options?.titleOverride?.trim() || title.trim() || parentVersion.title?.trim() || "";
    const projectName = getProjectNameFallback(parentVersion.title?.trim() || title.trim() || trimmedTitle);
    const stylePrompt = appendLanguageInstruction(
      options?.promptOverride?.trim() || finalDirection.trim() || musicDirection.trim() || idea.trim()
    );
    const rawLyrics = lyricsPreview.trim();
    const lyrics = appendLanguageInstruction(rawLyrics);
    const artworkConceptForGeneration = getArtworkConceptForGeneration(parentVersion);
    const generatingMessage = options?.generatingMessage || "Generating singing version...";
    const uploadingMessage = options?.uploadingMessage || "Uploading singing version...";
    const readyMessage = options?.readyMessage || "Singing version ready ✓";

    if (!trimmedTitle) {
      const message = "Failed: Add a track title first.";
      setSingingVersionMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback(actionKey, "error");
      return;
    }

    if (!stylePrompt) {
      const message = "Failed: Add a prompt or final direction first.";
      setSingingVersionMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback(actionKey, "error");
      return;
    }

    if (!rawLyrics) {
      const message = "Failed: Add or generate lyrics first.";
      setSingingVersionMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback(actionKey, "error");
      return;
    }

    if (options?.requireVocalMode && vocalMode === "instrumental") {
      const message = "Failed: Choose a vocal mode before generating a full song.";
      setSingingVersionMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback(actionKey, "error");
      return;
    }

    setSingingVersionLoading(true);
    setSingingVersionMessage(generatingMessage);
    setWorkspaceStatus(generatingMessage);
    setActionFeedback(actionKey, "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to generate a singing version.");
      }

      const durationSeconds =
        typeof options?.durationSeconds === "number" && Number.isFinite(options.durationSeconds)
          ? options.durationSeconds
          : typeof parentVersion.duration === "number" && Number.isFinite(parentVersion.duration)
          ? parentVersion.duration
          : generationMode === "seed"
            ? 15
            : 30;

      const response = await fetch("/api/studio/eleven-music", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: trimmedTitle,
          projectName,
          genre: trackGenre,
          prompt: stylePrompt,
          vocalMode,
          lyrics,
          durationSeconds,
          generationMode: options?.generationMode || "singing",
          trackGroupId: parentVersion.trackGroupId || activeTrackGroupId || null,
          parentVersionId: isUuid(parentVersion.id) ? parentVersion.id : null,
          artworkUrl: parentVersion.artworkUrl || null,
          artworkConcept: artworkConceptForGeneration,
        }),
      });
      setSingingVersionMessage(uploadingMessage);
      setWorkspaceStatus(uploadingMessage);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Singing version generation failed"));
      }

      const singingVersion = payload?.version
        ? mapTrackVersion(payload.version as TrackVersionApiRecord)
        : null;

      if (!singingVersion?.id || !singingVersion.audioUrl) {
        throw new Error("Singing version response was missing version audio.");
      }

      setVersions((current) => [
        singingVersion,
        ...current.filter((version) => version.id !== singingVersion.id),
      ]);
      setActiveVersionId(singingVersion.id);
      setActiveTrackGroupId(singingVersion.trackGroupId || activeTrackGroupId);
      setStudioProjectNames((current) =>
        singingVersion.trackGroupId
          ? {
              ...current,
              [singingVersion.trackGroupId]: projectName,
            }
          : current
      );
      setGenerateError(null);
      setGenerateStatus(readyMessage);
      setStudioPhase("complete");
      setStepState({
        track: false,
        vocals: false,
        artwork: false,
      });
      setSingingVersionMessage(readyMessage);
      setWorkspaceStatus(readyMessage);
      setActionFeedback(actionKey, "success");
      await loadStudioDrafts();
    } catch (error: any) {
      const message = `Failed: ${error?.message || "Singing version generation failed."}`;
      setSingingVersionMessage(message);
      setWorkspaceStatus(message);
      setGenerateError(message);
      setActionFeedback(actionKey, "error");
    } finally {
      setSingingVersionLoading(false);
    }
  }

  async function importTrackIntoStudio() {
    const fileTitle = importFile ? stripAudioExtension(importFile.name) : "";
    const resolvedTitle = uploadedTrackName.trim() || fileTitle;

    if (!importFile) {
      const message = "Choose an MP3, WAV, FLAC, or M4A file to import.";
      setImportStatus("error");
      setImportMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback("importTrack", "error");
      return;
    }

    if (!resolvedTitle) {
      const message = "Add an imported track title or choose a named audio file before importing.";
      setImportStatus("error");
      setImportMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback("importTrack", "error");
      return;
    }

    setImportStatus("uploading");
    setImportMessage("Uploading...");
    setWorkspaceStatus("Importing track into Studio...");
    setActionFeedback("importTrack", "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to import a track into Studio.");
      }

      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("title", resolvedTitle);
      formData.append("notes", uploadedTrackNotes.trim());
      formData.append("projectName", resolvedTitle);
      formData.append("genre", trackGenre);
      formData.append("artist", artistIdentity.trim() || "SoundioX Artist");

      const response = await fetch("/api/studio/import-track", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Studio import failed"));
      }

      const trackGroupId =
        typeof payload?.trackGroupId === "string" ? payload.trackGroupId.trim() : "";
      const trackVersionId =
        typeof payload?.trackVersionId === "string" ? payload.trackVersionId.trim() : "";
      const audioUrl = typeof payload?.audioUrl === "string" ? payload.audioUrl.trim() : "";

      if (!trackGroupId || !trackVersionId || !audioUrl) {
        throw new Error("Studio import response was missing version details.");
      }

      const importedVersion: VersionRecord = {
        id: trackVersionId,
        label: "Original",
        title: resolvedTitle,
        note: "Imported track ready for Studio editing. Stem extraction and low-cost audio editing will connect in future updates.",
        source: "imported",
        mixer: { ...initialMixer },
        dynamics: { ...initialDynamics },
        audioUrl,
        artworkUrl: null,
        artworkConcept: null,
        vocalUrl: null,
        voiceoverUrl: null,
        trackGroupId,
        parentVersionId: null,
        versionNumber: 1,
        generationIntent: null,
        isOriginal: true,
        provider: "studio-import",
        vocalMode: vocalMode || null,
        duration: null,
        createdAt:
          typeof payload?.version?.createdAt === "string"
            ? payload.version.createdAt
            : new Date().toISOString(),
        createdFrom: "import",
        importedSource: "user_upload",
      };

      setTitle(resolvedTitle);
      setProjectName(resolvedTitle);
      projectNameTouchedRef.current = false;
      setProjectNameTouched(false);
      setProjectNameUnsaved(false);
      setVersions([importedVersion]);
      setActiveVersionId(importedVersion.id);
      setActiveTrackGroupId(trackGroupId);
      setImportStatus("imported");
      setImportMessage(`Imported: ${resolvedTitle}`);
      setWorkspaceStatus(
        `Imported: ${resolvedTitle}. Imported track ready for Studio editing. Stem extraction and low-cost audio editing will connect in future updates.`
      );
      setActionFeedback("importTrack", "success");
      await loadStudioDrafts();
    } catch (error: any) {
      const message = error?.message || "Studio import failed.";
      setImportStatus("error");
      setImportMessage(message);
      setWorkspaceStatus(message);
      setActionFeedback("importTrack", "error");
    }
  }

  async function prepareStemsForActiveVersion() {
    if (!activeVersion?.id || !activeVersion.audioUrl) {
      const message = "Select a Studio version with audio before preparing stems.";
      setStemPrepareError({
        httpStatus: null,
        message,
        trackVersionId: activeVersion?.id || "missing",
        trackGroupId: activePrepareTrackGroupId || "missing",
        hasAudioUrl: Boolean(activeVersion?.audioUrl),
      });
      setWorkspaceStatus(message);
      setActionFeedback("prepareStems", "error");
      return;
    }

    if (!activeVersionIsPersisted || !activePrepareTrackGroupId) {
      const message = "Save/open a persisted Studio version before preparing stems.";
      setStemPrepareError({
        httpStatus: null,
        message,
        trackVersionId: activeVersion.id,
        trackGroupId: activePrepareTrackGroupId || "missing",
        hasAudioUrl: Boolean(activeVersion.audioUrl),
      });
      setWorkspaceStatus(message);
      setActionFeedback("prepareStems", "error");
      return;
    }

    setStemPrepareError(null);
    setWorkspaceStatus("Preparing stems...");
    setActionFeedback("prepareStems", "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to prepare stems.");
      }

      const response = await fetch("/api/studio/stems/prepare", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: activeVersion.id,
          trackGroupId: activePrepareTrackGroupId,
          audioUrl: activeVersion.audioUrl,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = extractApiError(payload, "Stem preparation failed");
        setStemPrepareError({
          httpStatus: response.status,
          message,
          trackVersionId: activeVersion.id,
          trackGroupId: activePrepareTrackGroupId,
          hasAudioUrl: Boolean(activeVersion.audioUrl),
          rawApiResponse: payload,
        });
        throw new Error(message);
      }

      const stemsStatus = normalizeStemStatus(payload?.stemsStatus || "queued");
      setVersions((current) =>
        current.map((version) =>
          version.id === activeVersion.id
            ? {
                ...version,
                stemsStatus,
                stemsRequestedAt:
                  typeof payload?.stemsRequestedAt === "string"
                    ? payload.stemsRequestedAt
                    : new Date().toISOString(),
                stemsError: null,
              }
            : version
        )
      );
      setWorkspaceStatus(
        "Stem preparation queued. Low-cost audio editing will become available after the stem engine is connected."
      );
      setStemPrepareError(null);
      setActionFeedback("prepareStems", "success");
    } catch (error: any) {
      const message = error?.message || "Stem preparation failed.";
      setStemPrepareError((current) =>
        current || {
          httpStatus: null,
          message,
          trackVersionId: activeVersion.id,
          trackGroupId: activePrepareTrackGroupId || "missing",
          hasAudioUrl: Boolean(activeVersion.audioUrl),
        }
      );
      setVersions((current) =>
        current.map((version) =>
          version.id === activeVersion.id
            ? { ...version, stemsStatus: "error", stemsError: message }
            : version
        )
      );
      setWorkspaceStatus(message);
      setActionFeedback("prepareStems", "error");
    }
  }

  async function saveLocalDraftAsStudioVersion() {
    if (!activeVersion?.id || !activeVersion.audioUrl) {
      const message = "Select a local Studio draft with audio before saving.";
      setWorkspaceStatus(message);
      setActionFeedback("saveStudioVersion", "error");
      return;
    }

    setWorkspaceStatus("Saving Studio version...");
    setActionFeedback("saveStudioVersion", "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to save this Studio version.");
      }

      const response = await fetch("/api/studio/versions/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: activeVersion.title || title,
          projectName: getProjectNameFallback(),
          genre: trackGenre,
          audioUrl: activeVersion.audioUrl,
          artworkUrl: activeVersion.artworkUrl || null,
          artworkConcept: activeVersion.artworkConcept || null,
          duration: activeVersion.duration ?? null,
          createdFrom: activeVersion.createdFrom || "draft",
          generationMode: activeVersion.createdFrom === "import" ? "import" : "studio_draft",
          importedSource: activeVersion.importedSource || null,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Failed to save Studio version"));
      }

      const persistedVersion = payload?.version
        ? mapTrackVersion(payload.version as TrackVersionApiRecord)
        : null;

      if (!persistedVersion?.id || !persistedVersion.trackGroupId) {
        throw new Error("Saved Studio version response was missing version details.");
      }

      setVersions((current) => [
        persistedVersion,
        ...current.filter((version) => version.id !== activeVersion.id && version.id !== persistedVersion.id),
      ]);
      setActiveVersionId(persistedVersion.id);
      setActiveTrackGroupId(persistedVersion.trackGroupId);
      setStudioProjectNames((current) => ({
        ...current,
        [persistedVersion.trackGroupId as string]: getProjectNameFallback(),
      }));
      setStemPrepareError(null);
      setWorkspaceStatus("Studio version saved. You can prepare stems now.");
      setActionFeedback("saveStudioVersion", "success");
      await loadStudioDrafts();
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Failed to save Studio version.");
      setActionFeedback("saveStudioVersion", "error");
    }
  }

  async function renderMixForActiveVersion() {
    if (activeStemStatus !== "ready") {
      const message = "Prepare stems before rendering a mix.";
      setWorkspaceStatus(message);
      setActionFeedback("renderMix", "error");
      return;
    }

    if (!activeVersion?.id || !activeVersion.trackGroupId || !activeVersion.audioUrl) {
      const message = "Select a stem-ready Studio version before rendering a mix.";
      setWorkspaceStatus(message);
      setActionFeedback("renderMix", "error");
      return;
    }

    setWorkspaceStatus("Rendering mix...");
    setActionFeedback("renderMix", "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to render a Studio mix.");
      }

      const response = await fetch("/api/studio/mixer/render", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: activeVersion.id,
          trackGroupId: activeVersion.trackGroupId,
          title: activeVersion.title || title,
          mixer,
          coproducerPreset: activeCoProducerPreset,
          stem_drums_url: activeVersion.stemDrumsUrl,
          stem_bass_url: activeVersion.stemBassUrl,
          stem_vocals_url: activeVersion.stemVocalsUrl,
          stem_other_url: activeVersion.stemOtherUrl,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Mix render failed"));
      }

      const nextVersion = payload?.version
        ? mapTrackVersion(payload.version as TrackVersionApiRecord)
        : null;

      if (!nextVersion?.id || !nextVersion.audioUrl) {
        throw new Error("Mix render response was missing the new version.");
      }

      setVersions((current) => [nextVersion, ...current.filter((version) => version.id !== nextVersion.id)]);
      setActiveVersionId(nextVersion.id);
      setActiveTrackGroupId(nextVersion.trackGroupId || activeVersion.trackGroupId || null);
      const mixEditLabel =
        nextVersion.label || `Mix Edit ${nextVersion.versionNumber || payload?.version?.version_number || ""}`;
      const isLoopEdit = mixEditLabel.toLowerCase().startsWith("loop edit");
      const isExtendEdit = mixEditLabel.toLowerCase().startsWith("extend edit");
      const successMessage = isLoopEdit
        ? "Loop Edit created."
        : isExtendEdit
          ? "Extend Edit created."
          : `${mixEditLabel} created.`;
      setWorkspaceStatus(
        hasMockStemsMetadata(nextVersion.stemsMetadata)
          ? `${successMessage} This mix used mock stems, so audio may not sound meaningfully different yet.`
          : successMessage
      );
      setActionFeedback("renderMix", "success");
    } catch (error: any) {
      const message = error?.message || "Mix render failed.";
      setWorkspaceStatus(message);
      setActionFeedback("renderMix", "error");
    }
  }

  async function previewRenderForActiveVersion() {
    if (previewMode === "off") {
      const message = "Choose 10s or 20s Preview first.";
      setWorkspaceStatus(message);
      setActionFeedback("previewRender", "error");
      return;
    }

    if (activeStemStatus !== "ready") {
      const message = "Prepare stems before rendering a preview.";
      setWorkspaceStatus(message);
      setActionFeedback("previewRender", "error");
      return;
    }

    if (!activeVersion?.id || !activeVersion.trackGroupId || !activeVersion.audioUrl) {
      const message = "Select a stem-ready Studio version before preview rendering.";
      setWorkspaceStatus(message);
      setActionFeedback("previewRender", "error");
      return;
    }

    setWorkspaceStatus("Rendering preview...");
    setPreviewRenderUrl(null);
    setActionFeedback("previewRender", "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to render a Studio preview.");
      }

      const response = await fetch("/api/studio/mixer/render", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: activeVersion.id,
          trackGroupId: activeVersion.trackGroupId,
          title: activeVersion.title || title,
          mixer,
          preview: true,
          previewSeconds: Number(previewMode),
          coproducerPreset: activeCoProducerPreset,
          stem_drums_url: activeVersion.stemDrumsUrl,
          stem_bass_url: activeVersion.stemBassUrl,
          stem_vocals_url: activeVersion.stemVocalsUrl,
          stem_other_url: activeVersion.stemOtherUrl,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Preview render failed"));
      }

      if (!payload?.previewUrl) {
        throw new Error("Preview render response was missing audio.");
      }

      setPreviewRenderUrl(payload.previewUrl);
      setWorkspaceStatus("Preview ready");
      setActionFeedback("previewRender", "success");
    } catch (error: any) {
      const message = error?.message || "Preview render failed.";
      setWorkspaceStatus(message);
      setActionFeedback("previewRender", "error");
    }
  }

  async function toggleVoiceoverMixPlayback() {
    const music = musicMixRef.current;
    const voiceover = voiceoverMixRef.current;

    const voiceoverUrl = activeVersion.voiceoverUrl || activeVersion.vocalUrl;
    if (!music || !voiceover || !activeVersion.audioUrl || !voiceoverUrl) return;

    if (voiceoverMixPlaying) {
      music.pause();
      voiceover.pause();
      setVoiceoverMixPlaying(false);
      return;
    }

    music.pause();
    voiceover.pause();
    music.currentTime = 0;
    voiceover.currentTime = 0;
    music.volume = musicPreviewVolume;
    voiceover.volume = voiceoverPreviewVolume;

    try {
      await Promise.all([music.play(), voiceover.play()]);
      setVoiceoverMixPlaying(true);
    } catch (error: any) {
      setVoiceoverMixPlaying(false);
      setWorkspaceStatus(error?.message || "Could not start voiceover mix preview.");
    }
  }

  function downloadActiveVersion() {
    if (!activeVersion.audioUrl) {
      setWorkspaceStatus("Select a version with audio before downloading.");
      setActionFeedback("downloadVersion", "error");
      return;
    }

    setActionFeedback("downloadVersion", "working", 0);

    const link = document.createElement("a");
    link.href = activeVersion.audioUrl;
    link.download = getAudioDownloadFilename(activeVersion.audioUrl, activeVersion.title || title);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setWorkspaceStatus("Download started");
    setActionFeedback("downloadVersion", "success");
  }

  async function exportActiveVersionStems() {
    if (activeStemStatus !== "ready") {
      setWorkspaceStatus("Prepare stems before exporting stems.");
      setActionFeedback("exportStems", "error");
      return;
    }

    const missingStem = !activeVersion.stemDrumsUrl ||
      !activeVersion.stemBassUrl ||
      !activeVersion.stemVocalsUrl ||
      !activeVersion.stemOtherUrl;
    if (missingStem) {
      setWorkspaceStatus("Stem export needs drums, bass, vocals, and other stems.");
      setActionFeedback("exportStems", "error");
      return;
    }

    setWorkspaceStatus("Preparing stems export...");
    setActionFeedback("exportStems", "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to export stems.");
      }

      const response = await fetch("/api/studio/stems/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: activeVersion.title || title,
          stems: {
            drums: activeVersion.stemDrumsUrl,
            bass: activeVersion.stemBassUrl,
            vocals: activeVersion.stemVocalsUrl,
            other: activeVersion.stemOtherUrl,
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(extractApiError(payload, "Stem export failed"));
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${sanitizeDownloadName(activeVersion.title || title || "studio-version")}-stems.zip`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      setWorkspaceStatus("Download started");
      setActionFeedback("exportStems", "success");
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Stem export failed.");
      setActionFeedback("exportStems", "error");
    }
  }

  function preparePublishDraft() {
    setShowPublishModal(false);
    setSelectedExportAction("Submit to SoundioX");
    setWorkspaceStatus(`Publish draft prepared for ${publishDraft.title || "Untitled track"}.`);
  }

  async function saveSoundioXDraft() {
    if (!activeVersion.id || !activeVersion.trackGroupId) {
      setWorkspaceStatus("Create or select a generated version first.");
      return;
    }

    console.log(
      "SUBMIT TO SOUNDIOX ACTIVE VERSION",
      JSON.stringify(
        {
          id: activeVersion.id,
          title: activeVersion.title,
          trackGroupId: activeVersion.trackGroupId,
          hasAudioUrl: Boolean(activeVersion.audioUrl),
          hasArtworkUrl: Boolean(activeVersion.artworkUrl),
          hasArtworkConcept: Boolean(activeVersion.artworkConcept),
          provider: activeVersion.provider || null,
        },
        null,
        2
      )
    );

    setPublishSaving(true);
    setActionFeedback("submitSoundioX", "working", 0);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to save a SoundioX draft.");
      }

      const response = await fetch("/api/studio/publish-track", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: activeVersion.id,
          trackGroupId: activeVersion.trackGroupId,
          title: publishDraft.title,
          artist: publishDraft.artistName,
          genre: publishDraft.genre,
          visibility: publishDraft.visibility.toLowerCase(),
          versionNote: activeVersion.note,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Failed to save SoundioX draft"));
      }

      const trackId = typeof payload?.trackId === "string" ? payload.trackId : null;
      setPublishedTrackId(trackId);
      setShowPublishModal(false);
      setSelectedExportAction("Submit to SoundioX");
      setWorkspaceStatus(
        `SoundioX draft saved for ${publishDraft.title || "Untitled track"}.${
          trackId ? ` Track id: ${trackId}.` : ""
        }`
      );
      setActionFeedback("submitSoundioX", "success");
      await loadStudioDrafts();
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Failed to save SoundioX draft.");
      setActionFeedback("submitSoundioX", "error");
    } finally {
      setPublishSaving(false);
    }
  }

  async function previewStudioDraft(draft: StudioDraftTrack) {
    setWorkspaceStatus(`Draft preview selected: ${draft.title || "Untitled draft"}.`);

    console.log("OPEN PROJECT SOURCE MODE", {
      source_track_group_id: draft.source_track_group_id,
      source_track_version_id: draft.source_track_version_id,
      draftId: draft.id,
    });

    if (draft.source_track_group_id) {
      const draftVersion: VersionRecord = {
        id: `studio-draft-${draft.id}`,
        label: "Draft",
        title: draft.title || "Untitled draft",
        note: `SoundioX draft from tracks table. ${draft.genre || "No genre"} • Draft status.`,
        source: "generated",
        mixer: { ...initialMixer },
        dynamics: { ...initialDynamics },
        audioUrl: draft.audio_url,
        artworkUrl: draft.artwork_url,
        provider: "soundiox",
        vocalMode: activeVersion.vocalMode || vocalMode,
        duration: null,
        createdAt: draft.created_at,
      };
      const restored = await loadTrackVersions(
        draft.source_track_group_id,
        draftVersion,
        draft.source_track_version_id
      );

      if (restored) {
        setWorkspaceStatus(`Preview selected from Studio version history: ${draft.title || "Untitled draft"}.`);
        return;
      }
    }

    if (!draft.audio_url) return;

    const draftVersion: VersionRecord = {
      id: `studio-draft-${draft.id}`,
      label: "Draft",
      title: draft.title || "Untitled draft",
      note: `SoundioX draft from tracks table. ${draft.genre || "No genre"} • Draft status.`,
      source: "generated",
      mixer: { ...initialMixer },
      dynamics: { ...initialDynamics },
      audioUrl: draft.audio_url,
      artworkUrl: draft.artwork_url,
      provider: "soundiox",
      vocalMode: activeVersion.vocalMode || vocalMode,
      duration: null,
      createdAt: draft.created_at,
    };

    setVersions((current) => {
      const withoutDraft = current.filter((version) => version.id !== draftVersion.id);
      return [draftVersion, ...withoutDraft];
    });
    setActiveVersionId(draftVersion.id);
  }

  async function saveStudioProjectName() {
    const trimmedProjectName = projectName.trim();

    if (!trimmedProjectName) {
      setWorkspaceStatus("Project name is required.");
      return;
    }

    setProjectNameSaving(true);
    setActionFeedback("saveProject", "working", 0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to save this Studio project.");
      }

      const trackGroupId = getCurrentTrackGroupId();
      const response = await fetch("/api/studio/projects/upsert", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackGroupId,
          projectName: trimmedProjectName,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Failed to save Studio project"));
      }

      const savedTrackGroupId =
        typeof payload?.project?.trackGroupId === "string" ? payload.project.trackGroupId : trackGroupId;
      if (savedTrackGroupId) {
        setStudioProjectNames((current) => ({
          ...current,
          [savedTrackGroupId]: trimmedProjectName,
        }));
      }

      setProjectNameUnsaved(false);
      setWorkspaceStatus(`Studio project saved: ${trimmedProjectName}.`);
      setActionFeedback("saveProject", "success");
      await loadStudioDrafts();
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Failed to save Studio project.");
      setActionFeedback("saveProject", "error");
    } finally {
      setProjectNameSaving(false);
    }
  }

  async function deletePendingStudioProject() {
    if (!pendingDeleteStudioProject?.trackGroupId) return;

    setStudioProjectDeleting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to delete this Studio project.");
      }

      const response = await fetch("/api/studio/projects/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackGroupId: pendingDeleteStudioProject.trackGroupId,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Failed to delete Studio project"));
      }

      setStudioProjectNames((current) => {
        const next = { ...current };
        delete next[pendingDeleteStudioProject.trackGroupId];
        return next;
      });
      setPendingDeleteStudioProject(null);
      setWorkspaceStatus("Studio project deleted.");
      await loadStudioDrafts();
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Failed to delete Studio project.");
    } finally {
      setStudioProjectDeleting(false);
    }
  }

  async function openStudioProjectDraft(draft: StudioDraftTrack) {
    const draftTitle = draft.title || "Untitled draft";
    console.log("OPEN PROJECT SOURCE MODE", {
      source_track_group_id: draft.source_track_group_id,
      source_track_version_id: draft.source_track_version_id,
      draftId: draft.id,
    });
    const savedProjectName = draft.source_track_group_id
      ? studioProjectNames[draft.source_track_group_id] ||
        (await fetchSavedStudioProjectName(draft.source_track_group_id))
      : null;
    const restoredProjectNameSource = savedProjectName
      ? "db-project-name"
      : projectNameTouchedRef.current
        ? "local-manual-project-name"
        : "title-fallback";
    const restoredProjectName = savedProjectName || (projectNameTouchedRef.current ? projectName : draftTitle);
    if (draft.source_track_group_id && savedProjectName) {
      setStudioProjectNames((current) => ({
        ...current,
        [draft.source_track_group_id as string]: savedProjectName,
      }));
    }
    const draftVersion: VersionRecord = {
      id: `draft-${draft.id}`,
      label: "Draft",
      title: draftTitle,
      note: `Opened SoundioX draft project. ${draft.genre || "No genre"} • Draft status.`,
      source: "generated",
      mixer: { ...initialMixer },
      dynamics: { ...initialDynamics },
      audioUrl: draft.audio_url,
      artworkUrl: draft.artwork_url,
      provider: "soundiox-draft",
      vocalMode: activeVersion.vocalMode || vocalMode,
      duration: null,
      createdAt: draft.created_at,
    };

    setTitle(draftTitle);
    setProjectName(restoredProjectName);
    projectNameTouchedRef.current = restoredProjectNameSource !== "title-fallback";
    setProjectNameTouched(restoredProjectNameSource !== "title-fallback");
    setProjectNameUnsaved(false);
    if (draft.artist) {
      setArtistIdentity(draft.artist);
    }
    if (draft.genre) {
      setTrackGenre(draft.genre);
    }

    if (draft.source_track_group_id) {
      setWorkspaceStatus(`Opening Studio project history for ${draftTitle}...`);
      const restored = await loadTrackVersions(
        draft.source_track_group_id,
        draftVersion,
        draft.source_track_version_id
      );

      if (restored) {
        setWorkspaceStatus(`Opened Studio project with version history: ${draftTitle}.`);
        return;
      }
    }

    setVersions((current) => {
      const withoutDraft = current.filter((version) => version.id !== draftVersion.id);
      return [draftVersion, ...withoutDraft];
    });
    setActiveVersionId(draftVersion.id);
    setWorkspaceStatus(`Opened Studio project draft: ${draftTitle}.`);
  }

  function toggleDraftGroup(groupId: string) {
    setExpandedDraftGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  function startNewStudioProject() {
    if (generatePollTimeoutRef.current) {
      window.clearTimeout(generatePollTimeoutRef.current);
      generatePollTimeoutRef.current = null;
    }

    activeGenerateJobIdRef.current = null;
    activeGenerateStartedAtRef.current = null;
    activeGenerateTokenRef.current = null;
    activeGenerateProviderRef.current = null;
    generationDeadlineRef.current = null;

    setTitle("");
    setProjectName("");
    projectNameTouchedRef.current = false;
    setProjectNameTouched(false);
    setProjectNameUnsaved(false);
    setProjectNameSaving(false);
    setIdea("");
    setReferences("");
    setArtistIdentity("");
    setMusicDirection("");
    setFinalDirection("");
    setLyricsDirection("");
    setArtworkDirection("");
    setArtworkDirectionConcept(null);
    setSongLanguage("");
    setPromptHelpSuggestion("");
    setLyricsHelpSuggestion("");
    setLyricsPrompt("");
    setLyricsPreview("");
    setVoiceoverScript("");
    setDirectionLoading({
      music: false,
      lyrics: false,
      artwork: false,
    });
    setCoProducerLoading({
      prompt: false,
      music: false,
      lyrics: false,
      artwork: false,
      voiceover: false,
      edit: false,
    });
    setCoProducerError(null);
    setActionStates({});
    setLatestAiEditAdvice(null);
    setActiveCoProducerPreset(null);
    setVersionsOpen(false);
    setHeroPlaying(false);
    setUploadedTrackName("");
    setUploadedTrackNotes(
      "Use this imported track as a starting point and push the chorus harder without losing the core feel."
    );
    setImportFile(null);
    setImportStatus("idle");
    setImportMessage("Choose an MP3, WAV, FLAC, or M4A file.");
    setStemPrepareError(null);
    setStudioProHandoffWarning("");
    setActiveTrackGroupId(null);
    setActiveVersionId("");
    setVersions([]);
    setMixer({ ...initialMixer });
    setPreviewMode("off");
    setPreviewRenderUrl(null);
    setDynamics({ ...initialDynamics });
    setMuted({
      drums: false,
      bass: false,
      music: false,
      vocal: false,
      voiceover: false,
      fx: false,
      master: false,
      speed: false,
      pitch: false,
      subBass: false,
    });
    setSoloed({
      drums: false,
      bass: false,
      music: false,
      vocal: false,
      voiceover: false,
      fx: false,
      master: false,
      speed: false,
      pitch: false,
      subBass: false,
    });
    setStudioPhase("idle");
    setStepState({
      track: false,
      vocals: false,
      artwork: false,
    });
    setGenerateError(null);
    setGenerateStatus(null);
    setGenerateJobId(null);
    setGenerateStartedAt(null);
    setGenerationMode("seed");
    setSelectedExportAction(null);
    setShowPublishModal(false);
    setPublishSaving(false);
    setPublishedTrackId(null);
    setPublicReviewDraft(null);
    setPublicReviewSaving(false);
    setPublicReviewMessage(null);
    setSingingVersionLoading(false);
    setSingingVersionMessage("");
    setVocalLayerLoading(false);
    setArtworkConceptLoading(false);
    setArtworkImageLoading(false);
    setVoiceoverLayerStatus("idle");
    setVoiceoverLayerMessage("Idle. Generate a spoken layer after selecting a generated version and lyrics.");
    setVoiceoverMixPlaying(false);
    setPublishDraft({
      title: "",
      artistName: "SoundioX Artist",
      genre: "Electronic",
      visibility: "Draft",
      versionLabel: "",
      duration: null,
      vocalMode: null,
      provider: null,
      audioReady: false,
      artworkReady: false,
    });
    setWorkspaceStatus("New Studio project started.");
    setShowNewProjectModal(false);
  }

  async function markDraftReadyForPublicReview() {
    if (!publicReviewDraft) {
      const message = "Select a Studio draft first.";
      setWorkspaceStatus(message);
      setPublicReviewMessage(message);
      return;
    }

    setPublicReviewSaving(true);
    setActionFeedback("preparePublicPublish", "working", 0);
    setPublicReviewMessage("Requesting public review...");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in to request public review.");
      }

      const response = await fetch("/api/studio/prepare-public-review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trackId: publicReviewDraft.id }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Failed to request public review"));
      }

      setStudioDrafts((current) =>
        current.map((draft) =>
          draft.id === publicReviewDraft.id
            ? {
                ...draft,
                ready_for_review: true,
                review_requested_at:
                  typeof payload?.reviewRequestedAt === "string"
                    ? payload.reviewRequestedAt
                    : new Date().toISOString(),
              }
            : draft
        )
      );
      setWorkspaceStatus(`Public review requested for ${publicReviewDraft.title || "Untitled draft"}.`);
      setPublicReviewMessage(null);
      setPublicReviewDraft(null);
      setActionFeedback("preparePublicPublish", "success");
      await loadStudioDrafts();
    } catch (error: any) {
      const message = error?.message || "Failed to request public review.";
      setWorkspaceStatus(message);
      setPublicReviewMessage(message);
      setActionFeedback("preparePublicPublish", "error");
    } finally {
      setPublicReviewSaving(false);
    }
  }

  async function handleChatSend() {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    if (coProducerRemaining <= 0) {
      setCoProducerError("No co-producer actions remaining for this track.");
      return;
    }

    setCoProducerError(null);
    setCoProducerState("edit", true);
    setChatMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed,
      },
    ]);

    try {
      const advice = buildLocalCoProducerAdvice(trimmed);
      setLatestAiEditAdvice(advice);
      setCoProducerRemaining((current) => Math.max(0, current - 1));
      setChatMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now() + 1}`,
          role: "ai",
          text: advice.raw,
          canApply: true,
          applyAdvice: advice,
        },
      ]);
      setChatInput("");
    } finally {
      setCoProducerState("edit", false);
    }
  }

  const coProducerPanelContent = (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1 lg:max-h-[42vh]">
        {chatMessages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${
              message.role === "ai"
                ? "border border-sky-300/20 bg-sky-400/10 text-white/88"
                : "ml-auto border border-white/10 bg-white/8 text-white"
            }`}
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              {message.role === "ai" ? "Co-producer" : "You"}
            </div>
            <div>{message.text}</div>
            {message.canApply ? (
              <button
                type="button"
                onClick={() => applyAiAdviceToTrack(message.applyAdvice || latestAiEditAdvice)}
                disabled={!message.applyAdvice && !latestAiEditAdvice}
                className={getActionButtonClass(
                  !message.applyAdvice && !latestAiEditAdvice
                    ? "disabled"
                    : getActionState("coProducerApply"),
                  "mt-3 px-4 py-2 text-xs"
                )}
              >
                {getActionStatusLabel(
                  getActionState("coProducerApply"),
                  { success: "Saved", error: "Error" },
                  "Apply to Track & Create Version"
                )}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {coProducerError ? (
        <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {coProducerError}
        </div>
      ) : null}

      {latestAiEditAdvice ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="space-y-3 text-sm text-white">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                Change
              </div>
              <div className="mt-1 whitespace-pre-wrap">
                {latestAiEditAdvice.change || "No change summary returned."}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                Impact
              </div>
              <div className="mt-1 whitespace-pre-wrap">
                {latestAiEditAdvice.impact || "No impact summary returned."}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                Final Direction Preview
              </div>
              <div className="mt-1 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white">
                {latestAiEditAdvice.finalDirection || "No rewritten direction returned."}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex gap-3">
        <input
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            handleChatSend();
          }}
          className={inputClass}
          placeholder="Describe what you want to improve..."
        />
        <button
          type="button"
          onClick={() => void handleChatSend()}
          disabled={coProducerLoading.edit || coProducerRemaining <= 0}
          className={primaryButtonClass}
        >
          {coProducerLoading.edit ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );

  const waveformBars = useMemo(
    () =>
      Array.from({ length: 128 }, (_, index) => {
        const wave = Math.sin(index * 0.22) * 0.45 + Math.sin(index * 0.075 + 1.4) * 0.28;
        return 18 + Math.round(Math.abs(wave) * 28);
      }),
    []
  );
  const heroProgress =
    heroDuration > 0 ? Math.max(0, Math.min(100, (heroCurrentTime / heroDuration) * 100)) : 0;
  const activeVersionType = getVersionGenerationType(activeVersion);

  return (
    <div className="min-h-screen bg-[#05070d] px-4 pb-24 pt-6 text-white">
      {showNewProjectModal ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Close new project dialog"
            onClick={() => setShowNewProjectModal(false)}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-xl rounded-[28px] border border-sky-200/50 bg-slate-950/95 p-5 shadow-[0_30px_100px_rgba(56,189,248,0.35)]">
            <div>
              <div className="text-xs font-semibold tracking-[0.2em] text-sky-100">
                NEW STUDIO PROJECT
              </div>
              <div className="mt-1 text-xl font-semibold text-white">
                Start a new Studio project?
              </div>
              <p className="mt-3 text-sm text-white/72">
                This will clear the current workspace view. Saved drafts and versions remain in Studio Projects.
              </p>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowNewProjectModal(false)}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startNewStudioProject}
                className={primaryButtonClass}
              >
                Start new project
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Studio</h1>
            <p className="mt-2 text-sm text-white">
              Start with your idea, shape it in the studio, and use the AI co-producer when you need guidance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const handoffId = studioProHandoffTrackId;
                const targetUrl = `/studio-pro?track=${encodeURIComponent(studioProHandoffTrackId)}`;
                console.log("OPEN IN PRO CLICK", {
                  handoffId,
                  activeVersion,
                  activeDraftTrack: activeStudioDraft,
                  studioJob: generateJobId,
                  targetUrl,
                });
                if (!handoffId) {
                  setStudioProHandoffWarning("No project id found");
                  return;
                }
                setStudioProHandoffWarning("");
                window.location.href = targetUrl;
              }}
              className={`${primaryButtonClass} justify-center`}
            >
              Open in Studio PRO
            </button>
            {studioProHandoffWarning ? (
              <span className="inline-flex items-center rounded-full border border-amber-200/35 bg-amber-400/12 px-3 py-2 text-xs font-semibold text-amber-100">
                {studioProHandoffWarning}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setShowNewProjectModal(true)}
              className={`${secondaryButtonClass} justify-center`}
            >
              New project
            </button>
          </div>
        </div>

        <section className="mb-5 overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(14,165,233,0.08)_45%,rgba(168,85,247,0.08))] p-5 shadow-[0_35px_120px_rgba(8,47,73,0.24)] backdrop-blur-2xl md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-100/80">
                SoundioX Studio
              </div>
              <h2 className="mt-2 truncate text-3xl font-semibold tracking-tight text-white md:text-5xl">
                {activeVersion.title || title || "Untitled Studio track"}
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200/25 bg-sky-300/12 px-3 py-1 text-xs font-semibold text-sky-50">
                  {activeVersion.label}
                </span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/82">
                  Version {getVersionNumber(activeVersion, 0)}
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getVersionBadgeClass(activeVersionType)}`}>
                  {activeVersionType}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    activeVersionIsPersisted
                      ? "border-emerald-200/35 bg-emerald-400/12 text-emerald-100"
                      : "border-amber-200/35 bg-amber-400/12 text-amber-100"
                  }`}
                >
                  {activeVersionIsPersisted ? "Persisted" : "Local draft"}
                </span>
              </div>
            </div>
            <div className="grid gap-2 text-xs font-semibold text-white/66 sm:grid-cols-3 lg:min-w-[360px]">
              <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                {activeVersion.provider || "studio"}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                {typeof activeVersion.duration === "number" ? `${activeVersion.duration}s` : "duration pending"}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                stems {activeStemStatus}
              </div>
            </div>
          </div>

          <div className="mt-7 rounded-[32px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_54px_rgba(168,85,247,0.10)]">
            <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.12),transparent_55%),linear-gradient(180deg,rgba(3,7,18,0.26),rgba(3,7,18,0.58))] px-5 py-7">
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-white/8" />
              <div className="pointer-events-none absolute inset-x-10 top-1/2 h-10 -translate-y-1/2 bg-fuchsia-400/8 blur-2xl" />
              <div className="relative flex h-28 items-center gap-[3px] overflow-hidden">
                {waveformBars.map((height, index) => {
                  const filled = index / waveformBars.length <= heroProgress / 100;
                  return (
                    <span
                      key={index}
                      className={`w-px shrink-0 rounded-full transition sm:w-[2px] ${
                        filled
                          ? "bg-[linear-gradient(180deg,#c4b5fd,#67e8f9)] shadow-[0_0_8px_rgba(196,181,253,0.28)]"
                          : "bg-white/16"
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
                <span
                  className="pointer-events-none absolute bottom-2 top-2 w-px bg-cyan-100/60 shadow-[0_0_12px_rgba(103,232,249,0.54)]"
                  style={{ left: `${heroProgress}%` }}
                />
              </div>

              <div className="relative mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void toggleHeroPlayback()}
                    disabled={!activeVersion.audioUrl}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-950 shadow-[0_0_28px_rgba(255,255,255,0.22)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {heroPlaying ? "Ⅱ" : "▶"}
                  </button>
                  <div className="text-sm font-semibold text-white">
                    {formatPlaybackTime(heroCurrentTime)} / {formatPlaybackTime(heroDuration)}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/82">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        realtimeMixPreview.playing
                          ? "bg-emerald-200 shadow-[0_0_10px_rgba(167,243,208,0.55)]"
                          : "bg-white/30"
                      }`}
                    />
                    Realtime Mix Preview
                  </div>
                  {realtimeMixPreview.playing ? (
                    <div className="rounded-full border border-cyan-100/25 bg-cyan-300/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                      Live mixer active
                    </div>
                  ) : null}
                  <div className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-[11px] font-semibold text-white/58">
                    {realtimeMixPreview.usingStems ? "Stem routing" : "Stereo routing"}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-semibold text-white/64">
                  A/B compare space
                </div>
              </div>
              <div className="relative mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/65 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Use Realtime Mix Preview for live mixer changes. Source Reference is the untouched original.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.045] p-3 shadow-[0_18px_70px_rgba(14,165,233,0.10)] backdrop-blur-2xl">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {coProducerPresets.map((preset, index) => {
              const selected = activeCoProducerPreset === preset.name;
              return (
                <button
                  key={`${preset.name}-${index}`}
                  type="button"
                  onClick={() => applyCoProducerPreset(preset.name)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selected
                      ? "border-cyan-100/60 bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.24)]"
                      : "border-white/10 bg-white/7 text-white/76 hover:bg-white/12"
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-6">
          <div className="grid min-w-0 max-w-full gap-6 overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className={`${sectionClass} min-w-0 max-w-full overflow-hidden`}>
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  START A STUDIO PROJECT
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Start a Studio project
                </div>
                <div className="mt-2 text-sm text-white/78">
                  Generate a new idea or import an existing AI track, then shape it in Studio.
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-sky-200/25 bg-sky-300/10 p-4">
                    <div className="text-sm font-semibold text-white">Generate from prompt</div>
                    <div className="mt-1 text-xs text-white/70">
                      Choose one generator path from the project idea, final direction, lyrics, and vocal mode below.
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-xs font-semibold text-white/70">
                          Seed 15s: music-only test
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setGenerationMode("seed");
                            void handleGenerate({ generationIntent: "seed" });
                          }}
                          disabled={!idea.trim() || studioPhase === "loading"}
                          className={getActionButtonClass(
                            getActionState("generateSeed"),
                            "w-full justify-center"
                          )}
                        >
                          {getActionStatusLabel(
                            getActionState("generateSeed"),
                            { working: "Generating...", success: "Done", error: "Error" },
                            "Generate seed (15s)"
                          )}
                        </button>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-xs font-semibold text-white/70">
                          Full test 30s: music-only test
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setGenerationMode("full");
                            void handleGenerate({ generationIntent: "full" });
                          }}
                          disabled={!idea.trim() || studioPhase === "loading"}
                          className={getActionButtonClass(
                            getActionState("generateFull"),
                            "w-full justify-center"
                          )}
                        >
                          {getActionStatusLabel(
                            getActionState("generateFull"),
                            { working: "Generating...", success: "Done", error: "Error" },
                            "Generate full test (30s)"
                          )}
                        </button>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-xs font-semibold text-white/70">
                          Singing version: uses current lyrics + vocal mode
                        </div>
                        <button
                          type="button"
                          onClick={() => void generateSingingVersion()}
                          disabled={singingVersionLoading}
                          className={getActionButtonClass(
                            getActionState("generateSingingVersion", singingVersionLoading ? "working" : "idle"),
                            "w-full justify-center"
                          )}
                        >
                          {getActionStatusLabel(
                            getActionState("generateSingingVersion", singingVersionLoading ? "working" : "idle"),
                            { working: "Generating...", success: "Ready", error: "Error" },
                            "Generate singing version"
                          )}
                        </button>
                      </div>

                      <div className="rounded-2xl border border-amber-200/20 bg-amber-300/10 p-3">
                        <div className="mb-2 text-xs font-semibold text-amber-50">
                          Full song 180s: paid Eleven Music test
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void generateSingingVersion({
                              durationSeconds: 180,
                              generationMode: "singing",
                              requireVocalMode: true,
                              generatingMessage: "Generating full Eleven Music song...",
                              uploadingMessage: "Uploading full Eleven Music song...",
                              readyMessage: "Full Eleven Music song ready ✓",
                            })
                          }
                          disabled={singingVersionLoading}
                          className={getActionButtonClass(
                            getActionState("generateSingingVersion", singingVersionLoading ? "working" : "idle"),
                            "w-full justify-center"
                          )}
                        >
                          Generate full song (180s)
                        </button>
                      </div>
                    </div>
                    {singingVersionMessage ? (
                      <div
                        className={`mt-3 rounded-2xl border px-4 py-3 text-xs font-semibold ${
                          singingVersionMessage.startsWith("Failed:")
                            ? "border-rose-200/25 bg-rose-300/10 text-rose-50"
                            : singingVersionMessage.includes("ready")
                              ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-50"
                              : "border-sky-200/25 bg-sky-300/10 text-sky-50"
                        }`}
                      >
                        {singingVersionMessage}
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-2xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-50">
                      Seed and full test use the music-only provider. Singing version and full song use Eleven Music.
                    </div>
                  </div>

                  <div className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-semibold text-white">Upload / import existing track</div>
                    <div className="mt-1 text-xs text-white/70">
                      Bring in a Suno, Udio, or other AI track as the source. This imports audio as
                      an original Studio version; stem extraction comes later.
                    </div>
                    <label className="mt-4 block">
                      <div className="mb-2 text-xs font-semibold text-white/75">
                        Audio file
                      </div>
                      <input
                        type="file"
                        accept=".mp3,.wav,.flac,.m4a,audio/mpeg,audio/wav,audio/flac,audio/mp4"
                        onChange={(event) => {
                          const nextFile = event.target.files?.[0] || null;
                          setImportFile(nextFile);
                          setImportStatus("idle");
                          setImportMessage(
                            nextFile
                              ? `Selected: ${nextFile.name}`
                              : "Choose an MP3, WAV, FLAC, or M4A file."
                          );
                          if (nextFile && !uploadedTrackName.trim()) {
                            setUploadedTrackName(stripAudioExtension(nextFile.name));
                          }
                        }}
                        className="block w-full cursor-pointer rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-sky-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-300"
                      />
                    </label>
                    <input
                      value={uploadedTrackName}
                      onChange={(event) => setUploadedTrackName(event.target.value)}
                      className={`${inputClass} mt-3`}
                      placeholder="Uploaded or imported track name"
                    />
                    <textarea
                      value={uploadedTrackNotes}
                      onChange={(event) => setUploadedTrackNotes(event.target.value)}
                      rows={4}
                      className={`${inputClass} mt-3 resize-none`}
                      placeholder="Describe the changes you want for this uploaded / imported track..."
                    />
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/68">
                      Imported tracks support mixer planning, edit plans, artwork, versions, and release prep.
                    </div>
                    <button
                      type="button"
                      onClick={() => void importTrackIntoStudio()}
                      disabled={!importFile || importStatus === "uploading"}
                      className={getActionButtonClass(
                        !importFile
                          ? "disabled"
                          : getActionState("importTrack", importStatus === "uploading" ? "working" : "idle"),
                        "mt-4 w-full justify-center"
                      )}
                    >
                      {getActionStatusLabel(
                        getActionState("importTrack", importStatus === "uploading" ? "working" : "idle"),
                        { working: "Uploading...", success: "Imported", error: "Error" },
                        "Import into Studio"
                      )}
                    </button>
                    <div
                      className={`mt-3 rounded-2xl border px-4 py-3 text-xs font-semibold ${
                        importStatus === "imported"
                          ? "border-emerald-200/30 bg-emerald-400/10 text-emerald-100"
                          : importStatus === "error"
                            ? "border-rose-200/30 bg-rose-400/10 text-rose-100"
                            : importStatus === "uploading"
                              ? "border-sky-200/30 bg-sky-400/10 text-sky-100 animate-pulse"
                              : "border-white/10 bg-black/20 text-white/64"
                      }`}
                    >
                      {importStatus === "uploading"
                        ? "Uploading..."
                        : importStatus === "imported"
                          ? "Imported"
                          : importStatus === "error"
                            ? "Error"
                            : "Idle"}{" "}
                      · {importMessage}
                    </div>
                  </div>
                </div>

                <label className="block">
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-semibold text-white">Project name</span>
                    {projectNameUnsaved ? (
                      <span className="rounded-full border border-amber-200/35 bg-amber-300/12 px-2 py-1 text-[11px] font-semibold text-amber-50">
                        Unsaved
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void saveStudioProjectName()}
                      disabled={projectNameSaving || !projectName.trim()}
                      className={getActionButtonClass(
                        !projectName.trim()
                          ? "disabled"
                          : getActionState("saveProject", projectNameSaving ? "working" : "idle"),
                        "justify-center px-3 py-1.5 text-xs"
                      )}
                    >
                      {getActionStatusLabel(
                        getActionState("saveProject", projectNameSaving ? "working" : "idle"),
                        { working: "Saving...", success: "Saved", error: "Error" },
                        "Save project"
                      )}
                    </button>
                  </div>
                  <input
                    value={projectName}
                    onChange={(event) => updateProjectName(event.target.value)}
                    className={inputClass}
                    placeholder="Project name"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-white">Track / release title</div>
                  <input
                    value={title}
                    onChange={(event) => updateReleaseTitle(event.target.value)}
                    className={inputClass}
                    placeholder="Track title"
                  />
                </label>

                <textarea
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  rows={5}
                  className={`${inputClass} resize-none`}
                  placeholder="Describe the track idea..."
                />

                <div className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["Improve prompt", "Improve this Studio prompt for music generation."],
                      ["Make it more commercial", "Make this prompt more commercial, hook-focused, and release-ready."],
                      ["Make it darker", "Make this prompt darker while keeping it usable for music generation."],
                      ["Make it more emotional", "Make this prompt more emotional, specific, and natural."],
                      [
                        "Make it more Estonian/natural",
                        "If the prompt or lyrics are Estonian, make the Estonian more natural and idiomatic. Otherwise keep the meaning and improve natural phrasing.",
                      ],
                    ].map(([label, request]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => void requestPromptHelp(request)}
                        disabled={coProducerLoading.prompt || coProducerRemaining <= 0}
                        className={`${secondaryButtonClass} min-w-0 justify-center px-3 py-2 text-xs`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {promptHelpSuggestion ? (
                    <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-sky-200/25 bg-sky-400/10 p-3">
                      <div className="max-w-full whitespace-pre-wrap break-words text-sm text-white/86">
                        {promptHelpSuggestion}
                      </div>
                      <button
                        type="button"
                        onClick={applyPromptHelpSuggestion}
                        className={`${primaryButtonClass} mt-3 w-full justify-center py-2 text-xs`}
                      >
                        Apply
                      </button>
                    </div>
                  ) : null}
                </div>

                <input
                  value={references}
                  onChange={(event) => setReferences(event.target.value)}
                  className={inputClass}
                  placeholder="Optional references"
                />

                <select
                  value={trackGenre}
                  onChange={(event) => setTrackGenre(event.target.value)}
                  className={inputClass}
                >
                  {SOUNDIOX_GENRES.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>

                <label className="block">
                  <div className="mb-2 text-sm font-medium text-white">Song language</div>
                  <input
                    value={songLanguage}
                    onChange={(event) => setSongLanguage(event.target.value)}
                    className={inputClass}
                    placeholder="Enter language (examples: Estonian, Finnish, Japanese, Latin...)"
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-3">
                {([
                  ["music", "Music direction", musicDirection, setMusicDirection],
                  ["lyrics", "Lyrics direction", lyricsDirection, setLyricsDirection],
                  ["artwork", "Artwork direction", artworkDirection, setArtworkDirection],
                ] as Array<
                  [DirectionKey, string, string, Dispatch<SetStateAction<string>>]
                >).map(([key, label, value, setter]) => (
                  <div key={key} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 space-y-3">
                      <div className="text-sm font-semibold text-white">{label}</div>
                      <button
                        type="button"
                        onClick={() => void generateDirection(key)}
                        disabled={directionLoading[key] || coProducerRemaining <= 0}
                        className={`${secondaryButtonClass} w-full justify-center`}
                      >
                        {directionLoading[key] ? "Improving..." : "Improve"}
                      </button>
                    </div>

                    <textarea
                      value={key === "lyrics" ? lyricsPreview : value}
                      onChange={(event) => {
                        if (key === "lyrics") {
                          setLyricsPreview(event.target.value);
                          return;
                        }

                        setter(event.target.value);
                        if (key === "artwork") {
                          setArtworkDirectionConcept(null);
                        }
                      }}
                      rows={7}
                      className={`${inputClass} resize-none`}
                      placeholder={
                        key === "lyrics" ? "Add your own lyrics here, or generate them above." : undefined
                      }
                    />

                    <div className="mt-3 flex flex-col gap-2">
                      {(
                        key === "music"
                          ? [
                              ["More cinematic", "Push the arrangement wider with more atmosphere and lift."],
                              ["Stronger hook", "Move the topline toward a faster first payoff."],
                              ["Radio-ready", "Tighten the structure for a cleaner release shape."],
                            ]
                          : key === "lyrics"
                            ? [
                                ["More emotional", "Increase emotional specificity in the verse and hook."],
                                ["Improve hook", "Make the chorus line shorter and more repeatable."],
                                ["Rewrite chorus", "Give the chorus a bigger resolution line."],
                              ]
                            : [
                                ["More premium", "Refine the cover into a cleaner premium streaming-era finish."],
                                ["More neon", "Add stronger neon reflections and darker skyline contrast."],
                                ["More cinematic", "Make the scene wider and more atmospheric."],
                              ]
                      ).map(([chipLabel, addition]) => (
                        <button
                          key={chipLabel}
                          type="button"
                          onClick={() => void improveDirection(key, addition)}
                          disabled={directionLoading[key] || coProducerRemaining <= 0}
                          className={`${secondaryButtonClass} w-full justify-center`}
                        >
                          {chipLabel}
                        </button>
                      ))}
                      {key === "lyrics" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleLyricsAction("generate")}
                            disabled={coProducerLoading.lyrics || coProducerRemaining <= 0}
                            className={`${primaryButtonClass} w-full justify-center px-4 py-2.5 text-sm`}
                          >
                            {coProducerLoading.lyrics ? "Generating..." : "Generate lyrics"}
                          </button>
                          <div className="text-xs font-semibold text-white/70">
                            Creates editable lyrics.
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

            </section>

            <section className={`${sectionClass} min-w-0 max-w-full overflow-hidden`}>
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  YOUR ARTIST IDENTITY
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Create your artist identity
                </div>
              </div>

              <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
                <div className="flex min-w-0 max-w-full items-center gap-4 overflow-hidden rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white">
                    AI
                  </div>
                  <div className="min-w-0 max-w-full overflow-hidden">
                    <div className="truncate text-sm font-semibold text-white">AI Artist</div>
                    <div className="mt-1 max-w-full break-words text-sm text-white">
                      Save your artist voice and identity once, then reuse it across tracks.
                    </div>
                  </div>
                </div>

                <button type="button" className={`${secondaryButtonClass} w-full justify-center py-3`}>
                  Create or add your profile picture
                </button>

                <textarea
                  value={artistIdentity}
                  onChange={(event) => setArtistIdentity(event.target.value)}
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder="Describe your artist identity or visual style..."
                />

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleRecordVoiceClick}
                    disabled={voiceRecordingStatus === "requesting" || voiceRecordingStatus === "uploading"}
                    className={`${toolButtonClass} h-11 w-full justify-center px-4 py-2`}
                  >
                    {voiceRecordingStatus === "recording"
                      ? "Stop recording"
                      : voiceRecordingStatus === "recorded"
                        ? "Save voice sample"
                      : voiceRecordingStatus === "uploading"
                        ? "Saving voice..."
                        : voiceRecordingStatus === "requesting"
                          ? "Requesting microphone..."
                        : "Record your voice"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateArtistVoicePreview()}
                    disabled={artistVoicePreviewStatus === "generating"}
                    className={`${toolButtonClass} h-11 w-full justify-center px-4 py-2`}
                  >
                    {artistVoicePreviewStatus === "generating" ? "Generating..." : "Generate artist voice"}
                  </button>
                  <button
                    type="button"
                    className={`${toolButtonClass} h-11 w-full justify-center px-4 py-2`}
                  >
                    Edit identity
                  </button>
                </div>
                <div
                  className={`min-w-0 max-w-full overflow-hidden rounded-2xl border px-3 py-2 text-xs font-medium ${
                    voiceRecordingStatus === "error"
                      ? "border-rose-200/30 bg-rose-400/10 text-rose-100"
                      : voiceRecordingStatus === "recording"
                        ? "border-red-400/35 bg-red-500/10 text-white/82"
                        : voiceRecordingStatus === "saved"
                          ? "border-emerald-200/30 bg-emerald-400/10 text-emerald-100"
                          : "border-white/10 bg-black/20 text-white/70"
                  }`}
                >
                  {voiceRecordingStatus === "recording" ? (
                    <div className="mb-1 flex min-w-0 max-w-full items-center gap-2 overflow-hidden font-semibold">
                      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
                      <span className="shrink-0 text-red-500">REC</span>
                      <span className="truncate text-white/82">
                        {formatVoiceRecordingTime(voiceRecordingElapsedSeconds)}
                      </span>
                    </div>
                  ) : null}
                  <span className="block max-w-full break-words">
                    {voiceRecordingStatus === "saved" ? "Saved to your artist profile." : voiceRecordingMessage}
                  </span>
                  {voiceRecordingStatus === "recorded" ? (
                    <span className="mt-1 block max-w-full break-words text-white/55">
                      Saved after you click Save voice sample.
                    </span>
                  ) : null}
                  {voiceRecordingStatus === "saved" && voiceSampleUrl ? (
                    <span className="mt-1 block max-w-full truncate overflow-hidden text-emerald-100">
                      Voice sample ready ✓
                    </span>
                  ) : null}
                  {voiceSampleUrl ? (
                    <span className="mt-1 block max-w-full truncate overflow-hidden text-emerald-100">
                      Voice sample available for generation ✓
                    </span>
                  ) : null}
                  {voiceSampleUrl ? (
                    <span className="mt-1 block max-w-full break-words text-white/55">
                      Voice sample saved. Cloning not enabled yet.
                    </span>
                  ) : null}
                </div>
                {artistVoicePreviewMessage ? (
                  <div
                    className={`min-w-0 max-w-full overflow-hidden rounded-2xl border px-3 py-2 text-xs font-medium ${
                      artistVoicePreviewStatus === "error"
                        ? "border-rose-200/30 bg-rose-400/10 text-rose-100"
                        : artistVoicePreviewStatus === "ready"
                          ? "border-emerald-200/30 bg-emerald-400/10 text-emerald-100"
                          : "border-sky-200/30 bg-sky-400/10 text-sky-100"
                    }`}
                  >
                    <span className="block max-w-full break-words">
                      {artistVoicePreviewMessage}
                    </span>
                    {artistVoicePreviewUrl ? (
                      <audio className="mt-2 w-full" controls src={artistVoicePreviewUrl}>
                        Your browser does not support audio playback.
                      </audio>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <section className={sectionClass}>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-white">VOICE</div>
              <div className="mt-1 text-lg font-semibold text-white">
                Choose the main vocal mode clearly
              </div>
              <div className="mt-2 text-sm text-white/80">
                Vocal mode guides Eleven Music generation. Manual voiceover is separate spoken narration.
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {([
                ["instrumental", "Instrumental"],
                ["auto-lyrics", "Auto lyrics"],
                ["write-lyrics", "Write lyrics"],
                ["male", "Male vocal"],
                ["female", "Female vocal"],
                ["duet", "Duet"],
              ] as Array<[VocalMode, string]>).map(([value, label]) => {
                const isActive = vocalMode === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVocalMode(value)}
                    className={`inline-flex w-full cursor-pointer items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-sky-400 text-white ring-1 ring-sky-200/60 shadow-[0_0_18px_rgba(56,189,248,0.25)]"
                        : "border border-white/12 bg-white/7 text-white/80 hover:bg-white/12"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-2xl border border-sky-200/20 bg-sky-400/10 px-4 py-3 text-xs font-semibold text-sky-50">
              Auto lyrics chooses/uses lyrics during generation. To create editable lyrics, use Generate lyrics in the Lyrics section.
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Manual voiceover layer</div>
                  <div className="mt-1 text-xs text-white/70">
                    Creates spoken voiceover with ElevenLabs. Singing vocals are generated from the top generator area.
                  </div>
                  <div className="mt-2 text-xs font-semibold text-white/75">
                    Requires: generated version + lyrics + Male vocal or Female vocal.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void generateVocalLayer()}
                  disabled={voiceoverLayerDisabled}
                  className={getActionButtonClass(
                    voiceoverLayerMissingReason
                      ? "disabled"
                      : getActionState("voiceoverLayer", vocalLayerLoading ? "working" : "idle"),
                    "justify-center"
                  )}
                >
                  {getActionStatusLabel(
                    getActionState("voiceoverLayer", vocalLayerLoading ? "working" : "idle"),
                    { working: "Generating...", success: "Done", error: "Error" },
                    "Generate voiceover layer"
                  )}
                </button>
              </div>
              {voiceoverLayerMissingReason ? (
                <div className="mt-3 rounded-2xl border border-amber-200/25 bg-amber-300/10 px-4 py-3 text-xs font-semibold text-amber-50">
                  {voiceoverLayerMissingReason}
                </div>
              ) : null}
              <div
                className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  voiceoverLayerStatus === "generated"
                    ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-50"
                    : voiceoverLayerStatus === "error"
                      ? "border-rose-200/25 bg-rose-300/10 text-rose-50"
                      : voiceoverLayerStatus === "generating"
                        ? "border-sky-200/25 bg-sky-300/10 text-sky-50"
                        : "border-white/10 bg-black/20 text-white/70"
                }`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Voiceover status:{" "}
                    {voiceoverLayerStatus === "idle"
                      ? "Idle"
                      : voiceoverLayerStatus === "generating"
                        ? "Generating"
                        : voiceoverLayerStatus === "generated"
                          ? "Generated"
                          : "Error"}
                  </span>
                  {voiceoverLayerStatus === "generating" ? (
                    <span className="text-xs text-sky-100/80">Request in progress</span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs font-medium opacity-85">{voiceoverLayerMessage}</div>
              </div>
              {activeVersionVoiceoverUrl ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                    VOICEOVER LAYER PREVIEW
                  </div>
                  <audio className="mt-3 w-full" controls src={activeVersionVoiceoverUrl}>
                    Your browser does not support audio playback.
                  </audio>
                </div>
              ) : null}
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  GENERATION STATUS
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                Current generation queue
              </div>
              <div className="mt-2 text-sm text-white">
                Start new audio from the unified Studio project card above. This area shows progress,
                errors, and generated asset states.
              </div>
              <div className="mt-1 text-xs text-white">
                Seed mode is 15s. Full test mode is capped at 30s for now.
              </div>
            </div>
            </div>

            {generateError ? (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {generateError}
              </div>
            ) : null}

            {generateStatus && !generateError ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
                {generateStatus}
                {generateJobId ? (
                  <span className="mt-1 block text-xs text-white">Generation job: {generateJobId}</span>
                ) : null}
              </div>
            ) : null}

            {studioPhase !== "idle" ? (
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {([
                  ["track", "Generating track"],
                  ["vocals", "Vocals"],
                  ["voiceover", "Voiceover"],
                  ["artwork", "Generating artwork"],
                ] as Array<[StepKey | "voiceover", string]>).map(([key, label]) => {
                  const active = key === "voiceover" ? false : stepState[key];
                  const done =
                    (studioPhase === "complete" && key === "track") ||
                    (key === "voiceover" && Boolean(activeVersionVoiceoverUrl));
                  const statusLabel =
                    key === "voiceover" && activeVersionVoiceoverUrl
                      ? "Generated"
                      : key === "voiceover"
                        ? "Not generated yet"
                      : key === "vocals" && vocalMode === "instrumental"
                        ? "Not needed"
                      : key === "vocals"
                          ? "Prompt-only"
                          : done
                            ? "Done"
                            : active
                              ? "Working..."
                              : key === "artwork" && studioPhase === "complete"
                                ? "Not generated yet"
                                : "Pending";

                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                    >
                      <div className="text-sm font-medium text-white">{label}</div>
                      <div
                        className={`mt-2 text-xs font-semibold ${
                          done
                            ? "text-emerald-300"
                            : active
                              ? "text-sky-200"
                              : "text-white"
                        }`}
                      >
                        {statusLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className={sectionClass}>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-white">
                RESULT / EDIT AREA
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Current version and release prep
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(255,255,255,0.05))] p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-400 text-lg font-semibold text-white ring-1 ring-sky-200/60 shadow-[0_0_18px_rgba(56,189,248,0.25)]">
                    {activeVersion.audioUrl ? "♫" : "▶"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-lg font-semibold text-white">
                        {activeVersion.title}
                      </div>
                      <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100">
                        {activeVersion.label}
                      </span>
                      <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/82">
                        Version {getVersionNumber(activeVersion, 0)}
                      </span>
                      {activeVersion.isOriginal || activeVersion.label.toLowerCase() === "original" ? (
                        <span className="rounded-full border border-emerald-200/35 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                          Original protected
                        </span>
                      ) : null}
                      {activeVersion.createdFrom === "co-producer" ? (
                        <span className="rounded-full border border-fuchsia-200/35 bg-fuchsia-400/15 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-100">
                          Co-Producer
                        </span>
                      ) : null}
                      {activeVersion.status === "edit_plan" ? (
                        <span className="rounded-full border border-amber-200/35 bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                          Edit Plan
                        </span>
                      ) : null}
                      {activeVersion.provider === "replicate" &&
                      activeVersion.createdFrom &&
                      ["new-version", "remix", "instrumental", "co-producer"].includes(
                        activeVersion.createdFrom
                      ) ? (
                        <span className="rounded-full border border-rose-200/35 bg-rose-400/15 px-2.5 py-1 text-[11px] font-semibold text-rose-100">
                          Paid AI Version
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          activeVersionIsPersisted
                            ? "border-emerald-200/35 bg-emerald-400/15 text-emerald-100"
                            : "border-amber-200/35 bg-amber-400/15 text-amber-100"
                        }`}
                      >
                        {activeVersionIsPersisted ? "Persisted Version" : "Local Draft"}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-white">
                      {activeVersion.source === "imported" ? "Imported track edit" : "Generated track"} •{" "}
                      {vocalMode === "instrumental"
                        ? "Instrumental"
                        : vocalMode === "auto-lyrics"
                          ? "Auto lyrics"
                          : vocalMode === "write-lyrics"
                            ? "Write lyrics"
                            : vocalMode === "duet"
                              ? "Duet vocal"
                              : `${vocalMode} vocal`}
                    </div>

                    <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs font-semibold text-white/70">
                        Restore changes only the active Studio selection. No files or version rows are changed.
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => navigateVersion(previousVersion, "previous")}
                          disabled={!previousVersion}
                          className={`${secondaryButtonClass} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          Previous Version
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateVersion(nextVersion, "next")}
                          disabled={!nextVersion}
                          className={`${secondaryButtonClass} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          Next Version
                        </button>
                        <button
                          type="button"
                          onClick={() => restoreVersion(activeVersion)}
                          className={`${primaryButtonClass} justify-center`}
                        >
                          Restore Version
                        </button>
                      </div>
                    </div>

                    {!activeVersion.audioUrl ? (
                      <div className="mt-3 rounded-2xl border border-amber-200/25 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-50">
                        This version has no audio. Choose an audio version.
                      </div>
                    ) : null}

                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                        VERSION NOTE
                      </div>
                      <div className="mt-2 text-sm text-white">{activeVersion.note}</div>
                    </div>

                    {activeVersion.status === "edit_plan" ? (
                      <div className="mt-3 rounded-2xl border border-amber-200/25 bg-amber-400/10 p-3">
                        <div className="text-[11px] font-semibold tracking-[0.18em] text-amber-100">
                          EDIT PLAN
                        </div>
                        <div className="mt-2 text-sm text-amber-50">
                          This is an edit plan. Audio has not been changed yet. Low-cost
                          stem/audio editing is coming later.
                        </div>
                        <div className="mt-2 text-xs text-white/65">
                          Paid AI generation creates a new track-length generation and may cost the
                          same as a new song.
                        </div>
                        {activeVersion.editInstruction ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/72">
                            {activeVersion.editInstruction}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => requestPaidGenerationForEditPlan(activeVersion)}
                          className={`${primaryButtonClass} mt-4`}
                        >
                          Generate paid AI version
                        </button>
                      </div>
                    ) : null}

                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                        MIXER SUMMARY
                      </div>
                      <div className="mt-2 text-sm text-white">{mixerSummary}</div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      {(() => {
                        const artworkConcept = getActiveArtworkConcept();
                        const artworkConceptReady = Boolean(artworkConcept);

                        return (
                          <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                            ARTWORK CONCEPT
                          </div>
                          <div className="mt-1 text-sm text-white">
                            Concept: {artworkConceptReady ? "Ready" : "Missing"}
                          </div>
                          <div className="mt-1 text-xs text-white/65">
                            Image: {activeVersion.artworkUrl ? "Ready" : "Not generated yet"}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {artworkConceptReady ? (
                            <button
                              type="button"
                              onClick={() => void generateCoverImage()}
                              disabled={artworkImageLoading || !artworkConcept?.imagePrompt}
                              className={getActionButtonClass(
                                !artworkConcept?.imagePrompt
                                  ? "disabled"
                                  : getActionState("coverImage", artworkImageLoading ? "working" : "idle"),
                                "justify-center"
                              )}
                            >
                              {getActionStatusLabel(
                                getActionState("coverImage", artworkImageLoading ? "working" : "idle"),
                                { working: "Generating...", success: "Done", error: "Error" },
                                "Generate Cover Image"
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void createArtworkConcept()}
                              disabled={artworkConceptLoading}
                              className={getActionButtonClass(
                                getActionState("artworkConcept", artworkConceptLoading ? "working" : "idle"),
                                "justify-center"
                              )}
                            >
                              {getActionStatusLabel(
                                getActionState("artworkConcept", artworkConceptLoading ? "working" : "idle"),
                                { working: "Generating...", success: "Ready", error: "Error" },
                                "Generate Artwork Concept"
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      {artworkConcept ? (
                        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-sm font-semibold text-white">
                            Theme: {artworkConcept.summary || artworkConcept.concept}
                          </div>
                          <div className="text-xs text-white/70">
                            Mood: {artworkConcept.concept}
                          </div>
                          <div className="text-xs text-white/70">
                            Palette: {artworkConcept.palette}
                          </div>
                          {artworkConcept.styleTags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {artworkConcept.styleTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-white/10 bg-white/7 px-2.5 py-1 text-[11px] font-semibold text-white/75"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="text-xs text-white/70">
                            Style: {artworkConcept.imagePrompt}
                          </div>
                        </div>
                      ) : null}
                          </>
                        );
                      })()}
                      {activeVersion.artworkUrl ? (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                            COVER IMAGE PREVIEW
                          </div>
                          <img
                            src={activeVersion.artworkUrl}
                            alt={`${activeVersion.title || "Studio"} cover`}
                            className="mt-3 aspect-square w-full max-w-xs rounded-2xl object-cover ring-1 ring-white/10"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                          SOURCE REFERENCE
                        </div>
                        <div className="mt-1 text-xs text-white/55">
                          Untouched original playback. Use Realtime Mix Preview above to hear mixer changes.
                        </div>
                        {activeVersion.audioUrl ? (
                          <audio className="mt-3 w-full" controls src={activeVersion.audioUrl}>
                            Your browser does not support audio playback.
                          </audio>
                        ) : (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/65">
                            This version has no audio. Choose an audio version.
                          </div>
                        )}
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs text-white/65">
                            Studio exports remain private until published to SoundioX.
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={downloadActiveVersion}
                              disabled={!activeVersion.audioUrl || getActionState("downloadVersion") === "working"}
                              className={getActionButtonClass(
                                activeVersion.audioUrl
                                  ? getActionState("downloadVersion")
                                  : "disabled",
                                "justify-center"
                              )}
                            >
                              {getActionStatusLabel(
                                getActionState("downloadVersion"),
                                {
                                  working: "Preparing download...",
                                  success: "Download started",
                                  error: "Download unavailable",
                                },
                                "Download version"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void exportActiveVersionStems()}
                              disabled={activeStemStatus !== "ready" || getActionState("exportStems") === "working"}
                              className={getActionButtonClass(
                                activeStemStatus === "ready"
                                  ? getActionState("exportStems")
                                  : "disabled",
                                "justify-center"
                              )}
                            >
                              {getActionStatusLabel(
                                getActionState("exportStems"),
                                {
                                  working: "Preparing stems export...",
                                  success: "Download started",
                                  error: "Export unavailable",
                                },
                                "Export stems"
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-white/55">
                          Exported stems can be used in DAWs like Ableton, FL Studio, and Logic.
                        </div>
                        {activeVersion.audioUrl && activeVersionVoiceoverUrl ? (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                                  MUSIC + VOICEOVER PREVIEW
                                </div>
                                <div className="mt-1 text-xs text-white/65">
                                  Local preview only. This does not render or upload a mixed file.
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void toggleVoiceoverMixPlayback()}
                                className={`${secondaryButtonClass} justify-center`}
                              >
                                {voiceoverMixPlaying ? "Pause voiceover mix" : "Play with voiceover"}
                              </button>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <label className="block">
                                <div className="mb-2 text-xs font-semibold text-white/75">
                                  Music volume
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={musicPreviewVolume}
                                  onChange={(event) => setMusicPreviewVolume(Number(event.target.value))}
                                  className="w-full"
                                />
                              </label>
                              <label className="block">
                                <div className="mb-2 text-xs font-semibold text-white/75">
                                  Voiceover volume
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={voiceoverPreviewVolume}
                                  onChange={(event) => setVoiceoverPreviewVolume(Number(event.target.value))}
                                  className="w-full"
                                />
                              </label>
                            </div>

                            <audio
                              ref={musicMixRef}
                              src={activeVersion.audioUrl}
                              preload="auto"
                              hidden
                              onEnded={() => setVoiceoverMixPlaying(false)}
                            />
                            <audio
                              ref={voiceoverMixRef}
                              src={activeVersionVoiceoverUrl}
                              preload="auto"
                              hidden
                              onEnded={() => setVoiceoverMixPlaying(false)}
                            />
                          </div>
                        ) : null}
                      </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {(
                  [
                    { action: "Instrumental version", label: "Instrumental version" },
                    {
                      action: "Create remix",
                      label: resolveGenerationSourceVersion(activeVersion)
                        ? "Create remix"
                        : "Create remix plan",
                    },
                    {
                      action: "Create new version",
                      label: resolveGenerationSourceVersion(activeVersion)
                        ? "Create new version"
                        : "Create new version plan",
                    },
                  ] as const
                ).map(({ action, label }) => {
                  const actionKey: ActionKey =
                    action === "Instrumental version"
                      ? "instrumentalVersion"
                      : action === "Create remix"
                        ? "createRemix"
                        : "createNewVersion";

                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => handleWorkspaceAction(action)}
                      className={getActionButtonClass(
                        getActionState(actionKey),
                        "w-full rounded-2xl px-4 py-2"
                      )}
                    >
                      {getActionStatusLabel(
                        getActionState(actionKey),
                        { success: "Saved", error: "Error" },
                        label
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {exportActions.map((label) => {
                  const isActiveExport = selectedExportAction === label;
                  const actionKey: ActionKey | null =
                    label === "Submit to SoundioX" ? "submitSoundioX" : null;
                  const status = actionKey ? getActionState(actionKey) : "idle";

                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleWorkspaceAction(label)}
                      className={
                        actionKey
                          ? getActionButtonClass(status, "w-full rounded-2xl px-4 py-2")
                          : isActiveExport
                            ? "inline-flex w-full cursor-pointer items-center justify-center rounded-2xl border border-sky-100/60 bg-sky-300/22 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_22px_rgba(125,211,252,0.28)] transition hover:bg-sky-300/28"
                            : `${toolButtonClass} w-full px-4 py-2`
                      }
                    >
                      {actionKey
                        ? getActionStatusLabel(
                            status,
                            { working: "Preparing...", success: "Ready", error: "Error" },
                            label
                          )
                        : label}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                  WORKSPACE STATUS
                </div>
                <div className="mt-2 text-sm text-white">{workspaceStatus}</div>
              </div>

              {pendingPaidEditGeneration ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
                  <div className="w-full max-w-xl rounded-[28px] border border-amber-200/45 bg-slate-950/95 p-5 shadow-[0_30px_100px_rgba(251,191,36,0.24)]">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.2em] text-amber-100">
                        PAID AI GENERATION
                      </div>
                      <div className="mt-1 text-xl font-semibold text-white">
                        Start paid AI generation?
                      </div>
                      <p className="mt-3 text-sm text-white/72">
                        This creates a new AI-generated version, not a cheap stem edit. It may cost
                        the same as a new generation. The original/source track will stay unchanged.
                      </p>
                      <div className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                        This is prompt-based regeneration. True low-cost stem remix/edit is not
                        connected yet.
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={cancelPaidEditGeneration}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmPaidEditGeneration}
                        disabled={studioPhase === "loading"}
                        className={primaryButtonClass}
                      >
                        Start generation
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {showPublishModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
                  <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-sky-200/50 bg-slate-950/95 p-5 shadow-[0_30px_100px_rgba(56,189,248,0.35)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold tracking-[0.2em] text-sky-100">
                          PUBLISH TO SOUNDIOX
                        </div>
                        <div className="mt-1 text-xl font-semibold text-white">
                          Review publish draft
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPublishModal(false)}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <div className="mb-2 text-sm font-medium text-white">Title</div>
                        <input
                          value={publishDraft.title}
                          onChange={(event) =>
                            setPublishDraft((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>

                      <label className="block">
                        <div className="mb-2 text-sm font-medium text-white">Artist name</div>
                        <input
                          value={publishDraft.artistName}
                          onChange={(event) =>
                            setPublishDraft((current) => ({
                              ...current,
                              artistName: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>

                      <label className="block">
                        <div className="mb-2 text-sm font-medium text-white">Genre</div>
                        <select
                          value={publishDraft.genre}
                          onChange={(event) =>
                            setPublishDraft((current) => ({
                              ...current,
                              genre: event.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          {SOUNDIOX_GENRES.map((genre) => (
                            <option key={genre} value={genre}>
                              {genre}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <div className="mb-2 text-sm font-medium text-white">Visibility</div>
                        <select
                          value={publishDraft.visibility}
                          onChange={(event) =>
                            setPublishDraft((current) => ({
                              ...current,
                              visibility: event.target.value as PublishVisibility,
                            }))
                          }
                          className={inputClass}
                        >
                          {(["Draft", "Private", "Public"] as PublishVisibility[]).map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>

                      {[
                        ["Version label", publishDraft.versionLabel],
                        [
                          "Duration",
                          typeof publishDraft.duration === "number"
                            ? `${publishDraft.duration}s`
                            : "Missing",
                        ],
                        ["Vocal mode", publishDraft.vocalMode || "Missing"],
                        ["Provider", publishDraft.provider || "Not set"],
                        ["Audio ready", publishDraft.audioReady ? "Ready" : "Missing"],
                        ["Artwork concept", activeVersion.artworkConcept ? "Ready" : "Missing"],
                        [
                          "Cover image",
                          publishDraft.artworkReady ? "Ready" : "Missing",
                        ],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-black/22 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62">
                            {label}
                          </div>
                          <div className="mt-1 text-sm font-medium text-white">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setShowPublishModal(false)}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveSoundioXDraft}
                        disabled={publishSaving}
                        className={getActionButtonClass(
                          getActionState("submitSoundioX", publishSaving ? "working" : "idle")
                        )}
                      >
                        {getActionStatusLabel(
                          getActionState("submitSoundioX", publishSaving ? "working" : "idle"),
                          { working: "Saving...", success: "Saved", error: "Error" },
                          "Save as SoundioX draft"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedExportAction === "Submit to SoundioX" ? (
                <div className="rounded-2xl border border-sky-200/25 bg-sky-300/10 p-3 shadow-[0_0_24px_rgba(125,211,252,0.16)]">
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                    SOUNDIOX SUBMISSION PREVIEW
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-white sm:grid-cols-2">
                    {[
                      ["Title", publishDraft.title || activeVersion.title || "Missing"],
                      ["Version label", publishDraft.versionLabel || activeVersion.label],
                      [
                        "Duration",
                        typeof publishDraft.duration === "number"
                          ? `${publishDraft.duration}s`
                          : typeof activeVersion.duration === "number"
                            ? `${activeVersion.duration}s`
                            : "Missing",
                      ],
                      ["Vocal mode", publishDraft.vocalMode || activeVersion.vocalMode || "Missing"],
                      ["Provider", publishDraft.provider || activeVersion.provider || "Not set"],
                      ["Audio", publishDraft.audioReady || activeVersion.audioUrl ? "Audio ready" : "Audio missing"],
                      ["Voiceover layer", activeVersionVoiceoverUrl ? "Ready" : "Missing"],
                      ["Artwork concept", activeVersion.artworkConcept ? "Ready" : "Missing"],
                      [
                        "Cover image",
                        publishDraft.artworkReady || activeVersion.artworkUrl
                          ? "Ready"
                          : "Missing",
                      ],
                      ["Suggested status", publishDraft.visibility],
                      ["Target", "SoundioX tracks library"],
                      ["Track id", publishedTrackId || "Not saved yet"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-white/10 bg-black/18 px-3 py-2"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62">
                          {label}
                        </div>
                        <div className="mt-1 truncate font-medium text-white">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-xs font-medium text-white/70">
                    Voiceover is separate from singing vocals.
                  </div>
                </div>
              ) : null}

              {selectedExportAction === "Export release package" ? (
                <div className="rounded-2xl border border-sky-200/25 bg-sky-300/10 p-3 shadow-[0_0_24px_rgba(125,211,252,0.16)]">
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                    RELEASE PACKAGE PREVIEW
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-white sm:grid-cols-2">
                    {[
                      ["Title", activeVersion.title],
                      ["Version label", activeVersion.label],
                      [
                        "Duration",
                        typeof activeVersion.duration === "number"
                          ? `${activeVersion.duration}s`
                          : "Missing",
                      ],
                      ["Vocal mode", activeVersion.vocalMode || vocalMode || "Not set"],
                      ["Provider", activeVersion.provider || "Not set"],
                      ["Music audio", activeVersion.audioUrl ? "Ready" : "Missing"],
                      ["Voiceover layer", activeVersionVoiceoverUrl ? "Ready" : "Missing"],
                      ["Singing vocals", activeVersion.provider === "eleven_music" ? "Generated with Eleven Music" : "Use Eleven Music generator"],
                      ["Artwork concept", activeVersion.artworkConcept ? "Ready" : "Missing"],
                      ["Cover image", activeVersion.artworkUrl ? "Ready" : "Missing"],
                      ["Spotify metadata draft", "Ready"],
                      ["YouTube submission draft", "Ready"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-white/10 bg-black/18 px-3 py-2"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62">
                          {label}
                        </div>
                        <div className="mt-1 truncate font-medium text-white">{value}</div>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const readinessItems = [
                      ["Audio generated", Boolean(activeVersion.audioUrl), false],
                      ["Title ready", Boolean(activeVersion.title?.trim()), false],
                      ["Vocal mode selected", Boolean(activeVersion.vocalMode), false],
                      ["Voiceover layer attached", Boolean(activeVersionVoiceoverUrl), true],
                      ["Artwork concept ready", Boolean(activeVersion.artworkConcept), false],
                      ["Cover image ready", Boolean(activeVersion.artworkUrl), false],
                      ["Spotify metadata draft ready", true, false],
                      ["YouTube submission draft ready", true, false],
                    ] as Array<[string, boolean, boolean]>;
                    const releaseReady = readinessItems
                      .filter(([, , optional]) => !optional)
                      .every(([, ready]) => ready);

                    return (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/18 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                            RELEASE READINESS
                          </div>
                          <div
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                              releaseReady
                                ? "border-emerald-200/40 bg-emerald-400/15 text-emerald-100"
                                : "border-amber-200/40 bg-amber-400/15 text-amber-100"
                            }`}
                          >
                            {releaseReady
                              ? "Release package is ready"
                              : "Release package needs finishing"}
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {readinessItems.map(([label, ready, optional]) => (
                            <div
                              key={label}
                              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                                ready
                                  ? "border-emerald-200/24 bg-emerald-400/10 text-emerald-50"
                                  : "border-white/10 bg-black/18 text-white/72"
                              }`}
                            >
                              <span>
                                {label}
                                {optional ? (
                                  <span className="ml-2 text-[11px] font-semibold text-white/45">
                                    Optional
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-[11px] font-semibold">
                                {ready ? "Ready" : "Missing"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {publicReviewDraft ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
                  <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-sky-200/50 bg-slate-950/95 p-5 shadow-[0_30px_100px_rgba(56,189,248,0.35)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold tracking-[0.2em] text-sky-100">
                          PREPARE PUBLIC PUBLISH
                        </div>
                        <div className="mt-1 text-xl font-semibold text-white">
                          Prepare public publish
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPublicReviewDraft(null);
                          setPublicReviewMessage(null);
                        }}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-amber-200/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
                      This will make the track eligible for Discover, Pulse, artist pages, likes,
                      plays, and sharing after final confirmation.
                    </div>

                    {publicReviewMessage ? (
                      <div className="mt-3 rounded-2xl border border-sky-200/25 bg-sky-400/10 px-4 py-3 text-sm text-sky-50">
                        {publicReviewMessage}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        ["Title", publicReviewDraft.title || "Untitled draft"],
                        ["Artist", publicReviewDraft.artist || "Unknown artist"],
                        ["Genre", publicReviewDraft.genre || "No genre"],
                        ["Audio ready", publicReviewDraft.audio_url ? "Ready" : "Missing"],
                        [
                          "Artwork status",
                          publicReviewDraft.artwork_url ? "Ready" : "Not generated yet",
                        ],
                        ["Current status", "Draft"],
                        ["Target status", "Public"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-black/22 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62">
                            {label}
                          </div>
                          <div className="mt-1 text-sm font-medium text-white">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setPublicReviewDraft(null);
                          setPublicReviewMessage(null);
                        }}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={markDraftReadyForPublicReview}
                        disabled={publicReviewSaving}
                        className={getActionButtonClass(
                          getActionState("preparePublicPublish", publicReviewSaving ? "working" : "idle")
                        )}
                      >
                        {getActionStatusLabel(
                          getActionState("preparePublicPublish", publicReviewSaving ? "working" : "idle"),
                          { working: "Preparing...", success: "Ready", error: "Error" },
                          "Mark ready for public review"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {pendingDeleteStudioProject ? (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm">
                  <div className="w-full max-w-lg rounded-[24px] border border-rose-200/35 bg-slate-950/95 p-5 shadow-[0_30px_100px_rgba(244,63,94,0.25)]">
                    <div className="text-xs font-semibold tracking-[0.2em] text-rose-100">
                      DELETE STUDIO PROJECT
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {pendingDeleteStudioProject.projectName}
                    </div>
                    <div className="mt-4 rounded-2xl border border-rose-200/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-50">
                      Delete this Studio project? Generated audio versions will remain in storage
                      for now, but this project will be removed from the Studio Projects list.
                    </div>
                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteStudioProject(null)}
                        disabled={studioProjectDeleting}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void deletePendingStudioProject()}
                        disabled={studioProjectDeleting}
                        className={getActionButtonClass(
                          studioProjectDeleting ? "working" : "error",
                          "justify-center"
                        )}
                      >
                        {studioProjectDeleting ? "Deleting..." : "Delete project"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}


          <section className={sectionClass}>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-white">
                STUDIO CONTROLS
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Mix the layers like a small control desk
              </div>
              <div className="mt-2 text-sm text-white/78">
                {activeStemStatus === "ready"
                  ? "Stem edit mode enabled."
                  : "Mixer changes are saved as edit plans until stems are ready."}
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Currently editing: {title.trim() ? `${title} · ${activeVersion.label}` : "New track draft"}
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  mixerEditStatus === "Saved"
                    ? "border-emerald-200/35 bg-emerald-400/12 text-emerald-100"
                    : mixerEditStatus === "Planning"
                      ? "border-rose-200/35 bg-rose-400/12 text-rose-100 animate-pulse"
                      : mixerEditStatus === "Error"
                        ? "border-rose-300/35 bg-rose-900/40 text-rose-100"
                        : "border-white/10 bg-white/5 text-white/65"
                }`}
              >
                Mixer: {mixerEditStatus}
              </span>
            </div>

            <div className="mb-4 rounded-[24px] border border-sky-200/18 bg-black/18 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-[0.2em] text-white">
                    STEM ENGINE
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    Prepare stems before real low-cost audio edits
                  </div>
                  <div className="mt-2 text-sm text-white/76">
                    Stem extraction is queued here first. No Replicate generation or paid remix
                    generation starts from this action.
                  </div>
                  <div className="mt-2 text-xs font-semibold text-sky-50/85">
                    Stem extraction runs once per source version. Future mixer edits reuse cached
                    stems.
                  </div>
                  {activeStemStatus !== "ready" ? (
                    <div className="mt-2 text-xs font-semibold text-amber-100">
                      {activeVersionIsPersisted
                        ? "Mixer changes are saved as edit plans until stems are ready."
                        : "Save/open a persisted Studio version before preparing stems."}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-emerald-200/25 bg-emerald-400/12 p-3">
                      <div className="text-sm font-semibold text-emerald-50">
                        Stem edit mode enabled
                      </div>
                      <div className="mt-1 text-xs font-semibold text-emerald-50/90">
                        {hasMockStemsMetadata(activeVersion.stemsMetadata)
                          ? "Mock stems: mixer renders are technical tests. Real stem separation is required for true sound editing."
                          : "Real stems ready: mixer changes affect separated layers."}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[
                          ["Drums ready", activeVersion.stemDrumsUrl],
                          ["Bass ready", activeVersion.stemBassUrl],
                          ["Vocals ready", activeVersion.stemVocalsUrl],
                          ["Music ready", activeVersion.stemOtherUrl],
                        ].map(([label, url]) => (
                          <span
                            key={label}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              url
                                ? "border-emerald-200/35 bg-emerald-300/12 text-emerald-100"
                                : "border-white/10 bg-white/5 text-white/55"
                            }`}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!activeVersionIsPersisted ? (
                    <div className="mt-3 rounded-2xl border border-amber-200/30 bg-amber-400/10 p-3">
                      <div className="text-sm font-semibold text-amber-50">
                        Save this Studio version before preparing stems.
                      </div>
                      <div className="mt-1 text-xs text-white/70">
                        This turns the local draft into a persisted Studio version with a real
                        track version id and project group.
                      </div>
                      <button
                        type="button"
                        onClick={() => void saveLocalDraftAsStudioVersion()}
                        disabled={
                          getActionState("saveStudioVersion") === "working" ||
                          !activeVersion.audioUrl
                        }
                        className={getActionButtonClass(
                          !activeVersion.audioUrl
                            ? "disabled"
                            : getActionState("saveStudioVersion"),
                          "mt-3 justify-center"
                        )}
                      >
                        {getActionStatusLabel(
                          getActionState("saveStudioVersion"),
                          { working: "Saving...", success: "Saved", error: "Error" },
                          "Save Studio version"
                        )}
                      </button>
                    </div>
                  ) : null}
                  {activeVersion.stemsError ? (
                    <div className="mt-2 text-xs font-semibold text-rose-100">
                      {activeVersion.stemsError}
                    </div>
                  ) : null}
                  {stemPrepareError ? (
                    <div className="mt-3 rounded-2xl border border-rose-200/30 bg-rose-400/10 p-3 text-xs text-rose-50">
                      <div className="font-semibold">Prepare stems error</div>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        <span>HTTP status: {stemPrepareError.httpStatus ?? "client"}</span>
                        <span>hasAudioUrl: {stemPrepareError.hasAudioUrl ? "yes" : "no"}</span>
                        <span>trackVersionId: {stemPrepareError.trackVersionId}</span>
                        <span>trackGroupId: {stemPrepareError.trackGroupId}</span>
                        <span className="sm:col-span-2">
                          API error: {stemPrepareError.message}
                        </span>
                        {stemPrepareError.rawApiResponse ? (
                          <pre className="sm:col-span-2 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/30 p-2 text-[10px] text-rose-50">
                            {JSON.stringify(stemPrepareError.rawApiResponse, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-[11px] text-white/68">
                    <div className="font-semibold uppercase tracking-[0.16em] text-white/78">
                      Stem debug
                    </div>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      <span>activeVersion.id: {activeVersion.id || "missing"}</span>
                      <span>
                        activeVersion.trackGroupId: {activeVersion.trackGroupId || "missing"}
                      </span>
                      <span>hasAudioUrl: {activeVersion.audioUrl ? "yes" : "no"}</span>
                      <span>stemsStatus: {activeStemStatus}</span>
                      <span>
                        versionKind: {activeVersionIsPersisted ? "Persisted Version" : "Local Draft"}
                      </span>
                      <span className="sm:col-span-2">
                        prepareDisabledReason: {prepareStemsDisabledReason || "enabled"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStemStatusBadgeClass(
                      activeStemStatus
                    )}`}
                  >
                    Status: {getStemStatusLabel(activeStemStatus)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void prepareStemsForActiveVersion()}
                    disabled={Boolean(prepareStemsDisabledReason)}
                    className={getActionButtonClass(
                      prepareStemsDisabledReason
                        ? "disabled"
                        : getActionState("prepareStems"),
                      "justify-center"
                    )}
                  >
                    {activeStemStatus === "ready"
                      ? "Stems ready"
                      : activeStemStatus === "queued"
                        ? "Queued"
                        : activeStemStatus === "processing"
                          ? "Processing..."
                          : getActionStatusLabel(
                              getActionState("prepareStems"),
                              { working: "Preparing...", success: "Queued", error: "Error" },
                              "Prepare stems"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void renderMixForActiveVersion()}
                    disabled={
                      getActionState("renderMix") === "working" ||
                      activeStemStatus !== "ready"
                    }
                    className={getActionButtonClass(
                      activeStemStatus !== "ready"
                        ? "disabled"
                        : getActionState("renderMix"),
                      "justify-center"
                    )}
                  >
                    {getActionStatusLabel(
                      getActionState("renderMix"),
                      { working: "Rendering...", success: "Done", error: "Error" },
                      "Render mix"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void previewRenderForActiveVersion()}
                    disabled={
                      getActionState("previewRender") === "working" ||
                      activeStemStatus !== "ready" ||
                      previewMode === "off"
                    }
                    className={getActionButtonClass(
                      activeStemStatus !== "ready" || previewMode === "off"
                        ? "disabled"
                        : getActionState("previewRender"),
                      "justify-center"
                    )}
                  >
                    {getActionStatusLabel(
                      getActionState("previewRender"),
                      { working: "Rendering...", success: "Ready", error: "Error" },
                      "Preview render"
                    )}
                  </button>
                </div>
              </div>
              {activeStemStatus !== "ready" ? (
                <div className="mt-3 text-xs font-semibold text-white/62">
                  Prepare stems before rendering a mix.
                </div>
              ) : null}
              {previewRenderUrl ? (
                <div className="mt-4 rounded-2xl border border-cyan-200/18 bg-cyan-300/8 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                    Temporary Preview
                  </div>
                  <audio className="mt-3 w-full" controls src={previewRenderUrl}>
                    Your browser does not support audio playback.
                  </audio>
                </div>
              ) : null}
            </div>

            <div className="hidden rounded-[24px] border border-fuchsia-200/18 bg-black/18 p-4">
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  AI CO-PRODUCER PRESETS
                </div>
                <div className="mt-1 text-xs text-white/68">
                  Smart DSP/mixer transformations. No Replicate job starts until you choose Preview render or Render mix.
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {coProducerPresets.map((preset, index) => {
                  const selected = activeCoProducerPreset === preset.name;

                  return (
                    <button
                      key={`${preset.name}-${index}`}
                      type="button"
                      onClick={() => applyCoProducerPreset(preset.name)}
                      className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                        selected
                          ? "border-fuchsia-100/65 bg-fuchsia-300/22 text-white shadow-[0_0_24px_rgba(217,70,239,0.28)] ring-1 ring-fuchsia-200/35"
                          : "border-white/10 bg-white/7 text-white/82 hover:border-fuchsia-200/35 hover:bg-fuchsia-300/10"
                      }`}
                    >
                      <span className="block">{preset.name}</span>
                      <span className="mt-1 block text-[11px] font-medium text-white/60">
                        {preset.summary}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeCoProducerPreset ? (
                <div className="mt-3 rounded-2xl border border-fuchsia-200/18 bg-fuchsia-300/10 px-3 py-2 text-xs font-semibold text-fuchsia-50">
                  {activeCoProducerPreset} preset active. Render manually when ready.
                </div>
              ) : null}
            </div>

            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    PREVIEW MODE
                  </div>
                  <div className="mt-1 text-xs text-white/68">
                    Fast preview renders use a short middle segment and ignore Loop/Extend.
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                  {([
                    ["off", "Off"],
                    ["10", "10s Preview"],
                    ["20", "20s Preview"],
                  ] as Array<[PreviewMode, string]>).map(([value, label]) => {
                    const selected = previewMode === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updatePreviewMode(value)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          selected
                            ? "bg-sky-300 text-slate-950 ring-1 ring-sky-100/70"
                            : "border border-white/12 bg-white/7 text-white/76 hover:bg-white/12"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    LOOP
                  </div>
                  <div className="mt-1 text-xs text-white/68">
                    Render a short loopable edit from the start of the active version.
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {([
                    ["off", "Off"],
                    ["15", "15s loop"],
                    ["30", "30s loop"],
                    ["60", "60s loop"],
                  ] as Array<[LoopMode, string]>).map(([value, label]) => {
                    const selected = mixer.loopMode === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateLoopMode(value)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          selected
                            ? "bg-sky-300 text-slate-950 ring-1 ring-sky-100/70"
                            : "border border-white/12 bg-white/7 text-white/76 hover:bg-white/12"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    EXTEND
                  </div>
                  <div className="mt-1 text-xs text-white/68">
                    Extend v0 repeats the ending with a crossfade. AI continuation comes later.
                  </div>
                  {mixer.loopMode !== "off" && mixer.extendMode !== "off" ? (
                    <div className="mt-1 text-xs font-semibold text-amber-100">
                      Loop mode is enabled, so Extend is ignored for this render.
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {([
                    ["off", "Off"],
                    ["15", "Extend 15s"],
                    ["30", "Extend 30s"],
                    ["60", "Extend 60s"],
                  ] as Array<[ExtendMode, string]>).map(([value, label]) => {
                    const selected = mixer.extendMode === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateExtendMode(value)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          selected
                            ? "bg-sky-300 text-slate-950 ring-1 ring-sky-100/70"
                            : "border border-white/12 bg-white/7 text-white/76 hover:bg-white/12"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mb-4 rounded-2xl border border-cyan-200/12 bg-cyan-300/8 p-3 text-xs text-cyan-50/78">
                <span className="font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  Sub Bass
                </span>
                <span className="ml-2">
                  Adds deep low-end punch for car/subwoofer-style bass.
                </span>
              </div>
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    NORMALIZE
                  </div>
                  <div className="mt-1 text-xs text-white/68">
                    Off preserves the source tone. Turn on only when you need a louder mastered render.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateMasterNormalize(!mixer.masterNormalize)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    mixer.masterNormalize
                      ? "bg-sky-300 text-slate-950 ring-1 ring-sky-100/70"
                      : "border border-white/12 bg-white/7 text-white/76 hover:bg-white/12"
                  }`}
                >
                  {mixer.masterNormalize ? "Normalize on" : "Normalize off"}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                {([
                  ["drums", "Drums"],
                  ["bass", "Bass"],
                  ["music", "Music"],
                  ["vocal", "Vocal"],
                  ["voiceover", "Voiceover"],
                  ["fx", "FX / Ambience"],
                  ["master", "Master"],
                  ["speed", "SPEED"],
                  ["pitch", "PITCH"],
                  ["subBass", "SUB BASS"],
                ] as Array<[FaderKey, string]>).map(([key, label]) => (
                  <Fader
                    key={key}
                    label={label}
                    value={mixer[key]}
                    muted={muted[key]}
                    soloed={soloed[key]}
                    min={key === "speed" ? 70 : key === "pitch" ? -12 : 0}
                    max={key === "speed" ? 130 : key === "pitch" ? 12 : 100}
                    displayValue={
                      key === "speed"
                        ? `${mixer[key]}%`
                        : key === "pitch"
                          ? `${mixer[key] > 0 ? "+" : ""}${mixer[key]} st`
                          : key === "subBass"
                            ? `${mixer[key]}%`
                            : undefined
                    }
                    showMuteSolo={key !== "speed" && key !== "pitch" && key !== "subBass"}
                    onChange={(value) => updateFader(key, value)}
                    onMute={() => toggleMute(key)}
                    onSolo={() => toggleSolo(key)}
                  />
                ))}
                {([
                  ["fadeIn", "Fade In"],
                  ["fadeOut", "Fade Out"],
                ] as Array<[DynamicsKey, string]>).map(([key, label]) => (
                  <Fader
                    key={key}
                    label={label}
                    value={dynamics[key]}
                    muted={false}
                    soloed={false}
                    showMuteSolo={false}
                    onChange={(value) => updateDynamics(key, value)}
                    onMute={() => {}}
                    onSolo={() => {}}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-sky-300/18 bg-sky-400/8 px-4 py-3 text-sm text-white">
              Current mixer shape: {mixerSummary}
            </div>
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  LYRICS
                </div>
                <div className="mt-1 text-base font-semibold text-white">
                  Work lyrics separately from voiceover
                </div>
              </div>

              <div className="space-y-4">
                <textarea
                  value={lyricsPrompt}
                  onChange={(event) => setLyricsPrompt(event.target.value)}
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder="Lyrics prompt"
                />

                <button
                  type="button"
                  onClick={() => void handleLyricsAction("generate")}
                  disabled={coProducerLoading.lyrics || coProducerRemaining <= 0}
                  className={`${primaryButtonClass} w-full justify-center px-4 py-2.5 text-sm sm:w-auto`}
                >
                  {coProducerLoading.lyrics ? "Generating..." : "Generate lyrics"}
                </button>
                <div className="text-xs font-semibold text-white/70">
                  This creates editable lyrics. Singing vocals are generated separately.
                </div>

                <textarea
                  value={lyricsPreview}
                  onChange={(event) => setLyricsPreview(event.target.value)}
                  rows={7}
                  className={`${inputClass} resize-none`}
                  placeholder="Generated lyrics preview"
                />

                <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Improve hook", "Edit the current lyrics to make the hook shorter, stronger, and more repeatable. Return edited lyrics text only."],
                      ["Make more emotional", "Edit the current lyrics to make them more emotional, specific, and singable. Return edited lyrics text only."],
                      ["Rewrite chorus", "Rewrite the chorus for a stronger payoff while preserving useful verse lines. Return edited lyrics text only."],
                      ["Make Estonian more natural", "If the lyrics are Estonian, make them more natural, idiomatic, and singable. Return edited lyrics text only."],
                      ["Shorten lyrics", "Shorten the current lyrics while preserving the hook and emotional meaning. Return edited lyrics text only."],
                      ["Add stronger final chorus", "Add or improve a stronger final chorus with a clearer emotional lift. Return edited lyrics text only."],
                    ].map(([label, request]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => void requestLyricsHelp(request)}
                        disabled={coProducerLoading.lyrics || coProducerRemaining <= 0}
                        className={`${secondaryButtonClass} h-11 min-w-0 justify-center px-3 text-xs`}
                      >
                        {coProducerLoading.lyrics ? "Working..." : label}
                      </button>
                    ))}
                  </div>

                  {lyricsHelpSuggestion ? (
                    <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-2xl border border-sky-200/25 bg-sky-400/10 p-3">
                      <div className="max-w-full whitespace-pre-wrap break-words text-sm text-white/86">
                        {lyricsHelpSuggestion}
                      </div>
                      <button
                        type="button"
                        onClick={applyLyricsHelpSuggestion}
                        className={`${primaryButtonClass} mt-3 w-full justify-center py-2 text-xs`}
                      >
                        Apply
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  VOICEOVER
                </div>
                <div className="mt-1 text-base font-semibold text-white">
                  Build spoken narration independently
                </div>
              </div>

              <div className="space-y-4">
                <textarea
                  value={voiceoverScript}
                  onChange={(event) => setVoiceoverScript(event.target.value)}
                  rows={5}
                  className={`${inputClass} resize-none`}
                  placeholder="Voiceover script"
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-white">Voice style</div>
                    <select
                      value={voiceStyle}
                      onChange={(event) => setVoiceStyle(event.target.value as VoiceStyle)}
                      className={inputClass}
                    >
                      <option value="cinematic">Cinematic</option>
                      <option value="warm">Warm</option>
                      <option value="broadcast">Broadcast</option>
                      <option value="trailer">Trailer</option>
                      <option value="intimate">Intimate</option>
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-white">Delivery</div>
                    <select
                      value={voiceDelivery}
                      onChange={(event) => setVoiceDelivery(event.target.value as VoiceDelivery)}
                      className={inputClass}
                    >
                      <option value="steady">Steady</option>
                      <option value="dramatic">Dramatic</option>
                      <option value="soft">Soft</option>
                      <option value="urgent">Urgent</option>
                      <option value="measured">Measured</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void handleVoiceoverAction("generate")}
                    disabled={coProducerLoading.voiceover || coProducerRemaining <= 0}
                    className={`${primaryButtonClass} h-11 w-full justify-center`}
                  >
                    {coProducerLoading.voiceover ? "Generating..." : "Generate voiceover"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleVoiceoverAction("warmer")}
                    disabled={coProducerLoading.voiceover || coProducerRemaining <= 0}
                    className={`${secondaryButtonClass} h-11 w-full justify-center`}
                  >
                    Make warmer
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleVoiceoverAction("dramatic")}
                    disabled={coProducerLoading.voiceover || coProducerRemaining <= 0}
                    className={`${secondaryButtonClass} h-11 w-full justify-center`}
                  >
                    Make more dramatic
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleVoiceoverAction("shorter")}
                    disabled={coProducerLoading.voiceover || coProducerRemaining <= 0}
                    className={`${secondaryButtonClass} h-11 w-full justify-center`}
                  >
                    Shorter spoken intro
                  </button>
                </div>
              </div>
            </div>
          </div>

          <section className={sectionClass}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  CO-PRODUCER AI
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Real-time creator guidance
                </div>
                <div className="mt-2 text-xs font-semibold text-white">
                  {coProducerRemaining === 1
                    ? "1 action left — upgrade for more co-producer help"
                    : `${coProducerRemaining} of ${MAX_CO_PRODUCER_ACTIONS} actions remaining`}
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                AI Online
              </div>
            </div>

              {coProducerPanelContent}
          </section>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                      STUDIO PROJECTS
                    </div>
                    <div className="mt-1 text-sm text-white/72">
                      Your saved Studio projects, drafts, review states, and published Studio releases.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadStudioDrafts()}
                    disabled={studioDraftsLoading}
                    className={secondaryButtonClass}
                  >
                    {studioDraftsLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {studioDraftsLoading ? (
                    <div className="rounded-xl border border-white/10 bg-black/18 px-3 py-3 text-sm text-white/72">
                      Loading drafts...
                    </div>
                  ) : studioDraftGroups.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/18 px-3 py-3 text-sm text-white/72">
                      No Studio drafts saved yet.
                    </div>
                  ) : (
                    studioDraftGroups.map((group) => {
                      const draft = group.latestDraft;
                      const openableDraft =
                        group.drafts.find((candidate) => candidate.source_track_group_id) || draft;
                      const expanded = Boolean(expandedDraftGroups[group.id]);
                      const projectReviewDisabled = isStudioDraftReviewActionDisabled(group.status);
                      const isProjectActive =
                        group.id === activeTrackGroupId ||
                        group.id === activeVersion.trackGroupId ||
                        group.drafts.some((candidate) =>
                          isStudioDraftActive(candidate, activeVersion, activeVersionId, activeTrackGroupId)
                        );
                      const savedGroupProjectName = studioProjectNames[group.id]?.trim();
                      const fallbackReleaseTitle = draft.title || "Untitled Studio project";
                      const displayProjectName = savedGroupProjectName || fallbackReleaseTitle;
                      const deletableTrackGroupId =
                        group.drafts.find((candidate) => candidate.source_track_group_id)
                          ?.source_track_group_id || null;

                      return (
                      <div
                        key={group.id}
                        className={`rounded-xl border px-3 py-3 ${
                          isProjectActive
                            ? "border-cyan-100/60 bg-cyan-400/16 shadow-[0_0_30px_rgba(56,189,248,0.24)] ring-1 ring-cyan-200/35"
                            : group.status === "Ready for review"
                            ? "border-emerald-200/35 bg-emerald-400/10"
                            : group.status === "Approved"
                              ? "border-blue-200/35 bg-blue-400/10"
                            : group.status === "Rejected"
                              ? "border-rose-200/35 bg-rose-400/10"
                            : group.status === "Published"
                              ? "border-cyan-200/35 bg-cyan-400/10"
                            : "border-white/10 bg-black/18"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold text-white">
                                {displayProjectName}
                              </div>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStudioDraftStatusBadgeClass(
                                  group.status
                                )}`}
                              >
                                {group.status}
                              </span>
                              {isProjectActive ? (
                                <span className="rounded-full border border-cyan-100/45 bg-cyan-300/18 px-2 py-0.5 text-[11px] font-semibold text-cyan-50 shadow-[0_0_18px_rgba(125,211,252,0.25)]">
                                  Open
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-white/68">
                              <span>{draft.artist || "Unknown artist"}</span>
                              <span>{draft.genre || "No genre"}</span>
                              <span>{group.latestCreatedAt ? formatVersionDate(group.latestCreatedAt) : "No date"}</span>
                              <span>
                                {group.drafts.length === 1
                                  ? "1 saved draft"
                                  : `${group.drafts.length} saved drafts`}
                              </span>
                              <span>{draft.audio_url ? "Audio ready" : "Audio missing"}</span>
                              <span>{group.status}</span>
                              <span>Release: {draft.title || "Untitled draft"}</span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void openStudioProjectDraft(openableDraft)}
                              className={`${secondaryButtonClass} justify-center`}
                            >
                              {isProjectActive ? "Opened" : "Open project"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (projectReviewDisabled) return;
                                setPublicReviewMessage(null);
                                setPublicReviewDraft(draft);
                              }}
                              disabled={projectReviewDisabled}
                              className={`${secondaryButtonClass} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              {getStudioDraftReviewButtonLabel(group.status)}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleDraftGroup(group.id)}
                              className={`${secondaryButtonClass} justify-center`}
                            >
                              {expanded ? "Collapse" : "Expand"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!deletableTrackGroupId) return;
                                setPendingDeleteStudioProject({
                                  trackGroupId: deletableTrackGroupId,
                                  projectName: displayProjectName,
                                });
                              }}
                              disabled={!deletableTrackGroupId}
                              className={`${secondaryButtonClass} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                            {group.drafts.map((childDraft) => {
                              const childStatus = getStudioDraftStatus(childDraft);
                              const childReviewDisabled = isStudioDraftReviewActionDisabled(childStatus);
                              const isChildActive = isStudioDraftActive(
                                childDraft,
                                activeVersion,
                                activeVersionId,
                                activeTrackGroupId
                              );

                              return (
                                <div
                                  key={childDraft.id}
                                  className={`rounded-xl border px-3 py-3 ${
                                    isChildActive
                                      ? "border-cyan-100/55 bg-cyan-400/14 shadow-[0_0_22px_rgba(56,189,248,0.2)] ring-1 ring-cyan-200/30"
                                    : childStatus === "Ready for review"
                                      ? "border-emerald-200/25 bg-emerald-400/8"
                                      : childStatus === "Approved"
                                        ? "border-blue-200/25 bg-blue-400/8"
                                      : childStatus === "Rejected"
                                        ? "border-rose-200/25 bg-rose-400/8"
                                      : childStatus === "Published"
                                        ? "border-cyan-200/25 bg-cyan-400/8"
                                      : "border-white/10 bg-black/18"
                                  }`}
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="truncate text-sm font-semibold text-white">
                                          {childDraft.title || "Untitled draft"}
                                        </div>
                                        <span
                                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStudioDraftStatusBadgeClass(
                                            childStatus
                                          )}`}
                                        >
                                          {childStatus}
                                        </span>
                                        {isChildActive ? (
                                          <span className="rounded-full border border-cyan-100/45 bg-cyan-300/18 px-2 py-0.5 text-[11px] font-semibold text-cyan-50">
                                            Open
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-white/68">
                                        <span>{childDraft.artist || "Unknown artist"}</span>
                                        <span>{childDraft.genre || "No genre"}</span>
                                        <span>
                                          {childDraft.created_at
                                            ? formatVersionDate(childDraft.created_at)
                                            : "No date"}
                                        </span>
                                        <span>{childDraft.audio_url ? "Audio ready" : "Audio missing"}</span>
                                        <span>{childStatus}</span>
                                      </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (childReviewDisabled) return;
                                          setPublicReviewMessage(null);
                                          setPublicReviewDraft(childDraft);
                                        }}
                                        disabled={childReviewDisabled}
                                        className={`${secondaryButtonClass} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
                                      >
                                        {getStudioDraftReviewButtonLabel(childStatus)}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void previewStudioDraft(childDraft)}
                                        className={`${secondaryButtonClass} justify-center`}
                                      >
                                        Preview
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void openStudioProjectDraft(childDraft)}
                                        className={`${secondaryButtonClass} justify-center`}
                                      >
                                        {isChildActive ? "Opened" : "Open project"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>


          <aside className={sectionClass}>
            <button
              type="button"
              onClick={() => setVersionsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <div className="text-xs font-semibold tracking-[0.2em] text-white">VERSIONS</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Version history
                </div>
                <div className="mt-2 text-sm font-semibold text-sky-50">
                  Project: {getProjectNameFallback()}
                </div>
                <div className="mt-2 text-sm text-white/82">
                  Original stays intact while each branch becomes a selectable track version.
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {activeTrackGroupId ? (
                  <div className="hidden rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-white/80 sm:block">
                    Track group: {activeTrackGroupId}
                  </div>
                ) : null}
                <div className="rounded-full border border-white/10 bg-white/7 px-4 py-2 text-sm font-semibold text-white/82">
                  {versionsOpen ? "Hide" : "Version history"}
                </div>
              </div>
            </button>

            <div
              className={`relative mt-4 space-y-3 overflow-hidden transition-all duration-300 before:absolute before:bottom-4 before:left-[18px] before:top-4 before:w-px before:bg-sky-100/18 ${
                versionsOpen ? "max-h-[1400px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {displayedVersions.map((version, index) => {
                const isActive = version.id === activeVersionId;
                const generationType = getVersionGenerationType(version);
                const versionNumber = getVersionNumber(version, index);
                const createdLabel = version.createdAt ? formatVersionDate(version.createdAt) : "Draft";
                const durationLabel =
                  typeof version.duration === "number" ? `${version.duration}s` : "Duration pending";
                const parentLabel = getCreatedFromLabel(version, versions);

                const isOriginalVersion =
                  version.isOriginal || version.label.toLowerCase() === "original";

                return (
                  <div
                    key={version.id}
                    onClick={() => selectVersion(version)}
                    className={`group relative grid w-full cursor-pointer grid-cols-[36px_1fr] gap-3 rounded-2xl border px-3 py-3 text-left transition sm:px-4 ${
                      isActive
                        ? "border-sky-100/60 bg-sky-300/22 text-white shadow-[0_0_28px_rgba(125,211,252,0.34)]"
                        : "border-white/10 bg-black/20 text-white/84 hover:border-sky-200/30 hover:bg-black/28"
                    }`}
                  >
                    <span
                      className={`relative z-10 mt-1 flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold ${
                        isActive
                          ? "border-sky-100 bg-sky-300 text-slate-950"
                          : "border-white/12 bg-black/40 text-white group-hover:border-sky-200/40"
                      }`}
                    >
                      {versionNumber}
                    </span>

                    <span className="min-w-0">
                      <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-white">
                            {version.title}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-white/70">
                            {version.label} • {parentLabel}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getVersionBadgeClass(
                              generationType
                            )}`}
                          >
                            {generationType}
                          </span>
                          {isOriginalVersion ? (
                            <span className="rounded-full border border-emerald-200/35 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                              Original protected
                            </span>
                          ) : null}
                          {isActive ? (
                            <span className="rounded-full border border-sky-100/40 bg-sky-300/18 px-2.5 py-1 text-[11px] font-semibold text-sky-50">
                              Active
                            </span>
                          ) : null}
                        </span>
                      </span>

                      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-white/72">
                        <span>Version {versionNumber}</span>
                        <span>{durationLabel}</span>
                        <span>{createdLabel}</span>
                        {version.provider ? <span>{version.provider}</span> : null}
                        {!version.audioUrl ? <span>This version has no audio.</span> : null}
                      </span>
                      <span className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            restoreVersion(version);
                          }}
                          className={`${secondaryButtonClass} justify-center`}
                        >
                          Restore Version
                        </button>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
