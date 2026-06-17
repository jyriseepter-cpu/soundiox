"use client";

import { useEffect, useRef, useState, useMemo, type PointerEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRealtimeMixPreview } from "@/lib/useRealtimeMixPreview";
import { isSoundioXGenre } from "@/lib/genres";

type StemStatus = "not_started" | "queued" | "processing" | "ready" | "error";
type LoopMode = "off" | "15" | "30" | "60";
type ExtendMode = "off" | "15" | "30" | "60";
type ArrangementLoopMode = "off" | "15" | "30" | "section";
type EffectStrength = "subtle" | "normal" | "strong";
type ArrangementSectionName = "Intro" | "Verse" | "Chorus" | "Drop" | "Bridge" | "Outro";
type ArrangementSection = {
  name: ArrangementSectionName;
  length: number;
  intensity: number;
};
type ArrangementBranch = {
  name: string;
  timestamp: string;
  badges: string[];
};
type PendingArrangementChange = {
  id: string;
  label: string;
  chip: string;
  diff: string;
  status: string;
  branch?: string;
  renderType?: "loop-section" | "extend-chorus" | "shorten-intro" | "instrumental" | "radio-edit";
};
type ArrangementSuccessToast = {
  versionId: string;
  title: string;
  subtitle: string;
};
type ArrangementRenderError = {
  message: string;
  actionName: string;
  selectedSection: ArrangementSectionName;
  activeVersionId: string | null;
  trackGroupId: string | null;
  hasAudioUrl: boolean;
  stemsReady: boolean;
  backendStatus: number | "not_sent" | null;
  backendBody: unknown;
};
type PresetName =
  | "Car Bass"
  | "Club Mix"
  | "DnB Energy"
  | "House Groove"
  | "Retail Background"
  | "Vocal Focus"
  | "TikTok Punch"
  | "Cinematic"
  | "Lo-Fi"
  | "Clean Master"
  | "Auto Clean"
  | "Radio Ready"
  | "Remove Mud"
  | "Tame Harshness"
  | "Vocal Clarity"
  | "Upload Safe Master";

type MixerState = {
  drums: number;
  bass: number;
  vocal: number;
  music: number;
  voiceover: number;
  fx: number;
  master: number;
  speed: number;
  pitch: number;
  subBass: number;
  overdrive: number;
  punch: number;
  stereoWidth: number;
  stereoBalance: number;
  monoSafe: number;
  harshnessReduction: number;
  effectStrength: EffectStrength;
  air: number;
  warmth: number;
  compression: number;
  loudness: number;
  saturation: number;
  limiter: number;
  clipSafe: number;
  analogFeel: number;
  dnbFeel: number;
  houseFeel: number;
  clubEnergy: number;
  masterNormalize: boolean;
  loopMode: LoopMode;
  extendMode: ExtendMode;
  previewMode: "off" | "10" | "20";
  overdriveMode: "Clean" | "Tube" | "Hard";
};

type StudioVersion = {
  id: string;
  parentVersionId?: string | null;
  rootVersionId?: string | null;
  trackGroupId: string | null;
  title: string;
  label: string;
  audioUrl: string | null;
  artworkUrl?: string | null;
  provider: string | null;
  duration: number | null;
  versionNumber: number | null;
  isOriginal?: boolean | null;
  createdAt: string | null;
  stemsStatus: StemStatus;
  stemsRequestedAt?: string | null;
  stemsCompletedAt?: string | null;
  stemsError: string | null;
  stemDrumsUrl: string | null;
  stemBassUrl: string | null;
  stemVocalsUrl: string | null;
  stemOtherUrl: string | null;
  stemsMetadata: unknown | null;
  metadata?: unknown | null;
  importMetadata?: unknown | null;
};

type StudioProject = {
  id: string;
  title: string;
  artist: string | null;
  genre: string | null;
  trackGroupId: string | null;
  trackVersionId: string | null;
  sourceTrackGroupId?: string | null;
  sourceTrackVersionId?: string | null;
  audioUrl: string | null;
  createdAt: string | null;
  source: "pro" | "studio";
  sourceLabel: string;
};

type StudioProReport = {
  reportId: string;
  trackTitle: string;
  activeVersionId: string;
  trackGroupId: string | null;
  renderedAt: string;
  source: "Studio PRO";
  humanDirectedEdit: "yes";
  activePreset: string | null;
  dspChain: Record<string, unknown>;
  dspChainSummary: string;
  stemsStatus: StemStatus;
  exportedAudioUrl: string;
  metadataSource: string;
  disclaimer: string;
};

type ExportWorkflowStatus = "Ready to export" | "Rendering" | "Export ready" | "Failed";
type SubmitWorkflowStatus = "Ready to submit" | "Submitting" | "Submitted" | "Failed";

const PRO_REPORT_DISCLAIMER =
  "This report documents the SoundioX Studio PRO processing chain. It is not a legal copyright registration or ownership guarantee.";
const STUDIO_PRO_VERSION_SELECT =
  "id,parent_version_id,root_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,audio_url,artwork_url,duration,is_original,created_at,stems_status,stems_requested_at,stems_completed_at,stems_error,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata,import_metadata";
const STUDIO_PRO_VERSION_SELECT_WITHOUT_ROOT =
  "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,audio_url,artwork_url,duration,is_original,created_at,stems_status,stems_requested_at,stems_completed_at,stems_error,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata,import_metadata";

const initialMixer: MixerState = {
  drums: 100,
  bass: 100,
  vocal: 100,
  music: 100,
  voiceover: 50,
  fx: 42,
  master: 70,
  speed: 100,
  pitch: 0,
  subBass: 0,
  overdrive: 0,
  punch: 0,
  stereoWidth: 34,
  stereoBalance: 0,
  monoSafe: 0,
  harshnessReduction: 0,
  effectStrength: "normal",
  air: 18,
  warmth: 20,
  compression: 18,
  loudness: 12,
  saturation: 8,
  limiter: 25,
  clipSafe: 45,
  analogFeel: 12,
  dnbFeel: 0,
  houseFeel: 0,
  clubEnergy: 0,
  masterNormalize: false,
  loopMode: "off",
  extendMode: "off",
  previewMode: "off",
  overdriveMode: "Clean",
};

const presets: Array<{ name: PresetName; mixer: Partial<MixerState> }> = [
  { name: "Car Bass", mixer: { bass: 110, music: 98, subBass: 65, punch: 45, warmth: 24, loudness: 18, compression: 24, limiter: 50, clipSafe: 60, analogFeel: 14, stereoWidth: 34, masterNormalize: true } },
  { name: "Club Mix", mixer: { drums: 112, bass: 108, vocal: 100, music: 104, speed: 110, subBass: 34, punch: 45, loudness: 35, compression: 34, saturation: 12, limiter: 45, clipSafe: 58, stereoWidth: 55, clubEnergy: 60, masterNormalize: true } },
  { name: "DnB Energy", mixer: { drums: 116, bass: 110, vocal: 96, music: 104, speed: 118, subBass: 55, punch: 55, compression: 45, loudness: 28, saturation: 10, limiter: 50, clipSafe: 60, stereoWidth: 54, dnbFeel: 65, air: 42, warmth: 12, masterNormalize: true } },
  { name: "House Groove", mixer: { drums: 112, bass: 108, vocal: 98, music: 102, speed: 110, subBass: 28, punch: 38, compression: 35, loudness: 26, saturation: 8, limiter: 42, clipSafe: 56, analogFeel: 22, houseFeel: 60, warmth: 40, stereoWidth: 55, masterNormalize: true } },
  { name: "Retail Background", mixer: { drums: 82, bass: 84, vocal: 78, music: 96, fx: 58, stereoWidth: 44, compression: 14, loudness: 8, limiter: 22, clipSafe: 60, masterNormalize: false } },
  { name: "Vocal Focus", mixer: { vocal: 116, music: 90, drums: 94, bass: 92, air: 32, warmth: 28, compression: 32, loudness: 18, limiter: 38, clipSafe: 58, stereoWidth: 26 } },
  { name: "TikTok Punch", mixer: { drums: 114, bass: 108, vocal: 106, music: 104, speed: 106, subBass: 38, punch: 50, loudness: 34, compression: 42, saturation: 10, limiter: 48, clipSafe: 60, clubEnergy: 55, masterNormalize: true } },
  { name: "Cinematic", mixer: { drums: 88, bass: 104, vocal: 90, music: 114, fx: 72, speed: 99, pitch: -1, subBass: 30, stereoWidth: 62, warmth: 34, air: 48, compression: 22, loudness: 12, limiter: 32, clipSafe: 55, analogFeel: 22 } },
  { name: "Lo-Fi", mixer: { drums: 84, bass: 92, vocal: 88, music: 90, speed: 94, pitch: -1, air: 2, warmth: 58, overdrive: 6, compression: 14, loudness: 4, saturation: 12, limiter: 24, clipSafe: 58, analogFeel: 44, stereoWidth: 24, masterNormalize: false } },
  { name: "Clean Master", mixer: { drums: 100, bass: 98, vocal: 102, music: 100, subBass: 0, overdrive: 0, punch: 18, stereoWidth: 48, air: 24, warmth: 16, compression: 32, loudness: 22, saturation: 4, limiter: 45, clipSafe: 60, analogFeel: 6, masterNormalize: true } },
];

const beforeUploadMasteringPresets: Array<{ name: PresetName; mixer: Partial<MixerState> }> = [
  {
    name: "Auto Clean",
    mixer: {
      drums: 100,
      bass: 96,
      vocal: 104,
      music: 100,
      subBass: 0,
      punch: 16,
      stereoWidth: 42,
      air: 20,
      warmth: 12,
      compression: 24,
      loudness: 16,
      saturation: 2,
      limiter: 36,
      clipSafe: 62,
      analogFeel: 4,
      masterNormalize: true,
    },
  },
  {
    name: "Radio Ready",
    mixer: {
      drums: 104,
      bass: 102,
      vocal: 104,
      music: 102,
      subBass: 12,
      punch: 30,
      stereoWidth: 48,
      air: 28,
      warmth: 18,
      compression: 42,
      loudness: 34,
      saturation: 5,
      limiter: 58,
      clipSafe: 68,
      analogFeel: 8,
      masterNormalize: true,
    },
  },
  {
    name: "Remove Mud",
    mixer: {
      drums: 100,
      bass: 92,
      vocal: 104,
      music: 98,
      subBass: 0,
      punch: 22,
      stereoWidth: 40,
      air: 26,
      warmth: 4,
      compression: 26,
      loudness: 14,
      saturation: 1,
      limiter: 34,
      clipSafe: 64,
      analogFeel: 2,
      masterNormalize: true,
    },
  },
  {
    name: "Tame Harshness",
    mixer: {
      drums: 98,
      bass: 102,
      vocal: 100,
      music: 96,
      subBass: 6,
      punch: 14,
      stereoWidth: 36,
      air: 6,
      warmth: 34,
      compression: 22,
      loudness: 10,
      saturation: 3,
      limiter: 36,
      clipSafe: 68,
      analogFeel: 14,
      masterNormalize: false,
    },
  },
  {
    name: "Vocal Clarity",
    mixer: {
      drums: 96,
      bass: 94,
      vocal: 114,
      music: 90,
      subBass: 2,
      punch: 18,
      stereoWidth: 34,
      air: 34,
      warmth: 26,
      compression: 32,
      loudness: 18,
      saturation: 3,
      limiter: 42,
      clipSafe: 64,
      analogFeel: 8,
      masterNormalize: true,
    },
  },
  {
    name: "Upload Safe Master",
    mixer: {
      drums: 100,
      bass: 100,
      vocal: 102,
      music: 100,
      subBass: 4,
      overdrive: 0,
      punch: 18,
      stereoWidth: 40,
      air: 18,
      warmth: 14,
      compression: 30,
      loudness: 24,
      saturation: 0,
      limiter: 62,
      clipSafe: 72,
      analogFeel: 3,
      masterNormalize: true,
      overdriveMode: "Clean",
    },
  },
];

const quickMasterActions: Array<{ label: string; mixer: Partial<MixerState>; status: string }> = [
  {
    label: "Make Louder",
    mixer: { loudness: 30, compression: 34, limiter: 56, clipSafe: 68, masterNormalize: true },
    status: "Louder master curve applied.",
  },
  {
    label: "Wider Stereo",
    mixer: { stereoWidth: 62, air: 26, limiter: 42, clipSafe: 62 },
    status: "Wider stereo image applied.",
  },
  {
    label: "Cleaner Vocals",
    mixer: { vocal: 112, music: 92, air: 30, warmth: 22, compression: 30, limiter: 42, clipSafe: 64 },
    status: "Cleaner vocal focus applied.",
  },
  {
    label: "Club Punch",
    mixer: { drums: 108, bass: 106, punch: 42, subBass: 34, compression: 36, loudness: 28, limiter: 54, clipSafe: 68 },
    status: "Club punch added with safe gain staging.",
  },
  {
    label: "Warm Analog",
    mixer: { warmth: 42, analogFeel: 34, saturation: 8, air: 12, overdrive: 4, limiter: 38, clipSafe: 66, overdriveMode: "Tube" },
    status: "Warm analog tone applied.",
  },
  {
    label: "Mono Safe",
    mixer: { stereoWidth: 0, stereoBalance: 0, monoSafe: 100, harshnessReduction: 16, limiter: 42, clipSafe: 72 },
    status: "Mono-safe center image applied.",
  },
  {
    label: "Center Stereo",
    mixer: { stereoWidth: 24, stereoBalance: 0, monoSafe: 72, limiter: 38, clipSafe: 68 },
    status: "Stereo image centered.",
  },
  {
    label: "Tame Cymbals",
    mixer: { air: 0, harshnessReduction: 76, saturation: 0, stereoWidth: 30, limiter: 44, clipSafe: 72 },
    status: "Cymbal harshness reduced.",
  },
  {
    label: "Reduce Harsh Hats",
    mixer: { air: 0, harshnessReduction: 100, stereoWidth: 24, monoSafe: 28, saturation: 0, limiter: 48, clipSafe: 76 },
    status: "Sharp hi-hat splash reduced.",
  },
  {
    label: "Wider Balanced",
    mixer: { stereoWidth: 50, stereoBalance: 0, monoSafe: 12, air: 20, limiter: 42, clipSafe: 68 },
    status: "Balanced width applied with stable center.",
  },
];

const initialArrangementSections: ArrangementSection[] = [
  { name: "Intro", length: 16, intensity: 28 },
  { name: "Verse", length: 32, intensity: 48 },
  { name: "Chorus", length: 32, intensity: 72 },
  { name: "Drop", length: 24, intensity: 88 },
  { name: "Bridge", length: 16, intensity: 44 },
  { name: "Outro", length: 16, intensity: 30 },
];

const initialArrangementBranches: ArrangementBranch[] = [
  { name: "Original", timestamp: "Source", badges: ["Protected"] },
  { name: "Club Edit", timestamp: "Local", badges: ["Energy"] },
  { name: "Radio Edit", timestamp: "Local", badges: ["Short"] },
  { name: "Cinematic Edit", timestamp: "Local", badges: ["Wide"] },
  { name: "Instrumental", timestamp: "Local", badges: ["Staged"] },
  { name: "Extended Mix", timestamp: "Local", badges: ["Long"] },
];

const arrangementActions: Array<{
  label: string;
  chip: string;
  diff: string;
  status: string;
  branch?: string;
  renderType?: "loop-section" | "extend-chorus" | "shorten-intro" | "instrumental" | "radio-edit";
  apply: (sections: ArrangementSection[]) => ArrangementSection[];
}> = [
  {
    label: "Add Drop",
    chip: "+ Drop",
    diff: "Add Drop transition",
    status: "Drop extension added locally.",
    branch: "Club Edit",
    apply: (sections) => sections.map((section) => section.name === "Drop" ? { ...section, length: section.length + 16, intensity: 96 } : section),
  },
  {
    label: "Extend Chorus",
    chip: "Extended Chorus",
    diff: "Chorus extended by 15s",
    status: "Chorus extended in arrangement preview.",
    branch: "Extended Mix",
    renderType: "extend-chorus",
    apply: (sections) => sections.map((section) => section.name === "Chorus" ? { ...section, length: section.length + 16, intensity: Math.min(100, section.intensity + 8) } : section),
  },
  {
    label: "Shorten Intro",
    chip: "Short Intro",
    diff: "Intro shortened by 8s",
    status: "Intro shortened for a faster start.",
    branch: "Radio Edit",
    renderType: "shorten-intro",
    apply: (sections) => sections.map((section) => section.name === "Intro" ? { ...section, length: Math.max(8, section.length - 8), intensity: Math.min(100, section.intensity + 8) } : section),
  },
  {
    label: "Radio Edit",
    chip: "Radio Edit",
    diff: "Intro and outro tightened for radio",
    status: "Radio edit arrangement staged.",
    branch: "Radio Edit",
    renderType: "radio-edit",
    apply: (sections) => sections.map((section) => section.name === "Intro" || section.name === "Outro" ? { ...section, length: Math.max(8, section.length - 8), intensity: Math.min(100, section.intensity + 10) } : section),
  },
  {
    label: "Make More Cinematic",
    chip: "Cinematic",
    diff: "Bridge and outro made more cinematic",
    status: "Realtime cinematic transformation active.",
    branch: "Cinematic Edit",
    apply: (sections) => sections.map((section) => section.name === "Bridge" || section.name === "Outro" ? { ...section, length: section.length + 8, intensity: Math.min(100, section.intensity + 18) } : section),
  },
  {
    label: "More Aggressive",
    chip: "Aggressive",
    diff: "Drop and chorus energy increased",
    status: "Aggressive arrangement preview staged.",
    branch: "Club Edit",
    apply: (sections) => sections.map((section) => section.name === "Drop" || section.name === "Chorus" ? { ...section, intensity: 100 } : { ...section, intensity: Math.min(100, section.intensity + 8) }),
  },
  {
    label: "Instrumental Version",
    chip: "Instrumental",
    diff: "Vocal layer removed",
    status: "Instrumental arrangement staged.",
    branch: "Instrumental",
    renderType: "instrumental",
    apply: (sections) => sections.map((section) => section.name === "Verse" ? { ...section, intensity: Math.max(30, section.intensity - 8) } : section),
  },
  {
    label: "Male Vocal",
    chip: "Male Vocal",
    diff: "Male vocal transformation staged",
    status: "Vocal transformation staged.",
    apply: (sections) => sections,
  },
  {
    label: "Female Vocal",
    chip: "Female Vocal",
    diff: "Female vocal transformation staged",
    status: "Vocal transformation staged.",
    apply: (sections) => sections,
  },
  {
    label: "Double Vocal",
    chip: "Double Vocal",
    diff: "Double vocal layer staged",
    status: "Double vocal layer staged locally.",
    apply: (sections) => sections.map((section) => section.name === "Chorus" ? { ...section, intensity: Math.min(100, section.intensity + 10) } : section),
  },
  {
    label: "Loop Selected Part",
    chip: "Loop Section",
    diff: "Loop selected section 3x",
    status: "Selected section loop staged.",
    branch: "Loop Edit",
    renderType: "loop-section",
    apply: (sections) => sections,
  },
];

const waveformBars = Array.from({ length: 140 }, (_, index) => {
  const wave = Math.sin(index * 0.15) * 0.34 + Math.sin(index * 0.047 + 1.6) * 0.2;
  return 16 + Math.round(Math.abs(wave) * 24);
});

const primaryProButtonClass =
  "rounded-full border border-cyan-100/25 bg-cyan-300/85 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(103,232,249,0.14)] transition hover:bg-cyan-200 hover:shadow-[0_0_30px_rgba(103,232,249,0.22)] disabled:cursor-not-allowed disabled:opacity-40";
const secondaryProButtonClass =
  "rounded-full border border-white/10 bg-white/[0.065] px-4 py-2 text-sm font-semibold text-white/82 transition hover:border-cyan-100/25 hover:bg-cyan-300/10 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-40";
const selectClass =
  "appearance-none rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-white outline-none ring-1 ring-white/5 transition focus:border-cyan-200/40 focus:bg-slate-950 focus:ring-cyan-200/20";
type StudioProActionState = "idle" | "staged" | "working" | "success" | "error" | "disabled";

function getActionButtonClass(state: StudioProActionState, variant: "pill" | "block" = "pill") {
  const shape = variant === "block" ? "w-full rounded-2xl px-4 py-3" : "rounded-full px-4 py-2";
  const base = `${shape} border text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45`;
  if (state === "disabled") {
    return `${base} cursor-not-allowed border-white/5 bg-slate-950/45 text-white/32 opacity-55`;
  }
  if (state === "working") {
    return `${base} border-red-100/80 bg-red-500 text-white shadow-[0_0_24px_rgba(239,68,68,0.34),0_0_10px_rgba(248,113,113,0.26)] ring-1 ring-red-200/35 animate-pulse`;
  }
  if (state === "success") {
    return `${base} border-emerald-100/70 bg-emerald-500 text-white shadow-[0_0_36px_rgba(16,185,129,0.36)]`;
  }
  if (state === "error") {
    return `${base} border-red-100/85 bg-red-500 text-white shadow-[0_0_24px_rgba(239,68,68,0.32),0_0_10px_rgba(248,113,113,0.24)] ring-1 ring-red-200/35`;
  }
  if (state === "staged") {
    return `${base} border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] text-[#fff7ed]`;
  }
  return `${base} border-cyan-100/14 bg-white/[0.065] text-white/82 hover:border-cyan-100/30 hover:bg-cyan-300/10 hover:text-cyan-50`;
}

function getActiveActionButtonClass(variant: "pill" | "block" = "pill") {
  const shape = variant === "block" ? "w-full rounded-2xl px-4 py-3" : "rounded-full px-4 py-2";
  return `${shape} border border-teal-100/45 bg-teal-300/12 text-teal-50 shadow-[0_0_18px_rgba(45,212,191,0.12)] ring-1 ring-teal-100/15 text-sm font-semibold transition hover:border-teal-100/65 hover:bg-teal-300/18`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message = "Render timed out. Try again.") {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function normalizeStemStatus(value: unknown): StemStatus {
  if (value === "queued" || value === "processing" || value === "ready" || value === "error") {
    return value;
  }
  return "not_started";
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

function getStudioProHandoffTrackId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("track")?.trim() || "";
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not saved";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not saved";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStudioProVersionNumber(version: StudioVersion, fallbackIndex: number) {
  if (typeof version.versionNumber === "number" && Number.isFinite(version.versionNumber)) {
    return version.versionNumber;
  }

  if (version.isOriginal || version.label.toLowerCase() === "original") return 1;
  return fallbackIndex + 1;
}

function mapVersion(raw: any): StudioVersion {
  return {
    id: String(raw.id || ""),
    parentVersionId: raw.parent_version_id || raw.parentVersionId || null,
    rootVersionId: raw.root_version_id || raw.rootVersionId || null,
    trackGroupId: raw.track_group_id || raw.trackGroupId || null,
    title: raw.title || "Untitled Studio version",
    label: raw.version_label || raw.versionLabel || `Version ${raw.version_number || raw.versionNumber || 1}`,
    audioUrl: raw.audio_url || raw.audioUrl || null,
    artworkUrl: raw.artwork_url || raw.artworkUrl || null,
    provider: raw.provider || null,
    duration: typeof raw.duration === "number" ? raw.duration : null,
    versionNumber: raw.version_number || raw.versionNumber || null,
    isOriginal: raw.is_original ?? raw.isOriginal ?? false,
    createdAt: raw.created_at || raw.createdAt || null,
    stemsStatus: normalizeStemStatus(raw.stems_status || raw.stemsStatus),
    stemsRequestedAt: raw.stems_requested_at || raw.stemsRequestedAt || null,
    stemsCompletedAt: raw.stems_completed_at || raw.stemsCompletedAt || null,
    stemsError: raw.stems_error || raw.stemsError || null,
    stemDrumsUrl: raw.stem_drums_url || raw.stemDrumsUrl || null,
    stemBassUrl: raw.stem_bass_url || raw.stemBassUrl || null,
    stemVocalsUrl: raw.stem_vocals_url || raw.stemVocalsUrl || null,
    stemOtherUrl: raw.stem_other_url || raw.stemOtherUrl || null,
    stemsMetadata: raw.stems_metadata || raw.stemsMetadata || null,
    metadata: raw.metadata || null,
    importMetadata: raw.import_metadata || raw.importMetadata || null,
  };
}

function mapStudioProject(raw: any): StudioProject {
  const trackGroupId =
    raw.track_group_id || raw.trackGroupId || raw.source_track_group_id || raw.sourceTrackGroupId || null;
  const trackVersionId =
    raw.track_version_id || raw.trackVersionId || raw.source_track_version_id || raw.sourceTrackVersionId || null;

  return {
    id: String(raw.id || trackGroupId || trackVersionId || ""),
    title: raw.title || raw.project_name || raw.projectName || "Untitled Studio project",
    artist: raw.artist || null,
    genre: raw.genre || null,
    trackGroupId,
    trackVersionId,
    sourceTrackGroupId: raw.source_track_group_id || raw.sourceTrackGroupId || trackGroupId,
    sourceTrackVersionId: raw.source_track_version_id || raw.sourceTrackVersionId || trackVersionId,
    audioUrl: raw.audio_url || raw.audioUrl || null,
    createdAt: raw.created_at || raw.createdAt || raw.updated_at || raw.updatedAt || null,
    source: raw.source === "pro" ? "pro" : "studio",
    sourceLabel: raw.sourceLabel || raw.source_label || "Import from Studio",
  };
}

function getApiError(payload: any, fallback: string) {
  if (typeof payload?.error === "string") return payload.error;
  if (typeof payload?.message === "string") return payload.message;
  return fallback;
}

function isMissingColumnError(error: any) {
  const values = [error?.message, error?.details, error?.hint, error?.code]
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildStudioProDspChain(mixer: MixerState) {
  return {
    drums: mixer.drums,
    bass: mixer.bass,
    vocals: mixer.vocal,
    music: mixer.music,
    fxAmbience: mixer.fx,
    master: mixer.master,
    subBass: mixer.subBass,
    punch: mixer.punch,
    overdrive: mixer.overdrive,
    overdriveMode: mixer.overdriveMode,
    stereoWidth: mixer.stereoWidth,
    stereoBalance: mixer.stereoBalance,
    monoSafe: mixer.monoSafe,
    harshnessReduction: mixer.harshnessReduction,
    effectStrength: mixer.effectStrength,
    air: mixer.air,
    warmth: mixer.warmth,
    compression: mixer.compression,
    loudness: mixer.loudness,
    saturation: mixer.saturation,
    limiter: mixer.limiter,
    clipSafe: mixer.clipSafe,
    analogFeel: mixer.analogFeel,
    normalize: mixer.masterNormalize,
    dnbFeel: mixer.dnbFeel,
    houseFeel: mixer.houseFeel,
    clubEnergy: mixer.clubEnergy,
    speed: mixer.speed,
    pitch: mixer.pitch,
  };
}

function hasFrozenDspMetadata(version: StudioVersion | null) {
  const metadata = getStoredStudioProMetadata(version);
  return Boolean(
    metadata?.studioProFreeze === true ||
      metadata?.freezeType === "realtime-dsp-freeze-v1" ||
      version?.label?.toLowerCase().includes("freeze")
  );
}

function getStoredStudioProMetadata(version: StudioVersion | null) {
  const candidates = [
    version?.stemsMetadata,
    version?.metadata,
    version?.importMetadata,
    asRecord(version?.stemsMetadata)?.studioProMetadata,
    asRecord(version?.metadata)?.studioProMetadata,
    asRecord(version?.importMetadata)?.studioProMetadata,
  ];

  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (record && (record.studioPro === true || record.dspChain || record.studioProRenderMode)) {
      return record;
    }
  }

  return null;
}

function summarizeDspChain(dspChain: Record<string, unknown>) {
  const entries = Object.entries(dspChain).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) return "No DSP chain values available.";

  return entries
    .map(([key, value]) => {
      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (letter) => letter.toUpperCase());
      return `${label}: ${String(value)}`;
    })
    .join("\n");
}

function buildReportText(report: StudioProReport) {
  return [
    "Studio PRO Processing Report",
    `Report ID: ${report.reportId}`,
    `Track title: ${report.trackTitle}`,
    `Active version id: ${report.activeVersionId}`,
    `Track group id: ${report.trackGroupId || "Not linked"}`,
    `Rendered at: ${report.renderedAt}`,
    `Source: ${report.source}`,
    `Human-directed edit: ${report.humanDirectedEdit}`,
    `Active preset: ${report.activePreset || "None"}`,
    `Stems status: ${report.stemsStatus}`,
    `Exported audio URL: ${report.exportedAudioUrl}`,
    `Metadata source: ${report.metadataSource}`,
    "",
    "DSP chain summary:",
    report.dspChainSummary,
    "",
    "Processing notes:",
    "Rendered through SoundioX Studio PRO",
    "Human-directed editing workflow",
    "AI source metadata stripped during export processing when applicable",
    "Final audio rendered through SoundioX processing chain",
    "",
    report.disclaimer,
  ].join("\n");
}

function ChannelStrip({
  label,
  value,
  onChange,
  min = 0,
  max = 130,
  display,
  level = 0,
  playing = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  display?: string;
  level?: number;
  playing?: boolean;
}) {
  const [touching, setTouching] = useState(false);
  const safeLevel = Math.min(1, Math.max(0, level));
  const glowOpacity = playing ? 0.08 + safeLevel * (label === "Master" ? 0.34 : 0.24) : 0.05;
  const shortLabel =
    label === "FX / Ambience"
      ? "FX"
      : label === "Master"
        ? "MA"
        : label.slice(0, 2).toUpperCase();
  const meterSegments = [0.16, 0.32, 0.48, 0.64, 0.8, 0.96];

  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-[22px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.026))] px-3 py-2.5 transition duration-300 ${
        touching
          ? "border-cyan-100/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_0_34px_rgba(103,232,249,0.20)]"
          : "border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_60px_rgba(2,6,23,0.20)]"
      }`}
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 22px 60px rgba(2,6,23,0.20), 0 0 ${18 + safeLevel * 42}px rgba(103,232,249,${glowOpacity})`,
      }}
    >
      <div className="flex min-w-[128px] items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-100/18 bg-cyan-300/9 text-[10px] font-bold text-cyan-50 shadow-[0_0_18px_rgba(103,232,249,0.10)]">
          {shortLabel}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50/78">
            {label}
          </div>
          <div className="mt-1 grid w-14 grid-cols-2 gap-1">
            <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-1 text-center text-[9px] font-bold text-white/48">
              M
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-1 text-center text-[9px] font-bold text-white/48">
              S
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="w-12 shrink-0 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-center text-[10px] font-semibold text-white/64">
          {display || value}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerDown={() => setTouching(true)}
          onPointerUp={() => setTouching(false)}
          onBlur={() => setTouching(false)}
          className="h-2 min-w-0 flex-1 cursor-grab accent-cyan-200 transition hover:drop-shadow-[0_0_8px_rgba(103,232,249,0.45)] active:cursor-grabbing"
        />
      </div>

      <div className="flex w-24 shrink-0 items-center justify-end gap-1.5">
        {meterSegments.map((threshold) => {
          const lit = safeLevel >= threshold;
          return (
            <span
              key={threshold}
              className={`h-7 w-2 rounded-full transition-all duration-150 ${
                lit
                  ? "bg-[linear-gradient(180deg,#67e8f9,#a78bfa)] shadow-[0_0_10px_rgba(103,232,249,0.24)]"
                  : "bg-white/14"
              }`}
              style={{ opacity: lit ? 0.78 + safeLevel * 0.22 : 0.36 }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CompactControl({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  display,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  display?: string;
}) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-50/72">
          {label}
        </span>
        <span className="shrink-0 text-xs font-semibold text-white/58">{display || value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 h-1 w-full accent-cyan-200"
      />
    </label>
  );
}

function SoundioXDropdown({
  label,
  value,
  options,
  onSelect,
  className = "",
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label || label;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="flex w-full items-center justify-between gap-3 rounded-[22px] border border-cyan-100/24 bg-[linear-gradient(135deg,rgba(103,232,249,0.22),rgba(255,255,255,0.08)_48%,rgba(125,211,252,0.16))] px-4 py-3 text-left text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_24px_rgba(103,232,249,0.10)] outline-none ring-1 ring-cyan-100/12 transition hover:border-cyan-100/42 hover:bg-cyan-300/16 focus:border-cyan-100/50 focus:ring-cyan-100/28"
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <span className={`shrink-0 text-xs font-bold text-cyan-50/86 transition ${open ? "rotate-180" : ""}`}>
          v
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-[22px] border border-cyan-100/18 bg-slate-950/96 p-1.5 shadow-[0_22px_70px_rgba(2,6,23,0.55),0_0_28px_rgba(103,232,249,0.12)] backdrop-blur-2xl">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value || "empty"}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
                className={`block w-full rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  selected
                    ? "bg-cyan-300/20 text-cyan-50 ring-1 ring-cyan-100/20"
                    : "text-white/76 hover:bg-white/9 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function StudioProPage() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [projectLibraryTab, setProjectLibraryTab] = useState<"pro" | "studio">("pro");
  const [versions, setVersions] = useState<StudioVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState("");
  const [mixer, setMixer] = useState<MixerState>(initialMixer);
  const [activePreset, setActivePreset] = useState<PresetName | null>(null);
  const [activeMasteringPreset, setActiveMasteringPreset] = useState<PresetName | null>(null);
  const [activeQuickMasterAction, setActiveQuickMasterAction] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState("Loading Studio PRO...");
  const [renderFailureMessage, setRenderFailureMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const [localUploadFile, setLocalUploadFile] = useState<File | null>(null);
  const [compareMode, setCompareMode] = useState<"original" | "mix" | "frozen">("mix");
  const [dragActive, setDragActive] = useState(false);
  const [proReport, setProReport] = useState<StudioProReport | null>(null);
  const [frozenCompareVersionId, setFrozenCompareVersionId] = useState<string | null>(null);
  const [highlightVersionId, setHighlightVersionId] = useState<string | null>(null);
  const [arrangementSections, setArrangementSections] = useState<ArrangementSection[]>(initialArrangementSections);
  const [selectedArrangementSection, setSelectedArrangementSection] = useState<ArrangementSectionName>("Chorus");
  const [arrangementLoopMode, setArrangementLoopMode] = useState<ArrangementLoopMode>("off");
  const [arrangementEditHistory, setArrangementEditHistory] = useState<string[]>([]);
  const [pendingArrangementChanges, setPendingArrangementChanges] = useState<PendingArrangementChange[]>([]);
  const [arrangementRenderState, setArrangementRenderState] = useState<"preview" | "rendered">("preview");
  const [arrangementBranches, setArrangementBranches] = useState<ArrangementBranch[]>(initialArrangementBranches);
  const [selectedArrangementBranch, setSelectedArrangementBranch] = useState("Original");
  const [arrangementBranchesOpen, setArrangementBranchesOpen] = useState(true);
  const [arrangementSuccessToast, setArrangementSuccessToast] = useState<ArrangementSuccessToast | null>(null);
  const [renderingArrangementAction, setRenderingArrangementAction] = useState<string | null>(null);
  const [doneArrangementAction, setDoneArrangementAction] = useState<string | null>(null);
  const [errorArrangementAction, setErrorArrangementAction] = useState<string | null>(null);
  const [arrangementRenderError, setArrangementRenderError] = useState<ArrangementRenderError | null>(null);
  const [actionFeedback, setActionFeedback] = useState<Record<string, StudioProActionState>>({});
  const [previewMasterReady, setPreviewMasterReady] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<"master" | "arrangement" | null>(null);
  const [exportWorkflowStatus, setExportWorkflowStatus] = useState<ExportWorkflowStatus>("Ready to export");
  const [submitWorkflowStatus, setSubmitWorkflowStatus] = useState<SubmitWorkflowStatus>("Ready to submit");
  const [submitError, setSubmitError] = useState("");
  const [coProducerAdvice, setCoProducerAdvice] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCompareSwitchRef = useRef<{ time: number; wasPlaying: boolean } | null>(null);
  const versionHistoryRef = useRef<HTMLDivElement | null>(null);
  const arrangementBranchesRef = useRef<HTMLDivElement | null>(null);
  const exportStatusVersionRef = useRef<string | null>(null);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === activeVersionId) || versions[0] || null,
    [activeVersionId, versions]
  );
  const proProjects = useMemo(() => projects.filter((project) => project.source === "pro"), [projects]);
  const studioImportProjects = useMemo(
    () => projects.filter((project) => project.source === "studio"),
    [projects]
  );
  const visibleProjectLibraryProjects = projectLibraryTab === "pro" ? proProjects : studioImportProjects;
  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.trackGroupId && project.trackGroupId === selectedVersion?.trackGroupId) ||
      projects.find((project) => project.trackVersionId && project.trackVersionId === selectedVersion?.id) ||
      projects.find(
        (project) =>
          selectedVersion?.id === `draft-${project.id}` ||
          selectedVersion?.id === `track-${project.id}`
      ) ||
      null,
    [selectedVersion?.id, selectedVersion?.trackGroupId, projects]
  );
  const activeProjectSelectId = useMemo(
    () => selectedProject?.id || "",
    [selectedProject?.id]
  );
  const currentProject = useMemo(
    () => projects.find((project) => project.id === activeProjectSelectId) || selectedProject,
    [activeProjectSelectId, projects, selectedProject]
  );
  const projectVersion = useMemo(
    () =>
      (currentProject?.trackVersionId
        ? versions.find((version) => version.id === currentProject.trackVersionId)
        : null) ||
      (currentProject?.trackGroupId
        ? versions.find((version) => version.trackGroupId === currentProject.trackGroupId)
        : null) ||
      selectedVersion,
    [currentProject?.trackGroupId, currentProject?.trackVersionId, selectedVersion, versions]
  );
  const renderSource = useMemo(() => {
    if (!selectedVersion) return null;
    const projectTrackGroupId =
      projectVersion?.trackGroupId ||
      selectedProject?.trackGroupId ||
      selectedProject?.sourceTrackGroupId ||
      currentProject?.trackGroupId ||
      currentProject?.sourceTrackGroupId ||
      null;
    const projectTrackVersionId =
      projectVersion?.id ||
      selectedProject?.trackVersionId ||
      selectedProject?.sourceTrackVersionId ||
      currentProject?.trackVersionId ||
      currentProject?.sourceTrackVersionId ||
      null;
    const isDisplayOnlyVersion =
      selectedVersion.id.startsWith("draft-") || selectedVersion.id.startsWith("track-");

    return {
      ...selectedVersion,
      id: isDisplayOnlyVersion && projectTrackVersionId ? projectTrackVersionId : selectedVersion.id,
      trackGroupId: selectedVersion.trackGroupId || projectTrackGroupId,
    };
  }, [currentProject, projectVersion, selectedProject, selectedVersion]);
  const activeVersion = renderSource;
  const activeProject = currentProject;
  const versionTimeline = useMemo(
    () =>
      [...versions].sort((a, b) => {
        const byVersionNumber = getStudioProVersionNumber(a, 0) - getStudioProVersionNumber(b, 0);
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
  useEffect(() => {
    console.log("ACTIVE PROJECT", activeProject);
    console.log("ACTIVE VERSION", activeVersion);
  }, [activeProject, activeVersion]);
  const projectDropdownOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );
  const frozenCompareVersion = useMemo(
    () =>
      (frozenCompareVersionId
        ? versions.find((version) => version.id === frozenCompareVersionId)
        : null) ||
      versions.find((version) => hasFrozenDspMetadata(version)) ||
      null,
    [frozenCompareVersionId, versions]
  );
  const playbackVersion =
    compareMode === "frozen" && frozenCompareVersion?.audioUrl ? frozenCompareVersion : activeVersion;
  const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const storedStudioProMetadata = useMemo(() => getStoredStudioProMetadata(activeVersion), [activeVersion]);
  const canCreateProReport = Boolean(
    activeVersion?.audioUrl &&
      (storedStudioProMetadata ||
        activeVersion?.provider?.includes("studio-pro") ||
        activeVersion?.provider === "local-upload")
  );
  const stemsReady = activeVersion?.stemsStatus === "ready";
  const stemUrls = useMemo(
    () => ({
      drums: activeVersion?.stemDrumsUrl?.trim() || "",
      bass: activeVersion?.stemBassUrl?.trim() || "",
      vocals: activeVersion?.stemVocalsUrl?.trim() || "",
      other: activeVersion?.stemOtherUrl?.trim() || "",
    }),
    [
      activeVersion?.stemDrumsUrl,
      activeVersion?.stemBassUrl,
      activeVersion?.stemVocalsUrl,
      activeVersion?.stemOtherUrl,
    ]
  );
  const presentStemUrls = Object.values(stemUrls).filter(Boolean);
  const stemUrlCount = presentStemUrls.length;
  const uniqueStemUrlCount = new Set(presentStemUrls).size;
  const hasDuplicateStemUrls = stemUrlCount > 1 && uniqueStemUrlCount < stemUrlCount;
  const hasValidCompleteStemSet = stemUrlCount === 4 && !hasDuplicateStemUrls;
  const stemRoutingMode =
    hasDuplicateStemUrls
      ? "invalid"
      : hasValidCompleteStemSet
      ? "ready"
      : stemUrlCount > 0
        ? "partial"
        : "fallback";
  const isLocalUpload = activeVersion?.provider === "local-upload";
  const renderBusy =
    workingAction === "preview" || workingAction === "render" || workingAction === "freeze";
  const previewMasterDisabledReason = !activeVersion?.audioUrl
    ? "Load audio first."
    : workingAction === "preview"
      ? "Preview already rendering."
      : workingAction === "render" || workingAction === "freeze"
        ? "Preview already rendering."
        : "";
  const canPreviewMaster = Boolean(activeVersion?.audioUrl && !previewMasterDisabledReason);
  const commitMixDisabledReason = !activeVersion?.audioUrl
    ? "Load or upload audio first."
    : renderBusy
      ? "Render already in progress."
      : isLocalUpload || !activeVersion.trackGroupId
        ? "Save PRO project before committing."
        : "";
  const canCommitMix = Boolean(activeVersion?.audioUrl && !renderBusy && !commitMixDisabledReason);
  const canPrepareStems =
    Boolean(activeVersion?.id && activeVersion.trackGroupId && activeVersion.audioUrl) &&
    activeVersion?.stemsStatus !== "queued" &&
    activeVersion?.stemsStatus !== "processing" &&
    (hasDuplicateStemUrls || activeVersion?.stemsStatus !== "ready");
  const activeVersionTitle = activeVersion?.title?.trim() || "";
  const renderFinalMasterBlockedReason = !activeVersion?.id
    ? "missing active version id"
    : !activeVersion?.audioUrl
      ? "missing audio URL"
      : !activeVersionTitle
        ? "missing title"
        : "";
  const canRenderFinalMaster = !renderFinalMasterBlockedReason;
  const releasePackageBlockedReason = !activeVersion?.id
    ? "missing activeVersion id"
    : !activeVersion.trackGroupId
      ? "missing trackGroupId"
      : !activeVersion.audioUrl
        ? "missing audioUrl"
        : !activeVersion.title?.trim()
          ? "missing title"
          : "";
  const canReleasePackage = !releasePackageBlockedReason;
  const canSubmitToSoundioX = Boolean(activeVersion?.id && activeVersion.trackGroupId && activeVersion.audioUrl && activeVersion.title.trim());
  const stemActionLabel =
    workingAction === "prepare-stems"
      ? "Preparing stems..."
      : hasDuplicateStemUrls
        ? "Retry stems"
      : activeVersion?.stemsStatus === "ready"
        ? "Stems ready"
        : activeVersion?.stemsStatus === "queued"
          ? "Stems queued"
          : activeVersion?.stemsStatus === "processing"
            ? "Preparing stems..."
            : activeVersion?.stemsStatus === "error"
              ? "Retry stems"
              : "Prepare stems";
  const realtimeMixPreview = useRealtimeMixPreview({
    sourceUrl: playbackVersion?.audioUrl || null,
    stemsReady: compareMode === "frozen" ? false : hasValidCompleteStemSet,
    stems: {
      drums: compareMode === "frozen" ? null : activeVersion?.stemDrumsUrl || null,
      bass: compareMode === "frozen" ? null : activeVersion?.stemBassUrl || null,
      vocals: compareMode === "frozen" ? null : activeVersion?.stemVocalsUrl || null,
      other: compareMode === "frozen" ? null : activeVersion?.stemOtherUrl || null,
    },
    bufferCacheKey: activeVersion
      ? [
          activeVersion.id,
          activeVersion.stemDrumsUrl || "no-drums",
          activeVersion.stemBassUrl || "no-bass",
          activeVersion.stemVocalsUrl || "no-vocals",
          activeVersion.stemOtherUrl || "no-other",
        ].join("|")
      : null,
    controls: {
      drums: mixer.drums,
      bass: mixer.bass,
      vocal: mixer.vocal,
      music: mixer.music,
      fx: mixer.fx,
      master: mixer.master,
      subBass: mixer.subBass,
      speed: mixer.speed,
      punch: mixer.punch,
      overdrive: mixer.overdrive,
      overdriveMode: mixer.overdriveMode,
      stereoWidth: mixer.stereoWidth,
      stereoBalance: mixer.stereoBalance,
      monoSafe: mixer.monoSafe,
      harshnessReduction: mixer.harshnessReduction,
      effectStrength: mixer.effectStrength,
      air: mixer.air,
      warmth: mixer.warmth,
      compression: mixer.compression,
      loudness: mixer.loudness,
      saturation: mixer.saturation,
      limiter: mixer.limiter,
      clipSafe: mixer.clipSafe,
      analogFeel: mixer.analogFeel,
      normalize: mixer.masterNormalize,
      dnbFeel: mixer.dnbFeel,
      houseFeel: mixer.houseFeel,
      clubEnergy: mixer.clubEnergy,
    },
    compareMode: compareMode === "mix" ? "mix" : "original",
  });
  const masterEnergy = realtimeMixPreview.levels.master;
  const proEnergy = compareMode === "mix" && realtimeMixPreview.playing ? masterEnergy : masterEnergy * 0.45;

  function setActionState(action: string, state: StudioProActionState) {
    setActionFeedback((current) => ({ ...current, [action]: state }));
  }

  function clearActionState(action: string, delay = 3000) {
    window.setTimeout(() => {
      setActionFeedback((current) => {
        if (current[action] !== "success") return current;
        const next = { ...current };
        delete next[action];
        return next;
      });
    }, delay);
  }

  function resetActionState(action: string, delay = 1200) {
    window.setTimeout(() => {
      setActionFeedback((current) => {
        if (!current[action] || current[action] === "success" || current[action] === "error") return current;
        const next = { ...current };
        delete next[action];
        return next;
      });
    }, delay);
  }

  function beginAction(action: string, serverProcess = false) {
    setActionState(action, "staged");
    if (!serverProcess) return;
    window.setTimeout(() => {
      setActionFeedback((current) =>
        current[action] === "staged" ? { ...current, [action]: "working" } : current
      );
    }, 220);
  }

  function localRealtimeActionLabel(action: string, idleLabel: string) {
    const state = getActionState(action);
    if (state === "staged") return "Applying...";
    if (state === "working") return "Applying...";
    if (state === "success") return "Ready ✓";
    if (state === "error") return "Error";
    return idleLabel;
  }

  function actionClassWithActive(state: StudioProActionState, active: boolean) {
    return state === "idle" && active ? getActiveActionButtonClass() : getActionButtonClass(state);
  }

  function actionLabelWithActive(action: string, idleLabel: string, active: boolean) {
    const label = localRealtimeActionLabel(action, idleLabel);
    return getActionState(action) === "idle" && active ? `${idleLabel} ✓` : label;
  }

  function getActionState(action: string): StudioProActionState {
    if (actionFeedback[action]) return actionFeedback[action];
    if (
      (action === "preview" && workingAction === "preview") ||
      (action === "render" && workingAction === "render") ||
      (action === "freeze" && workingAction === "freeze") ||
      (action === "download" && workingAction === "download") ||
      (action === "export" && workingAction === "export") ||
      (action === "release-package" && workingAction === "release-package") ||
      (action === "submit-soundiox" && workingAction === "submit-soundiox") ||
      (action === "report" && workingAction === "report") ||
      (action === "save-pro" && workingAction === "save-pro") ||
      (action === "prepare-stems" && workingAction === "prepare-stems") ||
      (action === "co-producer-advice" && workingAction === "co-producer-advice") ||
      (action === "arrangement-render" && workingAction === "arrangement-render")
    ) {
      return "working";
    }
    return actionFeedback[action] || "idle";
  }

  function previewMasterLabel() {
    const state = getActionState("preview");
    if (state === "staged") return "Previewing...";
    if (state === "working") return "Previewing...";
    if (state === "success") return "Preview Ready ✓";
    if (state === "error") return "Error";
    return "Preview Master";
  }

  function renderFinalLabel() {
    const state = getActionState("render");
    if (state === "staged") return "Rendering...";
    if (state === "working") return "Rendering...";
    if (state === "success") return "Rendered ✓";
    if (state === "error") return renderFailureMessage || "Error";
    return "Render Final Master";
  }

  function commitMasterLabel() {
    const state = getActionState("freeze");
    if (state === "staged") return "Committing...";
    if (state === "working") return "Committing...";
    if (state === "success") return "Saved ✓";
    if (state === "error") return "Error";
    return "Commit Master";
  }

  function downloadMasterLabel() {
    const state = getActionState("download");
    if (state === "staged") return "Downloading...";
    if (state === "working") return "Downloading...";
    if (state === "success") return "Downloaded ✓";
    if (state === "error") return "Error";
    return "Download Master";
  }

  function exportStemsLabel() {
    const state = getActionState("export");
    if (state === "staged") return "Exporting...";
    if (state === "working") return "Exporting...";
    if (state === "success") return "Ready ✓";
    if (state === "error") return "Error";
    return "Export stems";
  }

  function exportReportLabel() {
    const state = getActionState("report");
    if (state === "staged") return "Exporting...";
    if (state === "working") return "Exporting...";
    if (state === "success") return "Ready ✓";
    if (state === "error") return "Error";
    return "Export PRO Report";
  }

  function releasePackageLabel() {
    const state = getActionState("release-package");
    if (state === "staged") return "Packaging...";
    if (state === "working") return "Packaging...";
    if (state === "success") return "Package Ready ✓";
    if (state === "error") return "Failed";
    return "Release Package";
  }

  function submitSoundioXLabel() {
    const state = getActionState("submit-soundiox");
    if (state === "staged") return "Submitting...";
    if (state === "working") return "Submitting...";
    if (state === "success") return "Submitted ✓";
    if (state === "error") return "Failed";
    return "Submit to SoundioX";
  }

  function saveProProjectLabel() {
    const state = getActionState("save-pro");
    if (state === "staged") return "Saving...";
    if (state === "working") return "Saving...";
    if (state === "success") return "Saved ✓";
    if (state === "error") return "Error";
    return "Save PRO project";
  }

  function prepareStemsLabel() {
    const state = getActionState("prepare-stems");
    if (state === "staged") return "Preparing...";
    if (state === "working") return "Processing stems...";
    if (state === "success") return "Stems Ready ✓";
    if (activeVersion?.stemsStatus === "ready" && !hasDuplicateStemUrls) return "Stems ready";
    if (state === "error") return "Error";
    return stemActionLabel;
  }

  function coProducerAdviceLabel() {
    const state = getActionState("co-producer-advice");
    if (state === "staged" || state === "working") return "Thinking...";
    if (state === "success") return "Advice Ready ✓";
    if (state === "error") return "Error";
    return "Ask Co-Producer";
  }

  function genericActionLabel(action: string, idle: string, working: string, success = "Ready ✓") {
    const state = getActionState(action);
    if (state === "staged" || state === "working") return working;
    if (state === "success") return success;
    if (state === "error") return "Error";
    return idle;
  }

  useEffect(() => {
    if (exportStatusVersionRef.current !== (activeVersion?.id || null)) {
      exportStatusVersionRef.current = activeVersion?.id || null;
      setExportWorkflowStatus(activeVersion?.audioUrl ? "Ready to export" : "Failed");
      return;
    }

    if (workingAction === "render" || workingAction === "freeze" || workingAction === "release-package" || workingAction === "export") {
      setExportWorkflowStatus("Rendering");
      return;
    }

    if (!activeVersion?.audioUrl) {
      setExportWorkflowStatus("Failed");
      return;
    }

    setExportWorkflowStatus((current) => (current === "Export ready" ? current : "Ready to export"));
  }, [activeVersion?.audioUrl, activeVersion?.id, workingAction]);

  useEffect(() => {
    setSubmitWorkflowStatus("Ready to submit");
    setSubmitError("");
  }, [activeVersion?.id]);

  useEffect(() => {
    console.log("DRUM STEM URL", stemUrls.drums || null);
    console.log("BASS STEM URL", stemUrls.bass || null);
    console.log("VOCAL STEM URL", stemUrls.vocals || null);
    console.log("OTHER STEM URL", stemUrls.other || null);

    if (hasDuplicateStemUrls) {
      console.warn("Invalid stem set detected. Using stereo fallback.", {
        trackVersionId: activeVersion?.id || null,
        stemUrlCount,
        uniqueStemUrlCount,
      });
    }
  }, [
    activeVersion?.id,
    hasDuplicateStemUrls,
    stemUrlCount,
    stemUrls.bass,
    stemUrls.drums,
    stemUrls.other,
    stemUrls.vocals,
    uniqueStemUrlCount,
  ]);

  useEffect(() => {
    const handoffTrackId = getStudioProHandoffTrackId();
    console.log("STUDIO PRO URL PARAM", handoffTrackId);
    if (handoffTrackId) {
      void openHandoffTrack(handoffTrackId);
      return;
    }

    void loadProjects();
  }, []);

  useEffect(() => {
    if (!activeVersionId && versions[0]?.id) {
      setActiveVersionId(versions[0].id);
    }
  }, [activeVersionId, versions]);

  useEffect(() => {
    return () => {
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [localObjectUrl]);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setProReport(null);
  }, [playbackVersion?.id, playbackVersion?.audioUrl]);

  useEffect(() => {
    setPlaying(realtimeMixPreview.playing);
    setCurrentTime(realtimeMixPreview.currentTime);
    setDuration(realtimeMixPreview.duration);
  }, [realtimeMixPreview.currentTime, realtimeMixPreview.duration, realtimeMixPreview.playing]);

  useEffect(() => {
    const pending = pendingCompareSwitchRef.current;
    if (!pending) return;
    pendingCompareSwitchRef.current = null;

    const timer = window.setTimeout(() => {
      realtimeMixPreview.seek(pending.time);
      if (pending.wasPlaying) {
        void realtimeMixPreview.play().catch((error: any) => {
          setWorkspaceStatus(error?.message || "Could not resume A/B playback.");
        });
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [compareMode, realtimeMixPreview]);

  useEffect(() => {
    if (
      !activeVersion?.id ||
      !activeVersion.trackGroupId ||
      !activeVersion.audioUrl ||
      (activeVersion.stemsStatus !== "queued" && activeVersion.stemsStatus !== "processing")
    ) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      console.log("STEM POLLING", {
        trackVersionId: activeVersion.id,
        trackGroupId: activeVersion.trackGroupId,
        stemsStatus: activeVersion.stemsStatus,
      });
      try {
        const refreshed = await refreshActiveVersionFromDb(activeVersion.trackGroupId!, activeVersion.id);
        if (cancelled || !refreshed) return;

        const refreshedStemCount = [
          refreshed.stemDrumsUrl,
          refreshed.stemBassUrl,
          refreshed.stemVocalsUrl,
          refreshed.stemOtherUrl,
        ].filter(Boolean).length;
        console.log("STEM URLS DETECTED", {
          trackVersionId: refreshed.id,
          stemsStatus: refreshed.stemsStatus,
          stemUrlCount: refreshedStemCount,
        });

        if (refreshed.stemsStatus === "ready") {
          console.log("STEM READY STATE REACHED", { trackVersionId: refreshed.id });
          setActionState("prepare-stems", "success");
          clearActionState("prepare-stems");
          setWorkspaceStatus("Independent drum, bass, vocal, and music control active.");
          return;
        }

        if (refreshed.stemsStatus === "error") {
          setWorkspaceStatus("Stem preparation failed. Retry available.");
          return;
        }

        if (refreshed.stemsStatus === "queued") {
          setWorkspaceStatus("Stem separation queued.");
        } else if (refreshed.stemsStatus === "processing") {
          setWorkspaceStatus("Separating drums, bass, vocals, and music...");
        }

        const reconcilePayload = await reconcileStemJob(
          refreshed.trackGroupId || activeVersion.trackGroupId!,
          refreshed.id,
          refreshed.audioUrl || activeVersion.audioUrl!
        );
        if (cancelled || !reconcilePayload) return;

        if (reconcilePayload.stemsStatus === "ready") {
          await refreshActiveVersionFromDb(activeVersion.trackGroupId!, activeVersion.id);
          console.log("STEM READY STATE REACHED", { trackVersionId: activeVersion.id });
          setActionState("prepare-stems", "success");
          clearActionState("prepare-stems");
          setWorkspaceStatus("Independent drum, bass, vocal, and music control active.");
        } else if (reconcilePayload.stemsStatus === "error") {
          await refreshActiveVersionFromDb(activeVersion.trackGroupId!, activeVersion.id);
          console.log("STEM TIMEOUT TRIGGERED", {
            trackVersionId: activeVersion.id,
            code: reconcilePayload.code,
          });
          setWorkspaceStatus("Stem preparation failed. Retry available.");
        }
      } catch (error) {
        console.log("STEM POLLING ERROR", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 5000);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeVersion?.id, activeVersion?.trackGroupId, activeVersion?.audioUrl, activeVersion?.stemsStatus]);

  useEffect(() => {
    if (
      !activeVersion?.id ||
      !activeVersion.trackGroupId ||
      !activeVersion.audioUrl ||
      activeVersion.stemsStatus === "ready" ||
      stemUrlCount !== 4
    ) {
      return;
    }

    let cancelled = false;
    const repairReadyState = async () => {
      console.log("STEM URLS DETECTED", {
        trackVersionId: activeVersion.id,
        stemUrlCount,
        stemsStatus: activeVersion.stemsStatus,
      });
      const payload = await reconcileStemJob(
        activeVersion.trackGroupId!,
        activeVersion.id,
        activeVersion.audioUrl!
      );
      if (cancelled) return;
      if (payload?.stemsStatus === "ready") {
        await refreshActiveVersionFromDb(activeVersion.trackGroupId!, activeVersion.id);
        console.log("STEM READY STATE REACHED", { trackVersionId: activeVersion.id });
        setWorkspaceStatus("Independent drum, bass, vocal, and music control active.");
      }
    };

    void repairReadyState();

    return () => {
      cancelled = true;
    };
  }, [activeVersion?.id, activeVersion?.trackGroupId, activeVersion?.audioUrl, activeVersion?.stemsStatus, stemUrlCount]);

  async function getSessionToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Log in to use Studio PRO.");
    return session.access_token;
  }

  async function loadVersionById(versionId: string) {
    const id = versionId.trim();
    if (!id || id.startsWith("draft-") || id.startsWith("track-") || id.startsWith("local-upload-")) {
      return null;
    }

    const trackVersionsTable = (supabase as any).from("track_versions");
    let result = await trackVersionsTable
      .select(STUDIO_PRO_VERSION_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (result.error && isMissingColumnError(result.error)) {
      result = await trackVersionsTable
        .select(STUDIO_PRO_VERSION_SELECT_WITHOUT_ROOT)
        .eq("id", id)
        .maybeSingle();
    }

    if (result.error) throw result.error;
    return result.data ? mapVersion(result.data) : null;
  }

  async function loadProjects(silent = false) {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!silent) setWorkspaceStatus("Log in to open Studio PRO projects.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("tracks")
        .select("id,title,artist,genre,audio_url,created_at,source_track_group_id,source_track_version_id,is_published,source_provider,source_generation_mode,imported_source")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      console.log("PROJECT LOADER RESULT", data);

      const trackProjects: StudioProject[] = (data || [])
        .filter((track: any) => track.source_track_group_id || track.source_track_version_id || track.is_published === false)
        .map((track: any) =>
          mapStudioProject({
            ...track,
            track_group_id: track.source_track_group_id,
            track_version_id: track.source_track_version_id,
            source:
              track.source_provider === "studio-pro-upload" ||
              track.imported_source === "studio-pro-upload" ||
              track.source_generation_mode === "import"
                ? "pro"
                : "studio",
            sourceLabel:
              track.source_provider === "studio-pro-upload" ||
              track.imported_source === "studio-pro-upload" ||
              track.source_generation_mode === "import"
                ? "Studio PRO upload"
                : "Import from Studio",
          })
        );

      const unresolvedTrackVersionIds = trackProjects
        .filter((project) => !project.trackGroupId && project.trackVersionId)
        .map((project) => project.trackVersionId)
        .filter((id): id is string => Boolean(id));
      if (unresolvedTrackVersionIds.length) {
        const trackVersionsTable = (supabase as any).from("track_versions");
        let linkedVersionsResult = await trackVersionsTable
          .select(STUDIO_PRO_VERSION_SELECT)
          .in("id", unresolvedTrackVersionIds);

        if (linkedVersionsResult.error && isMissingColumnError(linkedVersionsResult.error)) {
          linkedVersionsResult = await trackVersionsTable
            .select(STUDIO_PRO_VERSION_SELECT_WITHOUT_ROOT)
            .in("id", unresolvedTrackVersionIds);
        }

        if (!linkedVersionsResult.error) {
          const linkedVersionsById = new Map<string, StudioVersion>(
            (linkedVersionsResult.data || []).map((version: any) => [String(version.id), mapVersion(version)])
          );
          for (const project of trackProjects) {
            const linkedVersion = project.trackVersionId
              ? linkedVersionsById.get(project.trackVersionId)
              : null;
            if (!linkedVersion) continue;
            project.trackGroupId = linkedVersion.trackGroupId;
            project.trackVersionId = linkedVersion.id;
            project.sourceTrackGroupId = linkedVersion.trackGroupId;
            project.sourceTrackVersionId = linkedVersion.id;
            project.audioUrl = project.audioUrl || linkedVersion.audioUrl;
            project.title = project.title || linkedVersion.title;
          }
        }
      }

      const { data: studioProjectRows, error: studioProjectError } = await supabase
        .from("studio_projects")
        .select("id,track_group_id,project_name,created_at,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (studioProjectError) throw studioProjectError;

      const trackGroupIds = (studioProjectRows || [])
        .map((project: any) => project.track_group_id)
        .filter(Boolean);

      let versionRows: any[] = [];
      if (trackGroupIds.length) {
        const trackVersionsTable = (supabase as any).from("track_versions");
        let versionsResult = await trackVersionsTable
          .select(STUDIO_PRO_VERSION_SELECT)
          .in("track_group_id", trackGroupIds)
          .order("created_at", { ascending: false });

        if (versionsResult.error && isMissingColumnError(versionsResult.error)) {
          versionsResult = await trackVersionsTable
            .select(STUDIO_PRO_VERSION_SELECT_WITHOUT_ROOT)
            .in("track_group_id", trackGroupIds)
            .order("created_at", { ascending: false });
        }

        if (!versionsResult.error) versionRows = versionsResult.data || [];
      }

      const versionsByGroup = new Map<string, any[]>();
      for (const version of versionRows) {
        const groupId = String(version.track_group_id || "");
        if (!groupId) continue;
        versionsByGroup.set(groupId, [...(versionsByGroup.get(groupId) || []), version]);
      }

      const isStudioProVersion = (version: any) => {
        const stemsMetadata = asRecord(version.stems_metadata);
        const importMetadata = asRecord(version.import_metadata);
        return (
          version.provider === "studio-pro-upload" ||
          version.provider === "studio-pro-mixer" ||
          version.generation_mode === "import" ||
          version.generation_mode === "mixer_render" ||
          importMetadata?.imported_source === "studio-pro-upload" ||
          stemsMetadata?.studioPro === true ||
          stemsMetadata?.studioProFreeze === true ||
          stemsMetadata?.arrangementRender === true ||
          Boolean(stemsMetadata?.studioProRenderMode)
        );
      };

      const groupProjects: StudioProject[] = (studioProjectRows || [])
        .filter((project: any) => project.track_group_id)
        .map((project: any) => {
          const groupId = String(project.track_group_id);
          const groupVersions = versionsByGroup.get(groupId) || [];
          const latestVersion = groupVersions[0] || null;
          const isPro = groupVersions.some(isStudioProVersion);

          return mapStudioProject({
            id: String(project.id),
            title: latestVersion?.title || project.project_name || "Untitled Studio project",
            artist: null,
            genre: null,
            track_group_id: groupId,
            track_version_id: latestVersion?.id || null,
            source_track_group_id: groupId,
            source_track_version_id: latestVersion?.id || null,
            audio_url: latestVersion?.audio_url || null,
            created_at: latestVersion?.created_at || project.updated_at || project.created_at || null,
            source: isPro ? "pro" : "studio",
            sourceLabel: isPro
              ? latestVersion?.provider === "studio-pro-upload"
                ? "Studio PRO upload"
                : "Studio PRO branch"
              : "Import from Studio",
          });
        });

      const mergedProjects = [...trackProjects, ...groupProjects].reduce<StudioProject[]>((acc, project) => {
        const key = project.trackGroupId || project.trackVersionId || project.id;
        const existingIndex = acc.findIndex((item) => (item.trackGroupId || item.trackVersionId || item.id) === key);
        if (existingIndex >= 0) {
          const existing = acc[existingIndex];
          if (project.source === "pro" && existing.source !== "pro") {
            acc[existingIndex] = project;
          }
          return acc;
        }
        acc.push(project);
        return acc;
      }, []);

      setProjects(mergedProjects);
      const preferredProject = mergedProjects.find((project) => project.source === "pro") || mergedProjects[0];
      if (preferredProject && !activeVersion?.audioUrl && !silent) {
        await openProject(preferredProject);
      } else if (!mergedProjects.length && !silent) {
        setWorkspaceStatus("No PRO projects yet. Upload a track or import from Studio to start.");
      } else if (!silent) {
        setWorkspaceStatus("Project library refreshed.");
      }
    } catch (error: any) {
      if (!silent) setWorkspaceStatus(error?.message || "Failed to load Studio PRO projects.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshProjectLibrary() {
    beginAction("refresh-projects", true);
    try {
      await loadProjects();
      setActionState("refresh-projects", "success");
      clearActionState("refresh-projects", 2200);
    } catch {
      setActionState("refresh-projects", "error");
    }
  }

  async function openHandoffTrack(trackId: string) {
    setLoading(true);
    setWorkspaceStatus("Opening Studio track in Studio PRO...");
    console.log("Studio PRO handoff URL track param:", trackId);
    console.log("Studio PRO handoff resolver branch attempted:", "tracks.id");
    console.log("Studio PRO handoff resolver branch attempted:", "track_versions.id");
    console.log("Studio PRO handoff resolver branch attempted:", "track_group_id/project id");
    console.log("Studio PRO handoff resolver branch attempted:", "studio_jobs.id");
    try {
      const token = await getSessionToken();
      const response = await fetch(`/api/studio-pro/handoff?track=${encodeURIComponent(trackId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      console.log("HANDOFF RESULT", payload);
      console.log("Studio PRO handoff resolver match result:", payload?.branch || "none", {
        ok: response.ok,
        error: payload?.error || null,
      });

      if (!response.ok) {
        throw new Error(getApiError(payload, "Failed to resolve Studio PRO handoff"));
      }

      const rawProject = payload?.project as StudioProject | null;
      const project = rawProject
        ? mapStudioProject(rawProject)
        : null;
      const nextVersions: StudioVersion[] = Array.isArray(payload?.versions)
        ? payload.versions.map(mapVersion)
        : [];
      const requestedVersionId = project?.trackVersionId || nextVersions[0]?.id || "";
      const activeHandoffVersion =
        nextVersions.find((version) => version.id === requestedVersionId) || nextVersions[0] || null;

      console.log("Studio PRO handoff loaded project title:", project?.title || null);
      console.log("Studio PRO handoff loaded version id:", activeHandoffVersion?.id || null);
      console.log("Studio PRO handoff loaded audioUrl:", activeHandoffVersion?.audioUrl || project?.audioUrl || null);
      console.log("Studio PRO handoff loaded artworkUrl:", activeHandoffVersion?.artworkUrl || null);
      console.log("Studio PRO handoff stems status:", activeHandoffVersion?.stemsStatus || null);

      if (!project || !activeHandoffVersion) {
        throw new Error("No Studio project/version was returned for this handoff.");
      }

      setProjects([project]);
      setProjectLibraryTab(project.source === "pro" ? "pro" : "studio");
      setVersions(nextVersions);
      setActiveVersionId(activeHandoffVersion.id);
      setWorkspaceStatus(`Opened Studio project: ${project.title}.`);
    } catch (error: any) {
      console.log("Studio PRO handoff resolver match result:", "error", error?.message || error);
      setWorkspaceStatus(error?.message || "Failed to open Studio track in Studio PRO.");
    } finally {
      setLoading(false);
    }
  }

  async function openProject(project: StudioProject) {
    const actionKey = `open-${project.id}`;
    beginAction(actionKey, true);
    setWorkspaceStatus(`Opening ${project.title}...`);
    try {
      if (!project.trackGroupId && project.trackVersionId) {
        const linkedVersion = await loadVersionById(project.trackVersionId);
        if (linkedVersion?.trackGroupId) {
          project = {
            ...project,
            trackGroupId: linkedVersion.trackGroupId,
            trackVersionId: linkedVersion.id,
            sourceTrackGroupId: linkedVersion.trackGroupId,
            sourceTrackVersionId: linkedVersion.id,
            title: project.title || linkedVersion.title,
            audioUrl: project.audioUrl || linkedVersion.audioUrl,
            createdAt: project.createdAt || linkedVersion.createdAt,
          };
        }
      }

      if (!project.trackGroupId) {
        const fallbackVersion: StudioVersion = {
          id: `draft-${project.id}`,
          trackGroupId: null,
          title: project.title,
          label: "Draft",
          audioUrl: project.audioUrl,
          artworkUrl: null,
          provider: "soundiox-draft",
          duration: null,
          versionNumber: 1,
          createdAt: project.createdAt,
          stemsStatus: "not_started",
          stemsRequestedAt: null,
          stemsCompletedAt: null,
          stemsError: null,
          stemDrumsUrl: null,
          stemBassUrl: null,
          stemVocalsUrl: null,
          stemOtherUrl: null,
          stemsMetadata: null,
        };
        setVersions([fallbackVersion]);
        setActiveVersionId(fallbackVersion.id);
        setActionState(actionKey, "success");
        clearActionState(actionKey, 2200);
        setWorkspaceStatus(`Opened legacy draft: ${project.title}.`);
        return;
      }

      const response = await fetch(`/api/generate-track/versions?trackGroupId=${encodeURIComponent(project.trackGroupId)}`);
      const payload = await response.json().catch(() => null);
      console.log("PROJECT LOADER RESULT", payload);
      if (!response.ok) throw new Error(getApiError(payload, "Failed to load version history"));

      const nextVersions: StudioVersion[] = Array.isArray(payload?.versions)
        ? payload.versions.map(mapVersion)
        : [];
      setVersions(nextVersions);
      setActiveVersionId(
        project.trackVersionId && nextVersions.some((version) => version.id === project.trackVersionId)
          ? project.trackVersionId
          : nextVersions[0]?.id || ""
      );
      setActionState(actionKey, "success");
      clearActionState(actionKey, 2200);
      setWorkspaceStatus(`Opened Studio PRO project: ${project.title}.`);
    } catch (error: any) {
      setActionState(actionKey, "error");
      setWorkspaceStatus(error?.message || `Could not open ${project.title}.`);
      throw error;
    }
  }

  function createLocalVersionFromFile(file: File) {
    beginAction("upload-local");
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|flac)$/i.test(file.name)) {
      setActionState("upload-local", "error");
      setWorkspaceStatus("Upload an MP3, WAV, or FLAC file.");
      return;
    }

    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    const objectUrl = URL.createObjectURL(file);
    setLocalObjectUrl(objectUrl);
    const title = file.name.replace(/\.[^.]+$/, "").trim() || "Imported PRO track";
    const localVersion: StudioVersion = {
      id: `local-upload-${Date.now()}`,
      trackGroupId: null,
      title,
      label: "Local Import",
      audioUrl: objectUrl,
      provider: "local-upload",
      duration: null,
      versionNumber: 1,
      createdAt: new Date().toISOString(),
      stemsStatus: "not_started",
      stemsRequestedAt: null,
      stemsCompletedAt: null,
      stemsError: null,
      stemDrumsUrl: null,
      stemBassUrl: null,
      stemVocalsUrl: null,
      stemOtherUrl: null,
      stemsMetadata: null,
    };

    setVersions([localVersion]);
    setActiveVersionId(localVersion.id);
    setLocalUploadFile(file);
    setPreviewUrl(null);
    setActivePreset(null);
    setMixer(initialMixer);
    setActionState("upload-local", "success");
    clearActionState("upload-local", 2200);
    setWorkspaceStatus(`Imported local PRO track: ${title}. Realtime preview is ready.`);
  }

  function startEmptyProject() {
    beginAction("start-empty");
    const emptyVersion: StudioVersion = {
      id: `empty-pro-${Date.now()}`,
      trackGroupId: null,
      title: "Untitled PRO project",
      label: "Empty Project",
      audioUrl: null,
      provider: "studio-pro-local",
      duration: null,
      versionNumber: 1,
      createdAt: new Date().toISOString(),
      stemsStatus: "not_started",
      stemsRequestedAt: null,
      stemsCompletedAt: null,
      stemsError: null,
      stemDrumsUrl: null,
      stemBassUrl: null,
      stemVocalsUrl: null,
      stemOtherUrl: null,
      stemsMetadata: null,
    };

    setVersions([emptyVersion]);
    setActiveVersionId(emptyVersion.id);
    setLocalUploadFile(null);
    setPreviewUrl(null);
    setActivePreset(null);
    setMixer(initialMixer);
    setActionState("start-empty", "success");
    clearActionState("start-empty", 2200);
    setWorkspaceStatus("Started an empty Studio PRO workspace. Upload or open audio when ready.");
  }

  async function importFirstStudioProject() {
    beginAction("import-studio", true);
    const studioProject = studioImportProjects[0] || projects.find((project) => project.source === "studio");
    console.log("IMPORT LATEST RESULT", studioProject || projects);
    if (studioProject) {
      try {
        await openProject(studioProject);
        setActionState("import-studio", "success");
        clearActionState("import-studio", 2200);
      } catch {
        setActionState("import-studio", "error");
      }
      return;
    }
    try {
      await loadProjects();
      setActionState("import-studio", "success");
      clearActionState("import-studio", 2200);
    } catch {
      setActionState("import-studio", "error");
    }
  }

  async function refreshActiveVersionFromDb(trackGroupId: string, preferredVersionId: string) {
    const response = await fetch(
      `/api/generate-track/versions?trackGroupId=${encodeURIComponent(trackGroupId)}`,
      { cache: "no-store" }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(payload, "Failed to refresh version data"));

    const nextVersions: StudioVersion[] = Array.isArray(payload?.versions)
      ? payload.versions.map(mapVersion)
      : [];
    if (nextVersions.length === 0) return null;

    setVersions(nextVersions);
    setActiveVersionId(
      nextVersions.some((version) => version.id === preferredVersionId)
        ? preferredVersionId
        : nextVersions[0].id
    );

    return nextVersions.find((version) => version.id === preferredVersionId) || nextVersions[0];
  }

  async function reconcileStemJob(trackGroupId: string, versionId: string, audioUrl: string) {
    try {
      const token = await getSessionToken();
      const response = await fetch("/api/studio/stems/prepare", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: versionId,
          trackGroupId,
          audioUrl,
          force: false,
        }),
      });
      const payload = await response.json().catch(() => null);
      console.log("STEM POLLING RECONCILE", {
        status: response.status,
        ok: response.ok,
        stemsStatus: payload?.stemsStatus,
        code: payload?.code,
      });
      return payload;
    } catch (error) {
      console.log("STEM POLLING RECONCILE FAILED", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async function saveLocalProProject() {
    if (!localUploadFile || !isLocalUpload || !activeVersion) {
      setActionState("save-pro", "error");
      setWorkspaceStatus("Upload a local PRO track before saving.");
      return;
    }

    setWorkingAction("save-pro");
    beginAction("save-pro", true);
    setWorkspaceStatus("Saving Studio PRO project...");
    try {
      const token = await getSessionToken();
      const formData = new FormData();
      formData.append("file", localUploadFile);
      formData.append("title", activeVersion.title);
      formData.append("projectName", activeVersion.title);
      formData.append("notes", "Imported directly from Studio PRO local upload.");

      const response = await fetch("/api/studio-pro/import-track", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiError(payload, "Failed to save Studio PRO project"));

      const persistedVersion = mapVersion(payload.version);
      setVersions([persistedVersion]);
      setActiveVersionId(persistedVersion.id);
      setLocalUploadFile(null);
      setPreviewUrl(null);
      await loadProjects();
      setVersions((current) =>
        current.some((version) => version.id === persistedVersion.id)
          ? current
          : [persistedVersion, ...current]
      );
      setActiveVersionId(persistedVersion.id);
      setActionState("save-pro", "success");
      clearActionState("save-pro");
      setWorkspaceStatus("Preparing stems in background…");
      window.setTimeout(() => {
        void prepareStems(persistedVersion, true);
      }, 0);
    } catch (error: any) {
      setActionState("save-pro", "error");
      setWorkspaceStatus(
        String(error?.message || "").toLowerCase().includes("log in")
          ? "Sign in to save this PRO project."
          : error?.message || "Failed to save Studio PRO project."
      );
    } finally {
      setWorkingAction(null);
    }
  }

  async function prepareStems(versionOverride?: StudioVersion, background = false) {
    const targetVersion = versionOverride || activeVersion;
    if (!targetVersion?.id || !targetVersion.trackGroupId || !targetVersion.audioUrl) {
      setActionState("prepare-stems", "error");
      setWorkspaceStatus(
        isLocalUpload
          ? "Save this PRO project before preparing stems."
          : "Open a persisted Studio PRO version with audio before preparing stems."
      );
      return;
    }
    if (targetVersion.stemsStatus === "ready" && !hasDuplicateStemUrls) {
      setActionState("prepare-stems", "success");
      clearActionState("prepare-stems");
      setWorkspaceStatus("Independent drum, bass, vocal, and music control active.");
      return;
    }
    if (targetVersion.stemsStatus === "queued" || targetVersion.stemsStatus === "processing") {
      setWorkspaceStatus(
        targetVersion.stemsStatus === "queued"
          ? "Stem separation queued."
          : "Separating drums, bass, vocals, and music..."
      );
      return;
    }

    setWorkingAction("prepare-stems");
    beginAction("prepare-stems", true);
    setWorkspaceStatus(
      hasDuplicateStemUrls
        ? "Retrying invalid stem set..."
        : targetVersion.stemsStatus === "error"
        ? "Retrying stem preparation..."
        : background
          ? "Preparing stems in background…"
          : "Stem separation queued."
    );
    try {
      const token = await getSessionToken();
      const forceRetry = hasDuplicateStemUrls || targetVersion.stemsStatus === "error";
      console.log("STEM JOB STARTED", {
        trackVersionId: targetVersion.id,
        trackGroupId: targetVersion.trackGroupId,
        force: forceRetry,
      });
      const response = await fetch("/api/studio/stems/prepare", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: targetVersion.id,
          trackGroupId: targetVersion.trackGroupId,
          audioUrl: targetVersion.audioUrl,
          force: forceRetry,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiError(payload, "Failed to prepare stems"));

      setVersions((current) =>
        current.map((version) =>
          version.id === targetVersion.id
            ? {
                ...version,
                stemsStatus: normalizeStemStatus(payload.stemsStatus || "queued"),
                stemsRequestedAt: payload.stemsRequestedAt || version.stemsRequestedAt || new Date().toISOString(),
                stemsError: null,
              }
            : version
        )
      );
      if (payload.stemsStatus === "ready" || payload.cached) {
        await refreshActiveVersionFromDb(targetVersion.trackGroupId, targetVersion.id);
        console.log("STEM READY STATE REACHED", { trackVersionId: targetVersion.id });
        setActionState("prepare-stems", "success");
        clearActionState("prepare-stems");
        setWorkspaceStatus("Independent drum, bass, vocal, and music control active.");
      } else {
        setWorkspaceStatus(
          payload.stemsStatus === "processing"
            ? "Separating drums, bass, vocals, and music..."
            : "Stem separation queued."
        );
      }
    } catch (error: any) {
      setActionState("prepare-stems", "error");
      setWorkspaceStatus("Stem preparation failed. Retry available.");
    } finally {
      setWorkingAction(null);
    }
  }

  function updateMixer(key: keyof MixerState, value: number | boolean | string) {
    setMixer((current) => ({ ...current, [key]: value }));
    setWorkspaceStatus("Realtime mastering active. Export a final master when ready.");
  }

  function applyLocalMixerAction(actionKey: string, update: () => void, status = "Realtime mastering active. Export a final master when ready.") {
    beginAction(actionKey);
    update();
    window.setTimeout(() => {
      setActionState(actionKey, "success");
      clearActionState(actionKey, 1800);
      setWorkspaceStatus(status);
    }, 160);
  }

  function restoreVersion(version: StudioVersion | null, status = "Version restored as active. No files were changed.") {
    if (!version?.id) return;
    setActiveVersionId(version.id);
    setWorkspaceStatus(status);
    setPreviewMasterReady(Boolean(version.audioUrl));
  }

  function navigateVersion(version: StudioVersion | null, direction: "previous" | "next") {
    if (!version) return;
    restoreVersion(
      version,
      direction === "previous"
        ? "Previous version restored as active. No files were changed."
        : "Next version restored as active. No files were changed."
    );
  }

  function applyPreset(name: PresetName, presetType: "genre" | "mastering" = "genre") {
    const preset =
      presets.find((item) => item.name === name) ||
      beforeUploadMasteringPresets.find((item) => item.name === name);
    if (!preset) return;
    const actionKey = `preset-${name}`;
    beginAction(actionKey);
    setWorkspaceStatus(`Applying ${name}...`);
    window.setTimeout(() => {
      setMixer(() => ({
        ...initialMixer,
        dnbFeel: 0,
        houseFeel: 0,
        clubEnergy: 0,
        overdriveMode: "Clean",
        ...preset.mixer,
      }));
      setActivePreset(name);
      if (presetType === "mastering") {
        setActiveMasteringPreset(name);
      }
      setActiveQuickMasterAction(null);
      setActionState(actionKey, "success");
      clearActionState(actionKey, 2000);
      setWorkspaceStatus(
        presetType === "mastering"
          ? `${name} mastering preset applied.`
          : `${name} applied with safe gain staging.`
      );
    }, 180);
  }

  function applyQuickMasterAction(action: (typeof quickMasterActions)[number]) {
    const actionKey = `quick-${action.label}`;
    beginAction(actionKey);
    setWorkspaceStatus(`Applying ${action.label}...`);
    window.setTimeout(() => {
      setMixer((current) => ({
        ...current,
        ...action.mixer,
      }));
      setActiveQuickMasterAction(action.label);
      setActionState(actionKey, "success");
      clearActionState(actionKey, 2000);
      setWorkspaceStatus(`${action.label} active — compare A Original vs B PRO Mix.`);
    }, 180);
  }

  function applyArrangementAction(action: (typeof arrangementActions)[number]) {
    if (activeVersion?.id) {
      setActiveVersionId(activeVersion.id);
    }
    setCompareMode("mix");
    setPreviewTarget("arrangement");
    setPreviewMasterReady(Boolean(activeVersion?.audioUrl));
    if (activeVersion?.audioUrl) {
      setActionState("preview", "success");
      clearActionState("preview");
    }
    setDoneArrangementAction(null);
    setErrorArrangementAction(null);
    setArrangementRenderError(null);
    setArrangementSections((current) => action.apply(current));
    setArrangementEditHistory((current) => [action.chip, ...current.filter((chip) => chip !== action.chip)].slice(0, 8));
    setArrangementRenderState("preview");
    setPendingArrangementChanges((current) => [
      {
        id: `${action.label}-${Date.now()}`,
        label: action.label,
        chip: action.chip,
        diff: action.diff,
        status: action.status,
        branch: action.branch,
        renderType: action.renderType,
      },
      ...current,
    ].slice(0, 8));
    if (action.branch) {
      setSelectedArrangementBranch(action.branch);
      setArrangementBranches((current) => {
        const existing = current.find((branch) => branch.name === action.branch);
        const nextBranch = {
          name: action.branch!,
          timestamp: "Just now",
          badges: ["Local edit", action.chip],
        };
        return existing
          ? current.map((branch) => branch.name === action.branch ? { ...branch, ...nextBranch } : branch)
          : [nextBranch, ...current];
      });
      if (action.branch === "Extended Mix") {
        setWorkspaceStatus("Extended mix branch staged. Staged — not rendered yet.");
      } else {
        setWorkspaceStatus(`${action.status} Staged — not rendered yet.`);
      }
    } else {
      setWorkspaceStatus(`${action.status} Staged — not rendered yet.`);
    }
  }

  function removePendingArrangementChange(id: string) {
    setPendingArrangementChanges((current) => current.filter((change) => change.id !== id));
    setArrangementEditHistory((current) =>
      current.filter((chip) => pendingArrangementChanges.find((change) => change.id === id)?.chip !== chip)
    );
    setWorkspaceStatus("Arrangement change removed.");
  }

  function scrollToVersionCard(versionId: string) {
    const versionCard = document.getElementById(`studio-pro-version-${versionId}`);
    if (versionCard) {
      versionCard.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    versionHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function compareArrangementVersion(versionId: string) {
    setActiveVersionId(versionId);
    setCompareMode("mix");
    setArrangementSuccessToast(null);
    window.setTimeout(() => {
      void realtimeMixPreview.play();
    }, 180);
  }

  function arrangementSuccessSubtitle(action: (typeof arrangementActions)[number]) {
    if (action.renderType === "extend-chorus") return "Extended Chorus version is ready.";
    if (action.renderType === "radio-edit") return "Radio Edit version rendered.";
    if (action.renderType === "instrumental") return "Instrumental version created.";
    if (action.renderType === "loop-section") return "Loop Edit version is ready.";
    if (action.renderType === "shorten-intro") return "Radio Intro Edit version rendered.";
    return "Arrangement version is ready.";
  }

  function arrangementActionState(action: (typeof arrangementActions)[number]) {
    if (renderingArrangementAction === action.label) return "rendering";
    if (errorArrangementAction === action.label) return "error";
    if (doneArrangementAction === action.label) return "done";
    if (pendingArrangementChanges.some((change) => change.label === action.label)) return "staged";
    return "idle";
  }

  function arrangementActionClass(action: (typeof arrangementActions)[number]) {
    if (arrangementActionRequiresStems(action) && !stemsReady) {
      return getActionButtonClass("disabled");
    }
    const state = arrangementActionState(action);
    if (state === "rendering") {
      return getActionButtonClass("working");
    }
    if (state === "error") {
      return getActionButtonClass("error");
    }
    if (state === "done") {
      return getActionButtonClass("success");
    }
    if (state === "staged") {
      return getActionButtonClass("staged");
    }
    return getActionButtonClass("idle");
  }

  function arrangementActionLabel(action: (typeof arrangementActions)[number]) {
    if (arrangementActionRequiresStems(action) && !stemsReady) return `${action.label} 🔒`;
    const state = arrangementActionState(action);
    if (state === "rendering") return "Rendering…";
    if (state === "error") return "Error";
    if (state === "done") return "Ready ✓";
    if (state === "staged") return "Staged";
    return action.label;
  }

  function arrangementActionRequiresStems(action: (typeof arrangementActions)[number]) {
    return (
      action.renderType === "extend-chorus" ||
      action.renderType === "loop-section" ||
      action.renderType === "instrumental" ||
      action.renderType === "radio-edit"
    );
  }

  function getPendingRenderableArrangementAction() {
    const pending = pendingArrangementChanges.find((change) => change.renderType);
    if (!pending) return null;
    return arrangementActions.find((item) => item.label === pending.label) || null;
  }

  function pendingArrangementNeedsStems() {
    const action = getPendingRenderableArrangementAction();
    return Boolean(action && arrangementActionRequiresStems(action) && !stemsReady);
  }

  function renderArrangementButtonLabel() {
    if (pendingArrangementNeedsStems()) return "Prepare stems first";
    const state = getActionState("arrangement-render");
    if (state === "working") return "Rendering...";
    if (state === "success") return "Version Ready ✓";
    if (state === "error") return "Error";
    return "Render Arrangement Version";
  }

  function buildArrangementRenderError(
    action: (typeof arrangementActions)[number],
    message: string,
    backendStatus: ArrangementRenderError["backendStatus"],
    backendBody: unknown
  ): ArrangementRenderError {
    return {
      message,
      actionName: action.label,
      selectedSection: selectedArrangementSection,
      activeVersionId: activeVersion?.id || null,
      trackGroupId: activeVersion?.trackGroupId || null,
      hasAudioUrl: Boolean(activeVersion?.audioUrl),
      stemsReady,
      backendStatus,
      backendBody,
    };
  }

  async function renderPendingArrangementVersion() {
    if (!pendingArrangementChanges.length) return;
    const pending = pendingArrangementChanges.find((change) => change.renderType);
    if (!pending) {
      setWorkspaceStatus("Choose Loop, Extend Chorus, Shorten Intro, Instrumental, or Radio Edit to render a new version.");
      return;
    }
    const action = arrangementActions.find((item) => item.label === pending.label);
    if (!action) return;
    if (arrangementActionRequiresStems(action) && !stemsReady) {
      const message = "Prepare stems first, then render this arrangement edit.";
      setPreviewTarget("arrangement");
      setPreviewMasterReady(Boolean(activeVersion?.audioUrl));
      setCompareMode("mix");
      setArrangementRenderError(buildArrangementRenderError(action, message, "not_sent", null));
      setWorkspaceStatus(message);
      return;
    }
    await renderArrangementAction(action);
  }

  async function renderArrangementAction(action: (typeof arrangementActions)[number]) {
    if (!action.renderType) return;
    if (!activeVersion?.id || !activeVersion.trackGroupId || !activeVersion.audioUrl) {
      const message = "Load or save a PRO project before rendering.";
      setErrorArrangementAction(action.label);
      setActionState("arrangement-render", "error");
      setPreviewTarget("arrangement");
      setPreviewMasterReady(Boolean(activeVersion?.audioUrl));
      setCompareMode("mix");
      setArrangementRenderError(buildArrangementRenderError(action, message, "not_sent", null));
      setWorkspaceStatus(message);
      return;
    }
    if (arrangementActionRequiresStems(action) && !stemsReady) {
      const message = "Prepare stems first, then render this arrangement edit.";
      setPreviewTarget("arrangement");
      setPreviewMasterReady(true);
      setCompareMode("mix");
      setArrangementRenderError(buildArrangementRenderError(action, message, "not_sent", null));
      setWorkspaceStatus(message);
      return;
    }

    const selectedSection = arrangementSections.find((section) => section.name === selectedArrangementSection);
    const loopDuration =
      selectedSection && selectedSection.length <= 18
        ? "15"
        : selectedSection && selectedSection.length <= 34
          ? "30"
          : "60";
    const mixerOverride: MixerState = {
      ...mixer,
      loopMode: "off",
      extendMode: "off",
      masterNormalize: true,
    };
    const arrangementMetadata: Record<string, unknown> = {
      arrangementRender: true,
      arrangementType: action.renderType,
      section: selectedArrangementSection.toLowerCase(),
      badge: action.chip,
    };

    if (action.renderType === "loop-section") {
      mixerOverride.loopMode = loopDuration as LoopMode;
      arrangementMetadata.labelBase = "Loop Edit";
      arrangementMetadata.repeatCount = 3;
    } else if (action.renderType === "extend-chorus") {
      mixerOverride.extendMode = "15";
      arrangementMetadata.labelBase = "Extended Chorus";
      arrangementMetadata.section = "chorus";
      arrangementMetadata.extendSeconds = 15;
    } else if (action.renderType === "shorten-intro") {
      mixerOverride.loudness = Math.max(mixerOverride.loudness, 18);
      mixerOverride.compression = Math.max(mixerOverride.compression, 26);
      arrangementMetadata.labelBase = "Radio Intro Edit";
      arrangementMetadata.section = "intro";
      arrangementMetadata.trimStartSeconds = 8;
    } else if (action.renderType === "instrumental") {
      mixerOverride.vocal = 0;
      arrangementMetadata.labelBase = "Instrumental";
    } else if (action.renderType === "radio-edit") {
      mixerOverride.loudness = Math.max(mixerOverride.loudness, 26);
      mixerOverride.compression = Math.max(mixerOverride.compression, 34);
      mixerOverride.limiter = Math.max(mixerOverride.limiter, 50);
      mixerOverride.clipSafe = Math.max(mixerOverride.clipSafe, 64);
      arrangementMetadata.labelBase = "Radio Edit";
      arrangementMetadata.section = "full";
      arrangementMetadata.trimStartSeconds = 8;
      arrangementMetadata.trimEndSeconds = 8;
    }

    setWorkingAction("arrangement-render");
    beginAction("arrangement-render", true);
    setRenderingArrangementAction(action.label);
    setDoneArrangementAction(null);
    setErrorArrangementAction(null);
    setArrangementRenderError(null);
    setWorkspaceStatus("Rendering arrangement version...");
    try {
      const token = await getSessionToken();
      const response = await fetch("/api/studio/mixer/render", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackVersionId: activeVersion.id,
          trackGroupId: activeVersion.trackGroupId,
          title: activeVersion.title,
          mixer: mixerOverride,
          preview: false,
          coproducerPreset: activePreset,
          arrangementMetadata,
          studioProMetadata: {
            studioPro: true,
            studioProRenderMode: "arrangement-render-v1",
            humanDirectedEdit: true,
            activePreset,
            source: "studio-pro",
            dspChain: buildStudioProDspChain(mixerOverride),
          },
          stem_drums_url: activeVersion.stemDrumsUrl,
          stem_bass_url: activeVersion.stemBassUrl,
          stem_vocals_url: activeVersion.stemVocalsUrl,
          stem_other_url: activeVersion.stemOtherUrl,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const rawMessage = getApiError(payload, "Arrangement render failed");
        const message = rawMessage.toLowerCase().includes("prepare stems before rendering a mix")
          ? "Prepare stems first, then render this arrangement edit."
          : rawMessage;
        setArrangementRenderError(buildArrangementRenderError(action, message, response.status, payload));
        throw new Error(message);
      }
      const nextVersion = mapVersion(payload.version);
      setVersions((current) => [nextVersion, ...current.filter((version) => version.id !== nextVersion.id)]);
      setActiveVersionId(nextVersion.id);
      setHighlightVersionId(nextVersion.id);
      setVersionsOpen(true);
      setArrangementBranchesOpen(true);
      setArrangementRenderState("rendered");
      setPendingArrangementChanges([]);
      setArrangementEditHistory([]);
      setArrangementRenderError(null);
      window.setTimeout(() => setHighlightVersionId(null), 4000);
      setArrangementBranches((current) => {
        const nextBranch = {
          name: action.branch || action.chip,
          timestamp: "Just now",
          badges: [action.chip, "Rendered"],
        };
        const exists = current.some((branch) => branch.name === nextBranch.name);
        return exists
          ? current.map((branch) => branch.name === nextBranch.name ? { ...branch, ...nextBranch } : branch)
          : [nextBranch, ...current];
      });
      if (action.branch) setSelectedArrangementBranch(action.branch);
      setFrozenCompareVersionId(nextVersion.id);
      setCompareMode("frozen");
      setPreviewTarget(null);
      setArrangementSuccessToast({
        versionId: nextVersion.id,
        title: "New arrangement version ready",
        subtitle: arrangementSuccessSubtitle(action),
      });
      setDoneArrangementAction(action.label);
      setActionState("arrangement-render", "success");
      clearActionState("arrangement-render");
      window.setTimeout(() => {
        setDoneArrangementAction((current) => (current === action.label ? null : current));
      }, 3000);
      setWorkspaceStatus("Arrangement version ready.");
      window.setTimeout(() => {
        scrollToVersionCard(nextVersion.id);
        void realtimeMixPreview.play();
      }, 120);
      window.setTimeout(() => {
        versionHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 420);
      window.setTimeout(() => {
        arrangementBranchesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 900);
      window.setTimeout(() => setArrangementSuccessToast(null), 8000);
      void loadProjects(true);
    } catch (error: any) {
      setErrorArrangementAction(action.label);
      setActionState("arrangement-render", "error");
      const rawMessage = error?.message || "Arrangement render failed.";
      const message = String(rawMessage).toLowerCase().includes("prepare stems before rendering a mix")
        ? "Prepare stems first, then render this arrangement edit."
        : rawMessage;
      if (String(rawMessage).toLowerCase().includes("prepare stems")) {
        setPreviewTarget("arrangement");
        setPreviewMasterReady(true);
        setCompareMode("mix");
      }
      setArrangementRenderError((current) => current || buildArrangementRenderError(action, message, null, null));
      setWorkspaceStatus(message);
    } finally {
      setWorkingAction(null);
      setRenderingArrangementAction(null);
    }
  }

  function updateArrangementLoop(mode: ArrangementLoopMode) {
    setArrangementLoopMode(mode);
    setWorkspaceStatus(
      mode === "off"
        ? "Section loop disabled."
        : mode === "section"
          ? `${selectedArrangementSection} loop staged locally.`
          : `${mode}s arrangement loop staged locally.`
    );
  }

  function switchCompareMode(nextMode: "original" | "mix" | "frozen") {
    if (nextMode === "frozen" && !frozenCompareVersion?.audioUrl) {
      setWorkspaceStatus("Commit a master before using Frozen comparison.");
      return;
    }
    if (compareMode === nextMode) return;
    pendingCompareSwitchRef.current = {
      time: currentTime,
      wasPlaying: playing,
    };
    setCompareMode(nextMode);
    setWorkspaceStatus(
      nextMode === "mix"
        ? "PRO Mix selected. Realtime mastering active."
        : nextMode === "frozen"
          ? "Committed master selected for A/B comparison."
          : "Original selected. Original Reference playback active."
    );
  }

  async function togglePlayback() {
    if (!playbackVersion?.audioUrl) return;
    try {
      await realtimeMixPreview.toggle();
    } catch (error: any) {
      setWorkspaceStatus(error?.message || "Could not start realtime playback.");
      setPlaying(false);
    }
  }

  function skipRealtime(seconds: number) {
    realtimeMixPreview.seek(Math.max(0, currentTime + seconds));
  }

  function seekFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (!duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    realtimeMixPreview.seek(ratio * duration);
  }

  async function callRender(preview: boolean, freeze = false) {
    const actionKey = preview ? "preview" : freeze ? "freeze" : "render";
    if (!preview && !freeze) {
      console.log("Render Final Master", {
        activeVersionId: activeVersion?.id || null,
        audioUrl: activeVersion?.audioUrl || null,
        title: activeVersion?.title || "",
        stemsStatus: activeVersion?.stemsStatus || null,
        exportStatus: exportWorkflowStatus,
      });
      console.log("ACTIVE VERSION", activeVersion);
      console.log("SELECTED PROJECT", selectedProject);
      console.log("CURRENT PROJECT", currentProject);
      console.log("PROJECT VERSION", projectVersion);
      console.log("RENDER SOURCE OBJECT", renderSource);
    }
    const missingRenderFinalMasterReason =
      !preview && !freeze ? renderFinalMasterBlockedReason : "";
    if (missingRenderFinalMasterReason) {
      setActionState(actionKey, "error");
      setExportWorkflowStatus("Failed");
      setWorkspaceStatus(missingRenderFinalMasterReason);
      return;
    }
    if ((preview || freeze) && (!activeVersion?.id || !activeVersion.trackGroupId || !activeVersion.audioUrl)) {
      if (preview && activeVersion?.audioUrl) {
        setWorkingAction("preview");
        beginAction("preview", true);
        setWorkspaceStatus("Preparing realtime preview master...");
        window.setTimeout(() => {
          setPreviewMasterReady(true);
          setActionState("preview", "success");
          clearActionState("preview");
          setWorkspaceStatus("Preview master ready.");
          setWorkingAction(null);
        }, 300);
        return;
      }
      setActionState(actionKey, "error");
      if (!preview) setExportWorkflowStatus("Failed");
      setWorkspaceStatus("Open a persisted Studio version with audio first.");
      return;
    }
    if (!activeVersion) return;

    setWorkingAction(actionKey);
    beginAction(actionKey, true);
    if (actionKey === "render") setRenderFailureMessage("");
    if (!preview) setExportWorkflowStatus("Rendering");
    setWorkspaceStatus(preview ? "Preparing preview master..." : freeze ? "Committing master..." : "Rendering final master...");
    try {
      let token = "";
      let renderVersion = activeVersion;
      const shouldPersistBeforeFinalRender =
        !preview &&
        !freeze &&
        (renderVersion.id.startsWith("track-") ||
          renderVersion.id.startsWith("draft-") ||
          !renderVersion.trackGroupId);

      if (shouldPersistBeforeFinalRender) {
        if (!renderVersion.audioUrl) {
          throw new Error("missing audio URL");
        }
        token = await getSessionToken();
        setWorkspaceStatus("Saving imported Studio version...");
        const persistResponse = await fetch("/api/studio/versions/save", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: renderVersion.title,
            projectName: renderVersion.title,
            audioUrl: renderVersion.audioUrl,
            artworkUrl: renderVersion.artworkUrl || null,
            duration: renderVersion.duration,
            createdFrom: "import",
            generationMode: "import",
            importedSource: "studio-pro-render",
          }),
        });
        const persistText = await persistResponse.text();
        const persistPayload = persistText
          ? (() => {
              try {
                return JSON.parse(persistText);
              } catch {
                return null;
              }
            })()
          : null;
        if (!persistResponse.ok) {
          throw new Error(getApiError(persistPayload, persistText || "Failed to save imported Studio version"));
        }
        const persistedVersion = mapVersion(persistPayload?.version);
        if (!persistedVersion.id || !persistedVersion.trackGroupId) {
          throw new Error("Persisted Studio version is missing trackGroupId");
        }
        renderVersion = persistedVersion;
        setVersions((current) => [
          persistedVersion,
          ...current.filter((version) => version.id !== activeVersion.id && version.id !== persistedVersion.id),
        ]);
        setActiveVersionId(persistedVersion.id);
      }

      const selectedVersionId =
        renderVersion.id &&
        !renderVersion.id.startsWith("draft-") &&
        !renderVersion.id.startsWith("track-")
          ? renderVersion.id
          : "";
      const realTrackVersionId =
        renderVersion.id && !renderVersion.id.startsWith("draft-") && !renderVersion.id.startsWith("track-")
          ? renderVersion.id
          : activeProject?.sourceTrackVersionId || activeProject?.trackVersionId || selectedVersionId;
      const realTrackGroupId =
        renderVersion.trackGroupId ||
        activeProject?.trackGroupId ||
        activeProject?.sourceTrackGroupId ||
        "";
      const missingRealIdReason = !realTrackVersionId
        ? "missing real trackVersionId"
        : !realTrackGroupId
          ? "missing real trackGroupId"
          : "";

      if (missingRealIdReason) {
        setActionState(actionKey, "error");
        if (!preview) setExportWorkflowStatus("Failed");
        if (actionKey === "render") setRenderFailureMessage(missingRealIdReason);
        setWorkspaceStatus(missingRealIdReason);
        return;
      }

      if (!token) token = await getSessionToken();
      const committedAt = new Date().toISOString();
      const studioProMetadata = {
        studioPro: true,
        studioProRenderMode: "realtime-dsp-final-render-v1",
        studioProFreeze: freeze,
        freezeSourceVersionId: freeze ? renderVersion.id : null,
        freezeType: freeze ? "realtime-dsp-freeze-v1" : null,
        humanDirectedEdit: true,
        activePreset,
        committedAt: freeze ? committedAt : null,
        source: "studio-pro",
        dspChain: buildStudioProDspChain(mixer),
      };
      console.log("ACTIVE VERSION STATE", renderVersion);
      console.log("RENDER PAYLOAD", {
        trackVersionId: realTrackVersionId,
        trackGroupId: realTrackGroupId,
        rootVersionId: renderVersion.rootVersionId,
        parentVersionId: renderVersion.parentVersionId,
        title: renderVersion.title,
        audioUrl: renderVersion.audioUrl,
      });
      console.log("RENDER REQUEST", {
        activeVersionId: realTrackVersionId,
        trackGroupId: realTrackGroupId,
        rootVersionId: renderVersion.rootVersionId,
        parentVersionId: renderVersion.parentVersionId,
        audioUrl: renderVersion.audioUrl,
        title: renderVersion.title,
      });
      const renderPayload = {
        trackVersionId: realTrackVersionId,
        trackGroupId: realTrackGroupId,
        title: renderVersion.title,
        mixer,
        preview,
        previewSeconds: Number(mixer.previewMode === "off" ? 10 : mixer.previewMode),
        coproducerPreset: activePreset,
        studioProMetadata,
        stem_drums_url: renderVersion.stemDrumsUrl,
        stem_bass_url: renderVersion.stemBassUrl,
        stem_vocals_url: renderVersion.stemVocalsUrl,
        stem_other_url: renderVersion.stemOtherUrl,
      };
      console.log("EXACT RENDER PAYLOAD BODY", renderPayload);
      const response = await withTimeout(
        fetch("/api/studio/mixer/render", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(renderPayload),
        }),
        90000
      );
      console.log("RENDER RESPONSE STATUS", response.status);
      const responseBody = await response.text();
      if (!response.ok) {
        console.log("RENDER RESPONSE BODY", responseBody);
      }
      const payload = responseBody
        ? (() => {
            try {
              return JSON.parse(responseBody);
            } catch {
              return null;
            }
          })()
        : null;
      if (!response.ok) throw new Error(getApiError(payload, responseBody || "Render failed"));

      if (preview) {
        setPreviewUrl(payload.previewUrl || null);
        setPreviewMasterReady(true);
        setPreviewTarget("master");
        setActionState("preview", "success");
        clearActionState("preview");
        setWorkspaceStatus("Preview master ready.");
      } else {
        const nextVersion = mapVersion(payload.version);
        setVersions((current) => [nextVersion, ...current.filter((version) => version.id !== nextVersion.id)]);
        if (freeze) {
          setFrozenCompareVersionId(nextVersion.id);
          setHighlightVersionId(nextVersion.id);
          window.setTimeout(() => setHighlightVersionId(null), 2800);
          setCompareMode("frozen");
          setActionState("freeze", "success");
          clearActionState("freeze");
          setExportWorkflowStatus("Export ready");
          setWorkspaceStatus("PRO Mix committed from realtime DSP chain.");
        } else {
          setActiveVersionId(nextVersion.id);
          setActionState("render", "success");
          clearActionState("render");
          setExportWorkflowStatus("Export ready");
          setWorkspaceStatus("Final master rendered.");
        }
        void loadProjects(true);
      }
    } catch (error: any) {
      setActionState(actionKey, "error");
      if (!preview) setExportWorkflowStatus("Failed");
      const errorMessage =
        String(error?.message || "").includes("timed out")
          ? "Render timed out. Try again."
          : freeze
            ? "Commit failed. Try again."
            : error?.message || "Render failed.";
      if (actionKey === "render") setRenderFailureMessage(errorMessage);
      setWorkspaceStatus(errorMessage);
    } finally {
      setWorkingAction(null);
    }
  }

  function downloadVersion() {
    if (!activeVersion?.audioUrl) {
      setActionState("download", "error");
      setExportWorkflowStatus("Failed");
      setWorkspaceStatus("Load audio first.");
      return;
    }
    setWorkingAction("download");
    beginAction("download", true);
    setExportWorkflowStatus("Rendering");
    const link = document.createElement("a");
    link.href = activeVersion.audioUrl;
    link.download = `${sanitizeDownloadName(activeVersion.title)}.mp3`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setActionState("download", "success");
    clearActionState("download");
    setWorkingAction(null);
    setExportWorkflowStatus("Export ready");
    setWorkspaceStatus("Download started.");
  }

  async function exportStems() {
    if (!activeVersion || !stemsReady) {
      setActionState("export", "error");
      setExportWorkflowStatus("Failed");
      setWorkspaceStatus("Stems must be ready before export.");
      return;
    }
    setWorkingAction("export");
    beginAction("export", true);
    setExportWorkflowStatus("Rendering");
    try {
      const token = await getSessionToken();
      const response = await fetch("/api/studio/stems/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: activeVersion.title,
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
        throw new Error(getApiError(payload, "Stem export failed"));
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${sanitizeDownloadName(activeVersion.title)}-stems.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setActionState("export", "success");
      clearActionState("export");
      setExportWorkflowStatus("Export ready");
      setWorkspaceStatus("Stem download started.");
    } catch (error: any) {
      setActionState("export", "error");
      setExportWorkflowStatus("Failed");
      setWorkspaceStatus(error?.message || "Stem export failed.");
    } finally {
      setWorkingAction(null);
    }
  }

  async function downloadReleasePackage() {
    console.log("RELEASE PACKAGE CLICK", { activeVersion, renderSource, activeProject });
    setActionFeedback((current) => {
      if (!current["release-package"]) return current;
      const next = { ...current };
      delete next["release-package"];
      return next;
    });

    const releaseVersion = activeVersion || renderSource;
    const releaseTitle = releaseVersion?.title?.trim() || activeProject?.title?.trim() || "";
    const releaseTrackVersionId =
      releaseVersion?.id && !releaseVersion.id.startsWith("draft-") && !releaseVersion.id.startsWith("track-")
        ? releaseVersion.id
        : activeProject?.sourceTrackVersionId || activeProject?.trackVersionId || "";
    const releaseTrackGroupId =
      releaseVersion?.trackGroupId ||
      activeProject?.trackGroupId ||
      activeProject?.sourceTrackGroupId ||
      "";
    const releaseAudioUrl = releaseVersion?.audioUrl || activeProject?.audioUrl || "";
    const blockedReason = !releaseTrackVersionId
      ? "missing activeVersion id"
      : !releaseTrackGroupId
        ? "missing trackGroupId"
        : !releaseAudioUrl
          ? "missing audioUrl"
          : !releaseTitle
            ? "missing title"
            : "";

    if (blockedReason) {
      console.log("RELEASE PACKAGE BLOCKED", blockedReason);
      setExportWorkflowStatus("Ready to export");
      setWorkspaceStatus(blockedReason);
      return;
    }

    const releasePayload = {
      trackVersionId: releaseTrackVersionId,
      trackGroupId: releaseTrackGroupId,
      title: releaseTitle,
    };
    console.log("RELEASE PACKAGE PAYLOAD", releasePayload);

    setWorkingAction("release-package");
    beginAction("release-package", true);
    setExportWorkflowStatus("Rendering");
    let requestSent = false;
    try {
      const token = await getSessionToken();
      requestSent = true;
      const response = await fetch("/api/studio-pro/release-package", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(releasePayload),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(getApiError(payload, "Release package failed"));
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${sanitizeDownloadName(releaseTitle)}-release-package.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setActionState("release-package", "success");
      clearActionState("release-package");
      setExportWorkflowStatus("Export ready");
      setWorkspaceStatus("Release package download started.");
    } catch (error: any) {
      if (requestSent) {
        setActionState("release-package", "error");
        setExportWorkflowStatus("Failed");
      } else {
        setActionFeedback((current) => {
          if (!current["release-package"]) return current;
          const next = { ...current };
          delete next["release-package"];
          return next;
        });
        setExportWorkflowStatus("Ready to export");
      }
      setWorkspaceStatus(error?.message || "Release package failed.");
    } finally {
      setWorkingAction(null);
    }
  }

  async function submitToSoundioX() {
    const title = activeVersion?.title?.trim() || activeProject?.title?.trim() || "";
    const missingErrors = [
      !activeVersion?.audioUrl ? "missing audio URL" : "",
      !title ? "missing title" : "",
      !activeVersion?.id || !activeVersion.trackGroupId ? "missing version id" : "",
    ].filter(Boolean);

    if (missingErrors.length > 0) {
      setActionState("submit-soundiox", "error");
      setSubmitWorkflowStatus("Failed");
      setSubmitError(missingErrors.join(", "));
      setWorkspaceStatus(missingErrors.join(", "));
      return;
    }
    if (!activeVersion) return;

    const artist = activeProject?.artist?.trim() || "SoundioX Artist";
    const genre = activeProject?.genre && isSoundioXGenre(activeProject.genre) ? activeProject.genre : "Electronic";
    const payload = {
      trackVersionId: activeVersion.id,
      trackGroupId: activeVersion.trackGroupId,
      title,
      artist,
      genre,
      visibility: "draft" as const,
      versionNote: activeVersion.label || `Studio PRO version ${activeVersion.versionNumber || ""}`.trim(),
    };

    setWorkingAction("submit-soundiox");
    beginAction("submit-soundiox", true);
    setSubmitWorkflowStatus("Submitting");
    setSubmitError("");
    try {
      const token = await getSessionToken();
      const response = await fetch("/api/studio/publish-track", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getApiError(result, "Submit to SoundioX failed"));
      }

      setActionState("submit-soundiox", "success");
      clearActionState("submit-soundiox");
      setSubmitWorkflowStatus("Submitted");
      setWorkspaceStatus(`Submitted to SoundioX as draft${result?.trackId ? ` (${result.trackId})` : ""}.`);
    } catch (error: any) {
      setActionState("submit-soundiox", "error");
      setSubmitWorkflowStatus("Failed");
      setSubmitError(error?.message || "Submit to SoundioX failed.");
      setWorkspaceStatus(error?.message || "Submit to SoundioX failed.");
    } finally {
      setWorkingAction(null);
    }
  }

  async function requestStudioProCoProducerAdvice() {
    if (!activeVersion?.id) {
      setActionState("co-producer-advice", "error");
      setWorkspaceStatus("Open a Studio version before asking Co-Producer.");
      return;
    }

    setWorkingAction("co-producer-advice");
    beginAction("co-producer-advice", true);
    setCoProducerAdvice("");
    try {
      const response = await fetch("/api/co-producer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "edit",
          idea: activeVersion.title,
          currentDirection: [
            activeVersion.label ? `Version: ${activeVersion.label}` : "",
            activePreset ? `Co-Producer preset: ${activePreset}` : "",
            activeMasteringPreset ? `Mastering preset: ${activeMasteringPreset}` : "",
            activeQuickMasterAction ? `Quick master action: ${activeQuickMasterAction}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          userRequest: "Give concise Studio PRO mix/mastering advice for the active version. Do not change settings.",
          remaining: 1,
          context: {
            surface: "studio-pro",
            activeVersionId: activeVersion.id,
            title: activeVersion.title || activeProject?.title || null,
            prompt: activeVersion.importMetadata || activeVersion.metadata || null,
            lyrics: null,
            genre: activeProject?.genre || null,
            vocalMode: null,
            stemsStatus: activeVersion.stemsStatus,
            masteringSettings: {
              mixer,
              activePreset,
              activeMasteringPreset,
              activeQuickMasterAction,
            },
            versionNumber: activeVersion.versionNumber || null,
            rootVersionId: activeVersion.rootVersionId || activeVersion.id,
            parentVersionId: activeVersion.parentVersionId || null,
            trackGroupId: activeVersion.trackGroupId || null,
            exportStatus: exportWorkflowStatus,
            exportReadiness: {
              hasAudioUrl: Boolean(activeVersion.audioUrl),
              releasePackageReady: canReleasePackage,
              submitStatus: submitWorkflowStatus,
            },
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiError(payload, "Co-Producer request failed"));

      const result = typeof payload?.result === "string" ? payload.result.trim() : "";
      if (!result) throw new Error("Co-Producer returned an empty result");

      setCoProducerAdvice(result);
      setActionState("co-producer-advice", "success");
      clearActionState("co-producer-advice");
      setWorkspaceStatus("Co-Producer advice ready.");
    } catch (error: any) {
      setActionState("co-producer-advice", "error");
      setWorkspaceStatus(error?.message || "Co-Producer request failed.");
    } finally {
      setWorkingAction(null);
    }
  }

  function createProReport() {
    if (!activeVersion?.audioUrl || !canCreateProReport) {
      setActionState("report", "error");
      setExportWorkflowStatus("Failed");
      setWorkspaceStatus("Create a Studio PRO render or open a Studio PRO version before creating a report.");
      return;
    }
    beginAction("report", true);
    setExportWorkflowStatus("Rendering");

    const storedDspChain = asRecord(storedStudioProMetadata?.dspChain);
    const dspChain = storedDspChain || buildStudioProDspChain(mixer);
    const metadataSource = storedDspChain
      ? "Persisted Studio PRO metadata"
      : "Current live settings, not persisted metadata.";
    const renderedAt =
      typeof storedStudioProMetadata?.renderedAt === "string"
        ? storedStudioProMetadata.renderedAt
        : activeVersion.createdAt || new Date().toISOString();
    const preset =
      typeof storedStudioProMetadata?.activePreset === "string"
        ? storedStudioProMetadata.activePreset
        : activePreset;

    const report: StudioProReport = {
      reportId: `sx-pro-${activeVersion.id.slice(0, 8)}-${Date.now().toString(36)}`,
      trackTitle: activeVersion.title,
      activeVersionId: activeVersion.id,
      trackGroupId: activeVersion.trackGroupId,
      renderedAt,
      source: "Studio PRO",
      humanDirectedEdit: "yes",
      activePreset: preset || null,
      dspChain,
      dspChainSummary: summarizeDspChain(dspChain),
      stemsStatus: activeVersion.stemsStatus,
      exportedAudioUrl: activeVersion.audioUrl,
      metadataSource,
      disclaimer: PRO_REPORT_DISCLAIMER,
    };

    setProReport(report);
    setActionState("report", "success");
    clearActionState("report");
    setExportWorkflowStatus("Export ready");
    setWorkspaceStatus("Studio PRO Processing Report created.");
  }

  async function copyReportText() {
    if (!proReport) return;
    try {
      await navigator.clipboard.writeText(buildReportText(proReport));
      setWorkspaceStatus("Studio PRO report copied.");
    } catch {
      setWorkspaceStatus("Could not copy report text in this browser.");
    }
  }

  function downloadReportJson() {
    if (!proReport) return;
    const blob = new Blob([JSON.stringify(proReport, null, 2)], {
      type: "application/json",
    });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${sanitizeDownloadName(proReport.trackTitle)}-studio-pro-report.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    setWorkspaceStatus("Studio PRO report JSON download started.");
  }

  return (
    <main className="min-h-screen bg-[#05070d] px-4 pb-24 pt-6 text-white md:px-6">
      {arrangementSuccessToast ? (
        <div className="fixed right-4 top-5 z-50 w-[min(420px,calc(100vw-2rem))] rounded-[28px] border border-emerald-200/25 bg-[linear-gradient(145deg,rgba(6,78,59,0.92),rgba(8,47,73,0.88),rgba(88,28,135,0.72))] p-4 shadow-[0_24px_90px_rgba(16,185,129,0.22)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/80">
                Render Complete ✓
              </div>
              <div className="mt-1 text-lg font-semibold text-white">{arrangementSuccessToast.title}</div>
              <div className="mt-1 text-sm leading-6 text-white/68">{arrangementSuccessToast.subtitle}</div>
            </div>
            <button
              type="button"
              onClick={() => setArrangementSuccessToast(null)}
              className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/18"
            >
              ×
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => compareArrangementVersion(arrangementSuccessToast.versionId)}
              className={primaryProButtonClass}
            >
              Play New Version
            </button>
            <button
              type="button"
              onClick={() => {
                setVersionsOpen(true);
                setArrangementBranchesOpen(true);
                setActiveVersionId(arrangementSuccessToast.versionId);
                window.setTimeout(() => scrollToVersionCard(arrangementSuccessToast.versionId), 80);
              }}
              className={secondaryProButtonClass}
            >
              Open Version History
            </button>
          </div>
        </div>
      ) : null}
      {highlightVersionId && !versionsOpen ? (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full border border-cyan-100/25 bg-cyan-300/12 px-4 py-2 text-sm font-semibold text-cyan-50 shadow-[0_0_28px_rgba(103,232,249,0.18)] backdrop-blur-xl">
          New version added below
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/70">
              SoundioX
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
              Studio PRO
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
              AI music finishing and transformation suite for generated and imported Studio tracks.
              Realtime mastering for decisions, final export rendering for permanent masters.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadVersion} disabled={!activeVersion?.audioUrl || workingAction === "download"} className={getActionButtonClass(!activeVersion?.audioUrl ? "disabled" : getActionState("download"))}>
              {downloadMasterLabel()}
            </button>
            <button onClick={() => void exportStems()} disabled={!stemsReady || workingAction === "export"} className={getActionButtonClass(!stemsReady ? "disabled" : getActionState("export"))}>
              {exportStemsLabel()}
            </button>
            <button onClick={() => void downloadReleasePackage()} disabled={workingAction === "release-package"} title={releasePackageBlockedReason || "Create a release package for the current master."} className={getActionButtonClass(!canReleasePackage ? "disabled" : getActionState("release-package"))}>
              {releasePackageLabel()}
            </button>
            <button onClick={() => void submitToSoundioX()} disabled={workingAction === "submit-soundiox"} className={getActionButtonClass(!canSubmitToSoundioX ? "disabled" : getActionState("submit-soundiox"))}>
              {submitSoundioXLabel()}
            </button>
            <button onClick={() => void callRender(true)} disabled={!canPreviewMaster} title={previewMasterDisabledReason || "Preview the current realtime master."} className={getActionButtonClass(!canPreviewMaster ? "disabled" : getActionState("preview"))}>
              {previewMasterLabel()}
            </button>
            <button onClick={() => void callRender(false)} disabled={!canRenderFinalMaster || workingAction === "render"} className={getActionButtonClass(!canRenderFinalMaster ? "disabled" : getActionState("render"))}>
              {renderFinalLabel()}
            </button>
            {renderFinalMasterBlockedReason ? (
              <div className="basis-full rounded-2xl border border-white/10 bg-black/18 px-3 py-2 text-xs leading-5 text-white/52">
                {renderFinalMasterBlockedReason}
              </div>
            ) : null}
            <button
              onClick={() => void callRender(false, true)}
              disabled={!canCommitMix}
              title={commitMixDisabledReason || "Save the current master as a new version."}
              className={getActionButtonClass(!canCommitMix ? "disabled" : getActionState("freeze"))}
            >
              {commitMasterLabel()}
            </button>
          </div>
        </header>

        <section className="mb-5 rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(45,212,191,0.045)_45%,rgba(168,85,247,0.04))] p-4 shadow-[0_22px_80px_rgba(8,47,73,0.14)] backdrop-blur-2xl md:p-5">
          <div className="mb-4 flex flex-col gap-2 px-1 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                Start or Import Project
              </div>
              <div className="mt-1 text-sm text-white/58">
                Bring audio directly into PRO, open a saved version, or start a blank finishing workspace.
              </div>
            </div>
            <div className="text-xs font-semibold text-white/42">
              Local uploads stay in-browser for now.
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                beginAction("upload-local");
                resetActionState("upload-local", 1800);
                fileInputRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) createLocalVersionFromFile(file);
              }}
              className={`group rounded-[26px] p-4 text-left transition ${
                getActionState("upload-local") !== "idle"
                  ? getActionButtonClass(getActionState("upload-local"), "block")
                  : dragActive
                  ? "border-cyan-100/60 bg-cyan-300/14 shadow-[0_0_28px_rgba(103,232,249,0.18)]"
                  : "border-white/10 bg-black/16 hover:border-cyan-100/30 hover:bg-cyan-300/8"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">
                  {genericActionLabel("upload-local", "Upload your track", "Uploading...", "Uploaded ✓")}
                </span>
                <span className="rounded-full border border-cyan-100/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">
                  mp3 wav flac
                </span>
              </div>
              <div className="mt-3 rounded-2xl border border-dashed border-white/14 bg-white/[0.035] px-3 py-4 text-xs leading-5 text-white/54 transition group-hover:border-cyan-100/28">
                Drag audio here or click to choose a file.
              </div>
              {isLocalUpload ? (
                <span className="mt-3 inline-flex rounded-full border border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] px-3 py-2 text-xs font-semibold text-[#fff7ed]">
                  Local preview loaded
                </span>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) createLocalVersionFromFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </button>

            {isLocalUpload ? (
              <div className="rounded-[26px] border border-cyan-100/22 bg-cyan-300/8 p-4 shadow-[0_0_28px_rgba(103,232,249,0.10)]">
                <div className="text-sm font-semibold text-white">Save local upload</div>
                <div className="mt-2 text-xs leading-5 text-white/54">
                  Persist this upload as a real Studio PRO project so stems, render history, and exports survive refresh.
                </div>
                <button
                  type="button"
                  onClick={() => void saveLocalProProject()}
                  disabled={workingAction === "save-pro"}
                  className={`mt-4 ${getActionButtonClass(getActionState("save-pro"), "block")}`}
                >
                  {saveProProjectLabel()}
                </button>
              </div>
            ) : null}

            <div className="rounded-[26px] border border-white/10 bg-black/16 p-4">
              <div className="text-sm font-semibold text-white">Open existing SoundioX version</div>
              <div className="mt-2 text-xs leading-5 text-white/52">
                Load a saved Studio project or released draft into the PRO workspace.
              </div>
              <SoundioXDropdown
                label={loading ? "Loading..." : "Choose version"}
                value={activeProjectSelectId}
                options={projectDropdownOptions}
                onSelect={(value) => {
                  const project = projects.find((item) => item.id === value);
                  if (project) void openProject(project);
                }}
                className="mt-4 w-full"
              />
            </div>

            <button
              type="button"
              onClick={() => void importFirstStudioProject()}
              className={getActionButtonClass(getActionState("import-studio"), "block")}
            >
              <div className="text-sm font-semibold text-white">
                {genericActionLabel("import-studio", "Import from Studio", "Opening...", "Opened ✓")}
              </div>
              <div className="mt-2 text-xs leading-5 text-white/52">
                Pull the latest available Studio version into PRO with the existing version history.
              </div>
              <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/7 px-3 py-2 text-xs font-semibold text-white/72">
                Import latest Studio version
              </div>
            </button>

            <button
              type="button"
              onClick={startEmptyProject}
              className={getActionButtonClass(getActionState("start-empty"), "block")}
            >
              <div className="text-sm font-semibold text-white">
                {genericActionLabel("start-empty", "Start empty project", "Opening...", "Opened ✓")}
              </div>
              <div className="mt-2 text-xs leading-5 text-white/52">
                Create a blank PRO shell for settings, presets, and future audio import.
              </div>
              <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/7 px-3 py-2 text-xs font-semibold text-white/72">
                New blank workspace
              </div>
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-[38px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(45,212,191,0.052)_42%,rgba(168,85,247,0.055))] p-4 shadow-[0_34px_120px_rgba(8,47,73,0.24)] backdrop-blur-2xl md:p-6">
          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_220px] xl:items-stretch">
            <div className="flex flex-col justify-between rounded-[30px] border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div>
                <div className="aspect-square overflow-hidden rounded-[26px] border border-cyan-100/15 bg-[radial-gradient(circle_at_35%_25%,rgba(103,232,249,0.24),transparent_30%),radial-gradient(circle_at_70%_70%,rgba(168,85,247,0.22),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))] shadow-[0_24px_70px_rgba(6,182,212,0.08)]">
                  {activeVersion?.artworkUrl ? (
                    <img
                      src={activeVersion.artworkUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <h2 className="mt-4 truncate text-2xl font-semibold tracking-tight">
                  {activeVersion?.title || "Open a Studio project"}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-cyan-100/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-50">
                    {activeVersion?.label || "No version"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs font-semibold text-white/70">
                    V{activeVersion?.versionNumber || "-"}
                  </span>
                  {activeVersion?.isOriginal || activeVersion?.label?.toLowerCase() === "original" ? (
                    <span className="rounded-full border border-emerald-200/30 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                      Original protected
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs font-semibold text-white/70">
                    {activeVersion?.provider || "studio"}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    activeVersion?.trackGroupId
                      ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-100"
                      : "border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] text-[#fff7ed]"
                  }`}>
                    {activeVersion?.trackGroupId ? "Persisted" : "Local only"}
	                  </span>
	                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/16 p-3">
                  <div className="text-xs leading-5 text-white/58">
                    Restore changes only the active PRO selection. No files or version rows are changed.
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => navigateVersion(previousVersion, "previous")}
                      disabled={!previousVersion}
                      className={secondaryProButtonClass}
                    >
                      Previous Version
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateVersion(nextVersion, "next")}
                      disabled={!nextVersion}
                      className={secondaryProButtonClass}
                    >
                      Next Version
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreVersion(activeVersion)}
                      disabled={!activeVersion}
                      className={primaryProButtonClass}
                    >
                      Restore Version
                    </button>
                  </div>
                  {activeVersion && !activeVersion.audioUrl ? (
                    <div className="mt-3 rounded-xl border border-amber-200/25 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-50">
                      This version has no audio. Choose an audio version.
                    </div>
                  ) : null}
                </div>
              </div>
              <SoundioXDropdown
                label={loading ? "Loading projects..." : "Select project"}
                value={activeProjectSelectId}
                options={projectDropdownOptions}
                onSelect={(value) => {
                  const project = projects.find((item) => item.id === value);
                  if (project) void openProject(project);
                }}
                className="mt-5 w-full"
              />
            </div>

            <div
              className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(94,234,212,0.16),transparent_55%),radial-gradient(circle_at_60%_45%,rgba(168,85,247,0.12),transparent_48%),linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.70))] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition duration-200"
              style={{
                transform: `scale(${1 + proEnergy * 0.006})`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 0 ${24 + proEnergy * 42}px rgba(103,232,249,${0.08 + proEnergy * 0.15}), 0 0 ${18 + proEnergy * 34}px rgba(168,85,247,${0.05 + proEnergy * 0.10})`,
              }}
            >
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-white/8" />
              <div className="pointer-events-none absolute inset-x-12 top-1/2 h-14 -translate-y-1/2 bg-[linear-gradient(90deg,rgba(103,232,249,0.15),rgba(196,181,253,0.14))] blur-2xl" />
              <div
                className="relative flex h-44 cursor-pointer items-center gap-[3px] overflow-hidden"
                onPointerDown={seekFromPointer}
              >
                {waveformBars.map((height, index) => {
                  const filled = index / waveformBars.length <= progress / 100;
                  return (
                    <span
                      key={index}
                      className={`w-px shrink-0 rounded-full sm:w-[2px] ${
                        filled
                          ? "bg-[linear-gradient(180deg,#67e8f9,#c4b5fd)] shadow-[0_0_10px_rgba(103,232,249,0.32)]"
                          : "bg-white/15"
                      }`}
                      style={{ height: `${Math.min(92, height * (1 + proEnergy * 0.22))}%` }}
                    />
                  );
                })}
                <span className="absolute bottom-5 top-5 w-px bg-cyan-100/68 shadow-[0_0_14px_rgba(103,232,249,0.58)]" style={{ left: `${progress}%` }} />
              </div>
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => skipRealtime(-15)}
                    disabled={!playbackVersion?.audioUrl}
                    className="h-10 rounded-full border border-white/10 bg-white/[0.065] px-3 text-xs font-semibold text-white/74 transition hover:border-cyan-100/25 hover:bg-cyan-300/10 disabled:opacity-40"
                  >
                    -15s
                  </button>
                  <button onClick={() => void togglePlayback()} disabled={!playbackVersion?.audioUrl} className="h-12 w-12 rounded-full bg-cyan-100 text-slate-950 shadow-[0_0_26px_rgba(103,232,249,0.20)] transition hover:bg-white disabled:opacity-40">
                    {playing ? "Ⅱ" : "▶"}
                  </button>
                  <button
                    onClick={() => skipRealtime(15)}
                    disabled={!playbackVersion?.audioUrl}
                    className="h-10 rounded-full border border-white/10 bg-white/[0.065] px-3 text-xs font-semibold text-white/74 transition hover:border-cyan-100/25 hover:bg-cyan-300/10 disabled:opacity-40"
                  >
                    +15s
                  </button>
                  <span className="text-sm font-semibold text-white">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                <div
                  className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/10 sm:max-w-[280px]"
                  onPointerDown={seekFromPointer}
                >
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#67e8f9,#c4b5fd)] shadow-[0_0_12px_rgba(103,232,249,0.35)]" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex rounded-full border border-white/10 bg-black/24 p-1">
                  <button
                    type="button"
                    onClick={() => switchCompareMode("original")}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      compareMode === "original"
                        ? "bg-cyan-100 text-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.18)]"
                        : "text-white/58 hover:bg-white/8"
                    }`}
                  >
                    A Original
                  </button>
                  <button
                    type="button"
                    onClick={() => switchCompareMode("mix")}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      compareMode === "mix"
                        ? "bg-cyan-100 text-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.18)]"
                        : "text-white/58 hover:bg-white/8"
                    }`}
                  >
                    B PRO Mix
                  </button>
                  <button
                    type="button"
                    onClick={() => switchCompareMode("frozen")}
                    disabled={!frozenCompareVersion?.audioUrl}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                      compareMode === "frozen"
                        ? "bg-purple-100 text-slate-950 shadow-[0_0_18px_rgba(196,181,253,0.20)]"
                        : "text-white/58 hover:bg-white/8"
                    }`}
                  >
                    Frozen
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-[30px] border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/82">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      realtimeMixPreview.playing
                        ? "animate-pulse bg-emerald-200 shadow-[0_0_10px_rgba(167,243,208,0.55)]"
                        : "bg-white/30"
                    }`}
                  />
                  {compareMode === "mix"
                    ? realtimeMixPreview.playing
                      ? "Realtime DSP Active"
                      : "DSP Ready"
                    : compareMode === "frozen"
                      ? "Frozen DSP Version"
                      : "Original Reference"}
                </span>
                <div className="mt-4 grid gap-2 text-xs font-semibold text-white/70">
                  <span className={`rounded-2xl border px-3 py-2 ${
                    compareMode === "frozen"
                      ? "border-purple-100/25 bg-purple-300/12 text-purple-50"
                      : stemRoutingMode === "invalid"
                        ? "border-red-200/25 bg-red-400/10 text-red-100"
                      : stemRoutingMode === "ready"
                        ? "border-emerald-100/25 bg-emerald-300/10 text-emerald-50"
                      : stemRoutingMode === "partial"
                          ? "border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] text-[#fff7ed]"
                        : "border-cyan-100/20 bg-cyan-300/9 text-cyan-50"
                  }`}>
                    {compareMode === "mix"
                      ? stemRoutingMode === "invalid"
                        ? "Invalid Stem Set"
                        : stemRoutingMode === "ready"
                        ? "Stem Routing Ready"
                        : stemRoutingMode === "partial"
                          ? "Partial Stem Routing"
                        : "Stereo Fallback Active"
                      : compareMode === "frozen"
                        ? "Frozen DSP Version"
                        : "Original Reference"}
                  </span>
                  <span className="rounded-2xl border border-cyan-100/18 bg-white/7 px-3 py-2 text-cyan-50/78">
                    Live DSP Chain
                  </span>
                  <span className="rounded-2xl border border-purple-100/18 bg-purple-300/8 px-3 py-2 text-purple-50/76">
                    Realtime Processing
                  </span>
                  {realtimeMixPreview.isLoadingStems ? (
                    <span className="rounded-2xl border border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] px-3 py-2 text-[#fff7ed]">
                      Loading stems into realtime engine...
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    compareMode === "original"
                      ? "border-cyan-100/60 bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.18)]"
                      : "border-white/10 bg-white/[0.065] text-white/82 hover:border-cyan-100/25 hover:bg-cyan-300/10"
                  }`}
                  type="button"
                  onClick={() => switchCompareMode("original")}
                >
                  A
                </button>
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    compareMode === "mix"
                      ? "border-cyan-100/60 bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.18)]"
                      : "border-white/10 bg-white/[0.065] text-white/82 hover:border-cyan-100/25 hover:bg-cyan-300/10"
                  }`}
                  type="button"
                  onClick={() => switchCompareMode("mix")}
                >
                  B
                </button>
                <button
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                    compareMode === "frozen"
                      ? "border-purple-100/60 bg-purple-200 text-slate-950 shadow-[0_0_22px_rgba(196,181,253,0.18)]"
                      : "border-white/10 bg-white/[0.065] text-white/82 hover:border-purple-100/25 hover:bg-purple-300/10"
                  }`}
                  type="button"
                  disabled={!frozenCompareVersion?.audioUrl}
                  onClick={() => switchCompareMode("frozen")}
                >
                  Frozen
                </button>
                <button className="col-span-3 rounded-full border border-white/10 bg-white/7 px-4 py-2 text-xs font-semibold text-white/58" type="button">
                  {compareMode === "mix" ? "PRO Mix" : compareMode === "frozen" ? "Frozen version" : "Original"} compare ready
                </button>
                <div className="col-span-3 text-xs leading-5 text-white/46">
                  Compare your original track, the live Studio PRO mix, and the latest committed frozen version.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(45,212,191,0.04),rgba(168,85,247,0.045))] p-5 shadow-[0_22px_80px_rgba(8,47,73,0.14)] backdrop-blur-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                Arrangement
              </div>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">Shape the structure of your track before exporting the final master.</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
                Non-destructive arrangement preview for AI-native music editing. Original versions always remain intact.
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
              Non-destructive editing
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-[24px] border border-cyan-100/18 bg-cyan-300/8 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-cyan-50">
                Selected Section: {selectedArrangementSection}
              </div>
              <div className="mt-1 text-xs text-white/54">
                Arrangement actions will target this section.
              </div>
            </div>
            <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              arrangementRenderState === "rendered"
                ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-100"
                : "border-cyan-100/25 bg-cyan-300/10 text-cyan-100"
            }`}>
              {arrangementRenderState === "rendered"
                ? "Arrangement version rendered successfully."
                : "Staged — not rendered yet."}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto pb-2">
            <div className="flex min-w-[760px] gap-3">
              {arrangementSections.map((section) => {
                const selected = selectedArrangementSection === section.name;
                return (
                  <button
                    key={section.name}
                    type="button"
                    onClick={() => {
                      setSelectedArrangementSection(section.name);
                      setWorkspaceStatus(`${section.name} selected for arrangement editing.`);
                    }}
                    className={`group relative min-h-[122px] flex-1 overflow-hidden rounded-[26px] border p-4 text-left transition ${
                      selected
                        ? "scale-[1.02] animate-pulse border-cyan-100/70 bg-cyan-300/16 shadow-[0_0_36px_rgba(103,232,249,0.24)]"
                        : "border-white/10 bg-black/16 hover:border-cyan-100/26 hover:bg-cyan-300/8"
                    }`}
                  >
                    <div className="absolute inset-x-3 bottom-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#67e8f9,#c4b5fd)] shadow-[0_0_14px_rgba(103,232,249,0.30)]"
                        style={{ width: `${section.intensity}%` }}
                      />
                    </div>
                    <div className="text-sm font-semibold text-white">{section.name}</div>
                    <div className="mt-2 text-xs font-semibold text-white/54">{section.length}s section</div>
                    <div className="mt-4 flex gap-1">
                      {Array.from({ length: 5 }, (_, index) => (
                        <span
                          key={index}
                          className={`h-8 flex-1 rounded-full transition ${
                            index < Math.ceil(section.intensity / 20)
                              ? "bg-cyan-200/35 group-hover:bg-cyan-200/50"
                              : "bg-white/10"
                          }`}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["off", "15", "30", "section"] as ArrangementLoopMode[]).map((mode) => (
                <button
                  key={`arrangement-loop-${mode}`}
                  type="button"
                  onClick={() => updateArrangementLoop(mode)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    arrangementLoopMode === mode
                      ? "border-cyan-100/60 bg-cyan-200 text-slate-950 shadow-[0_0_20px_rgba(103,232,249,0.18)]"
                      : "border-white/10 bg-white/7 text-white/72 hover:border-cyan-100/25 hover:bg-cyan-300/10"
                  }`}
                >
                  {mode === "off" ? "Loop Off" : mode === "section" ? "Loop Section" : `${mode}s Loop`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {arrangementEditHistory.length ? (
                arrangementEditHistory.map((chip) => (
                  <span key={chip} className="rounded-full border border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] px-3 py-1.5 text-xs font-semibold text-[#fff7ed]">
                    {chip}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5 text-xs font-semibold text-white/46">
                  No arrangement edits staged
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-white/10 bg-black/16 p-4">
            <div className="mb-3 flex flex-col gap-1 px-1 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/70">
                  AI Arrangement Tools
                </div>
                <div className="mt-1 text-sm text-white/54">
                  Stage structure, vocal, and energy edits locally before committing a master.
                </div>
              </div>
              <div className="rounded-full border border-cyan-100/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100/78">
                Preview, then render
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {arrangementActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => applyArrangementAction(action)}
                  disabled={arrangementActionRequiresStems(action) && !stemsReady}
                  title={
                    arrangementActionRequiresStems(action) && !stemsReady
                      ? "Stems are being prepared. You can master while waiting."
                      : undefined
                  }
                  className={arrangementActionClass(action)}
                >
                  {arrangementActionLabel(action)}
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-2xl border border-cyan-100/14 bg-cyan-300/8 px-3 py-2 text-xs leading-5 text-cyan-50/72">
              Mastering works immediately. Stem-based edits unlock automatically after stems are ready.
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                      Pending Arrangement Changes
                    </div>
                    <div className="mt-1 text-xs text-white/48">
                      To hear the current live mix, press Play in the waveform player above. To create an edited version, click Render Arrangement Version.
                    </div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    arrangementRenderState === "rendered"
                      ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-100"
                      : "border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] text-[#fff7ed]"
                  }`}>
                    {arrangementRenderState === "rendered" ? "Rendered ✓" : "Staged — not rendered yet"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {pendingArrangementChanges.length ? (
                    pendingArrangementChanges.map((change) => (
                      <span
                        key={change.id}
                        className="inline-flex animate-pulse items-center gap-2 rounded-full border border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] px-3 py-2 text-xs font-semibold text-[#fff7ed]"
                      >
                        <span>✦</span>
                        {change.diff}
                        <button
                          type="button"
                          onClick={() => removePendingArrangementChange(change.id)}
                          className="rounded-full bg-white/10 px-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
                          aria-label={`Remove ${change.diff}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-white/10 bg-black/16 px-3 py-2 text-xs font-semibold text-white/46">
                      No arrangement changes staged.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void renderPendingArrangementVersion()}
                  disabled={
                    workingAction === "arrangement-render" ||
                    pendingArrangementNeedsStems() ||
                    (!pendingArrangementChanges.length && arrangementRenderState !== "rendered")
                  }
                  className={`mt-4 ${getActionButtonClass(
                    pendingArrangementNeedsStems() ? "disabled" : getActionState("arrangement-render"),
                    "block"
                  )}`}
                >
                  {renderArrangementButtonLabel()}
                </button>
                {pendingArrangementNeedsStems() ? (
                  <div className="mt-3 rounded-2xl border border-[#ff7a1a] bg-[rgba(255,122,26,0.08)] px-3 py-2 text-xs leading-5 text-[#fff7ed]">
                    Prepare stems first, then render this arrangement edit.
                  </div>
                ) : null}
                {arrangementRenderError ? (
                  <div className="mt-3 rounded-[20px] border border-red-200/35 bg-red-950/35 p-3 text-sm text-red-50 shadow-[0_0_24px_rgba(239,68,68,0.16)]">
                    <div className="font-semibold">{arrangementRenderError.message}</div>
                    <details className="mt-3 rounded-2xl border border-red-100/18 bg-black/22 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-red-100/78">
                        Details
                      </summary>
                      <div className="mt-3 grid gap-2 text-xs leading-5 text-white/72">
                        <div>Action: {arrangementRenderError.actionName}</div>
                        <div>Selected section: {arrangementRenderError.selectedSection}</div>
                        <div>Active version id: {arrangementRenderError.activeVersionId || "missing"}</div>
                        <div>Track group id: {arrangementRenderError.trackGroupId || "missing"}</div>
                        <div>Audio URL exists: {arrangementRenderError.hasAudioUrl ? "yes" : "no"}</div>
                        <div>Stems ready: {arrangementRenderError.stemsReady ? "yes" : "no"}</div>
                        <div>Backend status: {arrangementRenderError.backendStatus ?? "unknown"}</div>
                        <div className="rounded-xl border border-white/10 bg-black/28 p-2 font-mono text-[11px] text-white/66">
                          {typeof arrangementRenderError.backendBody === "string"
                            ? arrangementRenderError.backendBody
                            : JSON.stringify(arrangementRenderError.backendBody ?? { message: arrangementRenderError.message }, null, 2)}
                        </div>
                      </div>
                    </details>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/16 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                  Arrangement Diff
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/68">
                  {pendingArrangementChanges.length ? (
                    pendingArrangementChanges.map((change) => (
                      <div key={`diff-${change.id}`} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.45)]" />
                        <span>{change.diff}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-white/44">Select an arrangement tool to see the diff.</div>
                  )}
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-100/14 bg-cyan-300/8 px-3 py-2 text-xs leading-5 text-cyan-50/72">
                  Preview means visual edit plan only. Audio changes are heard after rendering the arrangement version.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[30px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_70px_rgba(14,165,233,0.08)] backdrop-blur-2xl">
          <div className="mb-3 px-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              AI Co-Producer Presets
            </div>
            <div className="mt-1 text-sm text-white/58">
              Genre transformations reshape the mix in realtime without generating a new song.
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {presets.map((preset, index) => {
              const actionKey = `preset-${preset.name}`;
              const state = getActionState(actionKey);
              const active = activePreset === preset.name;
              return (
                <button
                  key={`${preset.name}-${index}`}
                  onClick={() => applyPreset(preset.name)}
                  disabled={state === "working"}
                  className={`shrink-0 ${actionClassWithActive(state, active)}`}
                >
                  {actionLabelWithActive(actionKey, preset.name, active)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => void requestStudioProCoProducerAdvice()}
              disabled={workingAction === "co-producer-advice"}
              className={`shrink-0 ${getActionButtonClass(getActionState("co-producer-advice"))}`}
            >
              {coProducerAdviceLabel()}
            </button>
          </div>
          {coProducerAdvice ? (
            <div className="mt-3 rounded-2xl border border-cyan-100/15 bg-cyan-300/8 px-3 py-2 text-sm leading-6 text-cyan-50/82">
              {coProducerAdvice}
            </div>
          ) : null}
        </section>

        <section className="mt-4 rounded-[30px] border border-cyan-100/15 bg-[linear-gradient(135deg,rgba(8,47,73,0.36),rgba(88,28,135,0.16),rgba(255,255,255,0.04))] p-4 shadow-[0_18px_70px_rgba(103,232,249,0.08)] backdrop-blur-2xl">
          <div className="mb-3 flex flex-col gap-2 px-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/72">
                Before Upload Mastering
              </div>
              <div className="mt-1 text-sm text-white/60">
                Master your AI track before uploading anywhere.
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-black/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48">
              Realtime only
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {beforeUploadMasteringPresets.map((preset, index) => {
              const actionKey = `preset-${preset.name}`;
              const state = getActionState(actionKey);
              const active = activeMasteringPreset === preset.name;
              return (
                <button
                  key={`before-upload-${preset.name}-${index}`}
                  onClick={() => applyPreset(preset.name, "mastering")}
                  disabled={state === "working"}
                  className={`shrink-0 ${actionClassWithActive(state, active)}`}
                >
                  {actionLabelWithActive(actionKey, preset.name, active)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 px-2 text-xs font-semibold text-teal-100/72">
            Current Mastering: {activeMasteringPreset || "None"}
          </div>
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/44">
              Quick master actions
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {quickMasterActions.map((action) => {
                const actionKey = `quick-${action.label}`;
                const state = getActionState(actionKey);
                const active = activeQuickMasterAction === action.label;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => applyQuickMasterAction(action)}
                    disabled={state === "working"}
                    className={`shrink-0 ${actionClassWithActive(state, active)}`}
                  >
                    {actionLabelWithActive(actionKey, action.label, active)}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/18 p-3 md:grid-cols-[auto_1fr] md:items-center">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/68">
                  Effect Strength
                </div>
                <div className="mt-1 text-xs text-white/46">
                  Temporary proof control for realtime mastering actions.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {(["subtle", "normal", "strong"] as const).map((strength) => (
                  <button
                    key={strength}
                    type="button"
                    onClick={() =>
                      applyLocalMixerAction(`effect-${strength}`, () => updateMixer("effectStrength", strength))
                    }
                    className={`${getActionButtonClass(getActionState(`effect-${strength}`))} capitalize`}
                  >
                    {genericActionLabel(`effect-${strength}`, strength, "Applying...")}
                  </button>
                ))}
              </div>
              <div className="md:col-span-2 rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2 text-[11px] leading-5 text-white/58">
                DSP proof: stereoWidth {mixer.stereoWidth}% · monoSafe {mixer.monoSafe}% · harshnessReduction{" "}
                {mixer.harshnessReduction}% · air {mixer.air}% · warmth {mixer.warmth}%
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] p-5 shadow-[0_24px_90px_rgba(8,47,73,0.16)] backdrop-blur-2xl">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  Mastering Console
                </div>
                <h3 className="mt-1 text-2xl font-semibold">Final master controls</h3>
                <div className="mt-2 inline-flex rounded-full border border-cyan-100/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/78">
                  Realtime DSP Workspace
                </div>
              </div>
              <div className="text-xs font-semibold text-white/52">
                Live mastering controls. Export only when you click Render Final Master.
              </div>
            </div>

            <div className="grid gap-4">
              <div className="flex min-w-0 flex-col rounded-[30px] border border-white/10 bg-black/16 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                    Channel console
                  </div>
                  <div className="text-[11px] font-semibold text-white/46">
                    live master
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  <ChannelStrip label="Drums" value={mixer.drums} onChange={(value) => updateMixer("drums", value)} level={realtimeMixPreview.levels.drums} playing={realtimeMixPreview.playing && compareMode === "mix"} />
                  <ChannelStrip label="Bass" value={mixer.bass} onChange={(value) => updateMixer("bass", value)} level={realtimeMixPreview.levels.bass} playing={realtimeMixPreview.playing && compareMode === "mix"} />
                  <ChannelStrip label="Vocals" value={mixer.vocal} onChange={(value) => updateMixer("vocal", value)} level={realtimeMixPreview.levels.vocals} playing={realtimeMixPreview.playing && compareMode === "mix"} />
                  <ChannelStrip label="Music" value={mixer.music} onChange={(value) => updateMixer("music", value)} level={realtimeMixPreview.levels.music} playing={realtimeMixPreview.playing && compareMode === "mix"} />
                  <ChannelStrip label="FX / Ambience" value={mixer.fx} onChange={(value) => updateMixer("fx", value)} max={100} level={realtimeMixPreview.levels.fx} playing={realtimeMixPreview.playing && compareMode === "mix"} />
                  <ChannelStrip label="Master" value={mixer.master} onChange={(value) => updateMixer("master", value)} max={100} level={realtimeMixPreview.levels.master} playing={realtimeMixPreview.playing && compareMode === "mix"} />
                </div>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-black/16 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                      Advanced DSP
                    </div>
                    <div className="mt-1 text-xs text-white/48">tone, motion, and render shape</div>
                  </div>
                  <button
                    onClick={() =>
                      applyLocalMixerAction("normalize-toggle", () => updateMixer("masterNormalize", !mixer.masterNormalize))
                    }
                    className={getActionButtonClass(getActionState("normalize-toggle"))}
                  >
                    {genericActionLabel("normalize-toggle", `Normalize ${mixer.masterNormalize ? "On" : "Off"}`, "Applying...")}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  <div className="rounded-2xl border border-cyan-100/12 bg-cyan-300/7 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/70 md:col-span-2 2xl:col-span-3">
                    Mastering
                  </div>
                  <CompactControl label="Compression" value={mixer.compression} onChange={(value) => updateMixer("compression", value)} display={`${mixer.compression}%`} />
                  <CompactControl label="Loudness" value={mixer.loudness} onChange={(value) => updateMixer("loudness", value)} display={`${mixer.loudness}%`} />
                  <CompactControl label="Saturation" value={mixer.saturation} onChange={(value) => updateMixer("saturation", value)} display={`${mixer.saturation}%`} />
                  <CompactControl label="Limiter" value={mixer.limiter} onChange={(value) => updateMixer("limiter", value)} display={`${mixer.limiter}%`} />
                  <div className="rounded-2xl border border-purple-200/12 bg-purple-300/7 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-purple-100/70 md:col-span-2 2xl:col-span-3">
                    Advanced
                  </div>
                  <CompactControl label="Clip Safe" value={mixer.clipSafe} onChange={(value) => updateMixer("clipSafe", value)} display={`${mixer.clipSafe}%`} />
                  <CompactControl label="Analog Feel" value={mixer.analogFeel} onChange={(value) => updateMixer("analogFeel", value)} display={`${mixer.analogFeel}%`} />
                  <CompactControl label="Sub Bass" value={mixer.subBass} onChange={(value) => updateMixer("subBass", value)} display={`${mixer.subBass}%`} />
                  <CompactControl label="Punch" value={mixer.punch} onChange={(value) => updateMixer("punch", value)} display={`${mixer.punch}%`} />
                  <CompactControl label="Overdrive" value={mixer.overdrive} onChange={(value) => updateMixer("overdrive", value)} display={`${mixer.overdrive}%`} />
                  <div className="grid grid-cols-3 gap-2 md:col-span-2 2xl:col-span-1">
                    {(["Clean", "Tube", "Hard"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() =>
                          applyLocalMixerAction(`overdrive-${mode}`, () => updateMixer("overdriveMode", mode))
                        }
                        className={getActionButtonClass(getActionState(`overdrive-${mode}`))}
                      >
                        {genericActionLabel(`overdrive-${mode}`, mode, "Applying...")}
                      </button>
                    ))}
                  </div>
                  <CompactControl label="Stereo Width" value={mixer.stereoWidth} onChange={(value) => updateMixer("stereoWidth", value)} display={`${mixer.stereoWidth}%`} />
                  <CompactControl label="Air" value={mixer.air} onChange={(value) => updateMixer("air", value)} display={`${mixer.air}%`} />
                  <CompactControl label="Warmth" value={mixer.warmth} onChange={(value) => updateMixer("warmth", value)} display={`${mixer.warmth}%`} />
                  <CompactControl label="Speed" value={mixer.speed} onChange={(value) => updateMixer("speed", value)} min={70} max={130} display={`${mixer.speed}%`} />
                  <CompactControl label="Pitch" value={mixer.pitch} onChange={(value) => updateMixer("pitch", value)} min={-12} max={12} display={`${mixer.pitch > 0 ? "+" : ""}${mixer.pitch} st`} />
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
              <div className="rounded-[28px] border border-white/10 bg-black/14 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                  Genre transformation
                </div>
                <div className="mt-4 grid gap-3">
                  <CompactControl label="DnB Feel" value={mixer.dnbFeel} onChange={(value) => updateMixer("dnbFeel", value)} display={`${mixer.dnbFeel}%`} />
                  <CompactControl label="House Feel" value={mixer.houseFeel} onChange={(value) => updateMixer("houseFeel", value)} display={`${mixer.houseFeel}%`} />
                  <CompactControl label="Club Energy" value={mixer.clubEnergy} onChange={(value) => updateMixer("clubEnergy", value)} display={`${mixer.clubEnergy}%`} />
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/14 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                  Preview
                </div>
                <select value={mixer.previewMode} onChange={(event) => updateMixer("previewMode", event.target.value)} className={`mt-4 w-full ${selectClass}`}>
                  <option value="off">Preview off</option>
                  <option value="10">10s preview</option>
                  <option value="20">20s preview</option>
                </select>
                <div className="mt-3 text-xs leading-5 text-white/54">
                  Preview Master creates a temporary listening check without saving a version.
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/14 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                  Loop / Extend
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(["off", "15", "30", "60"] as LoopMode[]).map((mode) => (
                    <button
                      key={`loop-${mode}`}
                      onClick={() =>
                        applyLocalMixerAction(`loop-${mode}`, () => updateMixer("loopMode", mode))
                      }
                      className={getActionButtonClass(getActionState(`loop-${mode}`))}
                    >
                      {genericActionLabel(`loop-${mode}`, mode === "off" ? "Loop off" : `${mode}s loop`, "Applying...")}
                    </button>
                  ))}
                  {(["off", "15", "30", "60"] as ExtendMode[]).map((mode) => (
                    <button
                      key={`extend-${mode}`}
                      onClick={() =>
                        applyLocalMixerAction(`extend-${mode}`, () => updateMixer("extendMode", mode))
                      }
                      className={getActionButtonClass(getActionState(`extend-${mode}`))}
                    >
                      {genericActionLabel(`extend-${mode}`, mode === "off" ? "Extend off" : `+${mode}s`, "Applying...")}
                    </button>
	                  ))}
	                </div>
	                <div className="mt-3 rounded-2xl border border-cyan-100/15 bg-cyan-300/8 px-3 py-2 text-xs font-semibold text-cyan-50/78">
	                  {exportWorkflowStatus}
	                </div>
	              </div>
            </div>

            {previewMasterReady ? (
              <div className="mt-5 rounded-[24px] border border-emerald-200/22 bg-emerald-300/9 p-4 shadow-[0_0_28px_rgba(52,211,153,0.10)]">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/80">
                  {previewTarget === "arrangement" ? "Preview Ready ✓" : "Preview Master Ready"}
                </div>
                <div className="mt-2 text-sm leading-6 text-white/68">
                  {previewTarget === "arrangement"
                    ? "Press Play in the waveform player to hear the staged arrangement preview on the current active version. Render the arrangement version when ready."
                    : "Press Play in the waveform player to hear the current realtime master. Render Final Master or Commit Master to create a permanent version."}
                </div>
                {previewUrl ? (
                  <audio className="mt-3 w-full" controls src={previewUrl}>
                    Your browser does not support audio playback.
                  </audio>
                ) : (
                  <button
                    type="button"
                    onClick={() => void realtimeMixPreview.play()}
                    className={`mt-3 ${getActionButtonClass("success")}`}
                  >
                    Play Preview
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <aside className="space-y-5">
            <div ref={versionHistoryRef} className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.18)] backdrop-blur-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                Stem Status
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/16 p-3 text-sm font-semibold text-white/74">
                {stemRoutingMode === "invalid"
                  ? "Invalid stem set detected"
                  : stemRoutingMode === "ready"
                  ? "Stem Routing Ready"
                  : stemRoutingMode === "partial"
                    ? "Partial Stem Routing"
                    : activeVersion?.stemsStatus || "not_started"}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-white/58">
                <span className={`rounded-full border px-3 py-2 ${activeVersion?.stemDrumsUrl ? "border-emerald-200/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/16"}`}>
                  Drums {activeVersion?.stemDrumsUrl ? "ready" : "missing"}
                </span>
                <span className={`rounded-full border px-3 py-2 ${activeVersion?.stemBassUrl ? "border-emerald-200/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/16"}`}>
                  Bass {activeVersion?.stemBassUrl ? "ready" : "missing"}
                </span>
                <span className={`rounded-full border px-3 py-2 ${activeVersion?.stemVocalsUrl ? "border-emerald-200/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/16"}`}>
                  Vocals {activeVersion?.stemVocalsUrl ? "ready" : "missing"}
                </span>
                <span className={`rounded-full border px-3 py-2 ${activeVersion?.stemOtherUrl ? "border-emerald-200/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/16"}`}>
                  Music {activeVersion?.stemOtherUrl ? "ready" : "missing"}
                </span>
              </div>
              <div className="mt-3 text-xs leading-5 text-white/52">
                {isLocalUpload
                  ? "Save this PRO project before preparing stems."
                  : stemRoutingMode === "invalid"
                    ? "Invalid stem set detected. Using stereo fallback."
                  : stemRoutingMode === "fallback"
                    ? "Prepare stems for true drum, bass, vocal, and music control."
                    : "Stems are extracted once and reused for realtime mixing and final renders."}
              </div>
              {activeVersion?.stemsStatus === "error" && activeVersion.stemsError ? (
                <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100">
                  {activeVersion.stemsError}
                </div>
              ) : null}
              <div className="mt-3 rounded-2xl border border-cyan-100/14 bg-cyan-300/8 px-3 py-2 text-xs leading-5 text-cyan-50/72">
                Mastering and Quick Master actions work without stems. Arrangement renders like Instrumental,
                Extend Chorus, Loop Section, and Radio Edit require stems.
              </div>
              <button
                type="button"
                onClick={() => void prepareStems()}
                disabled={!canPrepareStems || workingAction === "prepare-stems"}
                className={`mt-4 ${
                  activeVersion?.stemsStatus === "ready" && !hasDuplicateStemUrls && getActionState("prepare-stems") === "idle"
                    ? getActiveActionButtonClass("block")
                    : getActionButtonClass(!canPrepareStems && getActionState("prepare-stems") === "idle" ? "disabled" : getActionState("prepare-stems"), "block")
                }`}
              >
                {prepareStemsLabel()}
              </button>
            </div>

            <div ref={arrangementBranchesRef} className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.18)] backdrop-blur-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                Master status
              </div>
              <div className="mt-3 text-sm leading-6 text-white/78">{workspaceStatus}</div>
            </div>

            <div className="rounded-[32px] border border-cyan-100/15 bg-[linear-gradient(145deg,rgba(14,165,233,0.16),rgba(88,28,135,0.12),rgba(255,255,255,0.045))] p-5 shadow-[0_18px_65px_rgba(14,165,233,0.12)] backdrop-blur-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/74">
                Master Output
              </div>
              <div className="mt-2 text-sm leading-6 text-white/62">
                Realtime AI-assisted mastering with human-directed control.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-100/22 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                  Realtime DSP
                </span>
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                  stemRoutingMode === "ready"
                    ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-100"
                    : "border-white/10 bg-white/7 text-white/56"
                }`}>
                  Stem Routing
                </span>
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                  activeVersion?.audioUrl
                    ? "border-purple-200/25 bg-purple-300/10 text-purple-100"
                    : "border-white/10 bg-white/7 text-white/56"
                }`}>
                  Ready for Export
                </span>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.18)] backdrop-blur-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                Export tools
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-200/15 bg-emerald-300/8 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/74">
                  Export Quality
                </div>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-white/70">
                  {["WAV 24-bit", "MP3 320kbps", "Loudness Safe", "Streaming Optimized"].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.45)]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl border border-cyan-100/15 bg-cyan-300/8 px-3 py-2 text-xs font-semibold text-cyan-50/78">
                  {exportWorkflowStatus}
                </div>
                <div className="mt-2 rounded-2xl border border-white/10 bg-black/18 px-3 py-2 text-xs font-semibold text-white/68">
                  {submitWorkflowStatus}
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <button onClick={() => void callRender(true)} disabled={!canPreviewMaster} title={previewMasterDisabledReason || "Preview the current realtime master."} className={getActionButtonClass(getActionState("preview"), "block")}>
                  {previewMasterLabel()}
                </button>
                {previewMasterDisabledReason ? (
                  <div className="rounded-2xl border border-white/10 bg-black/18 px-3 py-2 text-xs leading-5 text-white/52">
                    {previewMasterDisabledReason}
                  </div>
                ) : null}
                <button onClick={() => void callRender(false)} disabled={!canRenderFinalMaster || workingAction === "render"} className={getActionButtonClass(!canRenderFinalMaster ? "disabled" : getActionState("render"), "block")}>
                  {renderFinalLabel()}
                </button>
                {renderFinalMasterBlockedReason ? (
                  <div className="rounded-2xl border border-white/10 bg-black/18 px-3 py-2 text-xs leading-5 text-white/52">
                    {renderFinalMasterBlockedReason}
                  </div>
                ) : null}
                <button
                  onClick={() => void callRender(false, true)}
                  disabled={!canCommitMix}
                  title={commitMixDisabledReason || "Save the current master as a new version."}
                  className={getActionButtonClass(getActionState("freeze"), "block")}
                >
                  {commitMasterLabel()}
                </button>
                {commitMixDisabledReason ? (
                  <div className="rounded-2xl border border-white/10 bg-black/18 px-3 py-2 text-xs leading-5 text-white/52">
                    {commitMixDisabledReason}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-cyan-100/15 bg-cyan-300/8 px-3 py-2 text-xs leading-5 text-cyan-50/72">
                    Commit Master saves the current mastering chain as a new version.
                  </div>
                )}
                <button onClick={downloadVersion} disabled={!activeVersion?.audioUrl || workingAction === "download"} className={getActionButtonClass(getActionState("download"), "block")}>
                  {downloadMasterLabel()}
                </button>
                <button onClick={() => void exportStems()} disabled={!stemsReady || workingAction === "export"} className={getActionButtonClass(getActionState("export"), "block")}>
                  {exportStemsLabel()}
                </button>
                <button onClick={() => void downloadReleasePackage()} disabled={workingAction === "release-package"} title={releasePackageBlockedReason || "Create a release package for the current master."} className={getActionButtonClass(!canReleasePackage ? "disabled" : getActionState("release-package"), "block")}>
                  {releasePackageLabel()}
                </button>
                <button onClick={() => void submitToSoundioX()} disabled={workingAction === "submit-soundiox"} className={getActionButtonClass(!canSubmitToSoundioX ? "disabled" : getActionState("submit-soundiox"), "block")}>
                  {submitSoundioXLabel()}
                </button>
                {submitError ? (
                  <div className="rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-100">
                    {submitError}
                  </div>
                ) : null}
                <button onClick={createProReport} disabled={!canCreateProReport || workingAction === "report"} className={getActionButtonClass(getActionState("report"), "block")}>
                  {exportReportLabel()}
                </button>
              </div>
              <div className="mt-3 text-xs leading-5 text-white/52">
                Exports use the SoundioX mastering pipeline.
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.18)] backdrop-blur-2xl">
              <button onClick={() => setVersionsOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                    Version history
                  </span>
                  <span className="mt-1 block text-sm text-white/58">{versions.length} versions</span>
                </span>
                <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs font-semibold text-white/70">
                  {versionsOpen ? "Hide" : "Open"}
                </span>
              </button>
              {versionsOpen ? (
                <div className="mt-4 space-y-2">
                  {[...versionTimeline].reverse().map((version, index) => {
                    const versionNumber = getStudioProVersionNumber(version, versionTimeline.length - index - 1);
                    const isOriginalVersion =
                      version.isOriginal || version.label.toLowerCase() === "original";

                    return (
                    <div
                      id={`studio-pro-version-${version.id}`}
                      key={version.id}
                      onClick={() =>
                        restoreVersion(version)
                      }
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        getActionState(`choose-${version.id}`) !== "idle"
                          ? getActionButtonClass(getActionState(`choose-${version.id}`), "block")
                          : highlightVersionId === version.id
                          ? "animate-pulse border-emerald-100/70 bg-emerald-300/16 shadow-[0_0_42px_rgba(52,211,153,0.26)]"
                          : activeVersionId === version.id
                          ? "border-cyan-100/50 bg-cyan-300/14"
                          : "border-white/10 bg-black/16"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold text-white">{version.title}</div>
                        {isOriginalVersion ? (
                          <span className="shrink-0 rounded-full border border-emerald-100/30 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                            Original protected
                          </span>
                        ) : null}
                        {hasFrozenDspMetadata(version) ? (
                          <span className="shrink-0 rounded-full border border-purple-100/25 bg-purple-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-purple-100">
                            Frozen DSP
                          </span>
                        ) : null}
                        {highlightVersionId === version.id ? (
                          <>
                            <span className="shrink-0 rounded-full border border-emerald-100/35 bg-emerald-300/14 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                              New Version
                            </span>
                            <span className="shrink-0 rounded-full border border-cyan-100/30 bg-cyan-300/12 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                              Render Complete ✓
                            </span>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/52">
                        <span>{version.label}</span>
                        <span>Version {versionNumber}</span>
                        <span>{formatDate(version.createdAt)}</span>
                        {!version.audioUrl ? <span>This version has no audio.</span> : null}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          restoreVersion(version);
                        }}
                        className={`${secondaryProButtonClass} mt-3`}
                      >
                        Restore Version
                      </button>
                    </div>
                  );
                  })}
                </div>
              ) : null}
            </div>

            <div ref={arrangementBranchesRef} className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.035))] p-5 shadow-[0_18px_60px_rgba(2,6,23,0.18)] backdrop-blur-2xl">
              <button onClick={() => setArrangementBranchesOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">
                    Arrangement Branches
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-white/52">
                    Render lineage for non-destructive arrangement edits.
                  </span>
                </span>
                <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs font-semibold text-white/70">
                  {arrangementBranchesOpen ? "Hide" : "Open"}
                </span>
              </button>
              {arrangementBranchesOpen ? (
              <div className="mt-4 space-y-2">
                <div className="mb-3 rounded-2xl border border-cyan-100/15 bg-cyan-300/8 px-3 py-3 text-xs font-semibold text-cyan-50/72">
                  <div className="flex flex-wrap items-center gap-2">
                    {arrangementBranches.slice(0, 3).map((branch, index) => (
                      <span key={`lineage-${branch.name}`} className="inline-flex items-center gap-2">
                        {index > 0 ? <span className="text-cyan-100/35">↓</span> : null}
                        <span>{branch.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
                {arrangementBranches.map((branch, index) => (
                  <div key={branch.name} className="relative">
                    {index > 0 ? (
                      <div className="mx-auto mb-2 flex w-full items-center justify-center text-cyan-100/35">
                        ↓
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArrangementBranch(branch.name);
                        setWorkspaceStatus(`${branch.name} branch selected.`);
                      }}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        selectedArrangementBranch === branch.name
                          ? "border-cyan-100/50 bg-cyan-300/14 shadow-[0_0_24px_rgba(103,232,249,0.12)]"
                          : "border-white/10 bg-black/16 hover:border-cyan-100/24 hover:bg-cyan-300/8"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-white">{branch.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {branch.badges.includes("Rendered") ? (
                            <span className="rounded-full border border-emerald-200/25 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                              New Version
                            </span>
                          ) : null}
                          <span className="text-[11px] font-semibold text-white/42">{branch.timestamp}</span>
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {branch.badges.map((badge) => (
                          <span key={`${branch.name}-${badge}`} className="rounded-full border border-white/10 bg-white/7 px-2 py-0.5 text-[10px] font-semibold text-white/58">
                            {badge}
                          </span>
                        ))}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
              ) : null}
            </div>
          </aside>
        </section>

        <section className="mt-6 rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.032))] p-5 shadow-[0_24px_90px_rgba(8,47,73,0.14)] backdrop-blur-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                Studio PRO projects
              </div>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">Project library</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                Open PRO uploads, mastered branches, or import normal Studio projects into the PRO workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshProjectLibrary()}
              className={getActionButtonClass(getActionState("refresh-projects"))}
            >
              {genericActionLabel("refresh-projects", "Refresh projects", "Opening...", "Ready ✓")}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                applyLocalMixerAction("tab-pro", () => setProjectLibraryTab("pro"), "PRO Projects opened.")
              }
              className={getActionButtonClass(getActionState("tab-pro"))}
            >
              {genericActionLabel("tab-pro", `PRO Projects (${proProjects.length})`, "Opening...", "Opened ✓")}
            </button>
            <button
              type="button"
              onClick={() =>
                applyLocalMixerAction("tab-studio", () => setProjectLibraryTab("studio"), "Import from Studio opened.")
              }
              className={getActionButtonClass(getActionState("tab-studio"))}
            >
              {genericActionLabel("tab-studio", `Import from Studio (${studioImportProjects.length})`, "Opening...", "Opened ✓")}
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-black/14">
            <div className="hidden grid-cols-[1.8fr_1fr_1fr_1fr_auto] gap-3 border-b border-white/10 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/52 md:grid">
              <span>Project</span>
              <span>Artist</span>
              <span>Genre</span>
              <span>Created</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-white/10">
              {visibleProjectLibraryProjects.length > 0 ? (
                visibleProjectLibraryProjects.map((project) => {
                  const isActive =
                    Boolean(project.trackGroupId && project.trackGroupId === activeVersion?.trackGroupId) ||
                    Boolean(project.trackVersionId && project.trackVersionId === activeVersion?.id);

                  return (
                    <div
                      key={project.id}
                      className={`grid gap-3 px-5 py-4 transition md:grid-cols-[1.8fr_1fr_1fr_1fr_auto] md:items-center ${
                        isActive
                          ? "bg-cyan-300/10 shadow-[inset_3px_0_0_rgba(103,232,249,0.55)]"
                          : "bg-transparent hover:bg-white/[0.035]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-white">{project.title}</div>
                          {isActive ? (
                            <span className="rounded-full border border-cyan-100/30 bg-cyan-300/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                              Open
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-white/46">
                          {project.sourceLabel}
                        </div>
                      </div>
                      <div className="text-sm text-white/64">{project.artist || "Unknown artist"}</div>
                      <div className="text-sm text-white/64">{project.genre || "No genre"}</div>
                      <div className="text-sm text-white/64">{formatDate(project.createdAt)}</div>
                      <div className="md:text-right">
                        <button
                          type="button"
                          onClick={() => void openProject(project)}
                          className={getActionButtonClass(getActionState(`open-${project.id}`))}
                        >
                          {genericActionLabel(
                            `open-${project.id}`,
                            isActive ? "Opened" : project.source === "pro" ? "Open in PRO" : "Import to PRO",
                            "Opening...",
                            "Opened ✓"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-6 text-sm text-white/58">
                  {loading
                    ? "Loading projects..."
                    : projectLibraryTab === "pro"
                      ? "No PRO projects yet. Upload a track or import from Studio to start."
                      : "No Studio projects available to import yet."}
                </div>
              )}
            </div>
          </div>
        </section>

        {proReport ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 px-4 py-8 backdrop-blur-xl">
            <section className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[34px] border border-cyan-100/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] p-5 shadow-[0_28px_100px_rgba(8,47,73,0.34)] md:p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                    Studio PRO Processing Report
                  </div>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {proReport.trackTitle}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                    Rendered through SoundioX Studio PRO. Human-directed editing workflow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProReport(null)}
                  className="rounded-full border border-white/10 bg-white/7 px-4 py-2 text-sm font-semibold text-white/72 transition hover:bg-white/12"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {[
                  ["Report ID", proReport.reportId],
                  ["Track title", proReport.trackTitle],
                  ["Active version id", proReport.activeVersionId],
                  ["Track group id", proReport.trackGroupId || "Not linked"],
                  ["Rendered at", proReport.renderedAt],
                  ["Source", proReport.source],
                  ["Human-directed edit", proReport.humanDirectedEdit],
                  ["Active preset", proReport.activePreset || "None"],
                  ["Stems status", proReport.stemsStatus],
                  ["Metadata source", proReport.metadataSource],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">
                      {label}
                    </div>
                    <div className="mt-1 break-words text-sm font-semibold text-white/82">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/18 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">
                  Exported audio URL
                </div>
                <div className="mt-2 break-all text-xs leading-5 text-white/68">
                  {proReport.exportedAudioUrl}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/18 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">
                  DSP chain summary
                </div>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-xs leading-5 text-white/72">
                  {proReport.dspChainSummary}
                </pre>
              </div>

              <div className="mt-4 rounded-2xl border border-cyan-100/14 bg-cyan-300/8 p-4 text-sm leading-6 text-cyan-50/82">
                {proReport.disclaimer}
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => void copyReportText()} className={primaryProButtonClass}>
                  Copy report text
                </button>
                <button type="button" onClick={downloadReportJson} className={secondaryProButtonClass}>
                  Download report JSON
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
