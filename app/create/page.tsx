"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

type VocalMode = "instrumental" | "auto-lyrics" | "write-lyrics" | "male" | "female" | "duet";
type VoiceStyle = "cinematic" | "warm" | "broadcast" | "trailer" | "intimate";
type VoiceDelivery = "steady" | "dramatic" | "soft" | "urgent" | "measured";
type StepKey = "track" | "vocals" | "artwork";
type DirectionKey = "music" | "lyrics" | "artwork";
type CoProducerMode = DirectionKey | "voiceover" | "edit";
type FaderKey =
  | "drums"
  | "bass"
  | "music"
  | "vocal"
  | "voiceover"
  | "fx"
  | "master";

type MixerState = Record<FaderKey, number>;
type MuteState = Record<FaderKey, boolean>;
type SoloState = Record<FaderKey, boolean>;
type DynamicsKey = "fadeIn" | "fadeOut" | "compression" | "saturation" | "width";
type DynamicsState = Record<DynamicsKey, number>;
type ChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  canApply?: boolean;
};
type LatestAiEditAdvice = {
  raw: string;
  change: string;
  impact: string;
  finalDirection: string;
  versionNote: string;
} | null;

type VersionRecord = {
  id: string;
  label: string;
  title: string;
  note: string;
  source: "generated" | "imported";
  mixer: MixerState;
  dynamics: DynamicsState;
  audioUrl?: string | null;
};

const sectionClass =
  "rounded-[28px] border border-sky-200/80 bg-sky-400/40 p-5 shadow-[0_30px_100px_rgba(56,189,248,0.25)] backdrop-blur-xl";
const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-sky-300/40 focus:bg-black/30";
const primaryButtonClass =
  "inline-flex cursor-pointer items-center justify-center rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-white ring-1 ring-sky-200/60 shadow-[0_0_18px_rgba(56,189,248,0.25)] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-55";
const secondaryButtonClass =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/7 px-4 py-2.5 text-sm font-medium text-white/82 transition hover:bg-white/12";
const toolButtonClass =
  "inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/12 bg-white/7 px-4 py-3 text-sm font-medium text-white/86 transition hover:bg-white/12";
const MAX_CO_PRODUCER_ACTIONS = 5;
const GENERATE_TIMEOUT_MS = 3 * 60 * 1000;

const initialMixer: MixerState = {
  drums: 72,
  bass: 61,
  music: 68,
  vocal: 55,
  voiceover: 24,
  fx: 46,
  master: 70,
};

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
  },
  {
    id: "version-2",
    label: "Version 2",
    title: "Night Drive Signal V2",
    note: "Hook tightened and intro shortened while keeping the original version intact.",
    source: "generated",
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

function clampValue(value: number) {
  return Math.max(0, Math.min(100, value));
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

function Fader({
  label,
  value,
  muted,
  soloed,
  showMuteSolo = true,
  onChange,
  onMute,
  onSolo,
}: {
  label: string;
  value: number;
  muted: boolean;
  soloed: boolean;
  showMuteSolo?: boolean;
  onChange: (value: number) => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  function getFaderTrackColor(value: number) {
    const clamped = Math.max(0, Math.min(100, value));

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

      <div className="mb-3 text-xs font-semibold text-white">{value}%</div>

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
          min="0"
          max="100"
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
  const [directionLoading, setDirectionLoading] = useState<Record<DirectionKey, boolean>>({
    music: false,
    lyrics: false,
    artwork: false,
  });
  const [coProducerLoading, setCoProducerLoading] = useState<Record<CoProducerMode, boolean>>({
    music: false,
    lyrics: false,
    artwork: false,
    voiceover: false,
    edit: false,
  });
  const [coProducerRemaining, setCoProducerRemaining] = useState(MAX_CO_PRODUCER_ACTIONS);
  const [coProducerError, setCoProducerError] = useState<string | null>(null);

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

  const [uploadedTrackName, setUploadedTrackName] = useState("Imported Suno track - Neon Afterglow");
  const [uploadedTrackNotes, setUploadedTrackNotes] = useState(
    "Use this imported track as a starting point and push the chorus harder without losing the core feel."
  );

  const [studioPhase, setStudioPhase] = useState<"idle" | "loading" | "complete">("idle");
  const [stepState, setStepState] = useState<Record<StepKey, boolean>>({
    track: false,
    vocals: false,
    artwork: false,
  });

  const [versions, setVersions] = useState<VersionRecord[]>(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState("original");

  const [mixer, setMixer] = useState<MixerState>(initialMixer);
  const [dynamics, setDynamics] = useState<DynamicsState>(initialDynamics);
  const [muted, setMuted] = useState<MuteState>({
    drums: false,
    bass: false,
    music: false,
    vocal: false,
    voiceover: false,
    fx: false,
    master: false,
  });
  const [soloed, setSoloed] = useState<SoloState>({
    drums: false,
    bass: false,
    music: false,
    vocal: false,
    voiceover: false,
    fx: false,
    master: false,
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
  const [latestAiEditAdvice, setLatestAiEditAdvice] = useState<LatestAiEditAdvice>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [generateStartedAt, setGenerateStartedAt] = useState<number | null>(null);

  const activeGenerateJobIdRef = useRef<string | null>(null);
  const activeGenerateStartedAtRef = useRef<number | null>(null);
  const activeGenerateTokenRef = useRef<string | null>(null);
  const generatePollTimeoutRef = useRef<number | null>(null);
  const generationDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    setFinalDirection(musicDirection);
  }, [musicDirection]);

  useEffect(() => {
    setGenerateError(null);
  }, [finalDirection, idea, title, vocalMode]);

  useEffect(() => {
    return () => {
      if (generatePollTimeoutRef.current) {
        window.clearTimeout(generatePollTimeoutRef.current);
      }
    };
  }, []);

  const activeVersion = useMemo(
    () => versions.find((version) => version.id === activeVersionId) ?? versions[0],
    [activeVersionId, versions]
  );

  const mixerSummary = useMemo(
    () => summarizeMixer(mixer, dynamics, vocalMode),
    [dynamics, mixer, vocalMode]
  );

  useEffect(() => {
    setMixer(activeVersion.mixer);
    setDynamics(activeVersion.dynamics);
  }, [activeVersion]);

  function setDirectionState(key: DirectionKey, next: boolean) {
    setDirectionLoading((current) => ({ ...current, [key]: next }));
  }

  function setCoProducerState(key: CoProducerMode, next: boolean) {
    setCoProducerLoading((current) => ({ ...current, [key]: next }));
  }

  function getCurrentDirectionForMode(mode: CoProducerMode) {
    if (mode === "music") return finalDirection;
    if (mode === "lyrics") return lyricsDirection;
    if (mode === "artwork") return artworkDirection;
    if (mode === "voiceover") return voiceoverScript;
    return `${finalDirection}\n\n${uploadedTrackNotes}`;
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

  async function handleLyricsAction(action: "generate" | "hook" | "emotional" | "chorus") {
    const requests = {
      generate: "Generate concise lyrics with a strong hook and emotional clarity.",
      hook: "Improve the hook and make the chorus more repeatable.",
      emotional: "Make the lyrics more emotional and direct.",
      chorus: "Rewrite the chorus for a stronger payoff.",
    };

    const result = await requestCoProducer({
      mode: "lyrics",
      userRequest: requests[action],
      currentDirection: `${lyricsDirection}\n\n${lyricsPrompt}\n\n${lyricsPreview}`,
    });

    if (result) {
      setLyricsPreview(result);
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
  }

  async function cancelActiveGeneration(jobId: string) {
    try {
      const response = await fetch("/api/generate-track/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId }),
      });

      const payload = await response.json().catch(() => null);

      return {
        cancelled: Boolean(payload?.cancelled),
        available: payload?.available !== false,
        message: extractApiError(
          payload,
          payload?.cancelled
            ? "Generation timed out and RunPod job was cancelled."
            : "Generation timed out. RunPod cancellation was not available."
        ),
        details:
          typeof payload?.details === "string" && payload.details.trim()
            ? payload.details.trim()
            : payload?.runpod
              ? stringifyDetails(payload.runpod)
              : null,
      };
    } catch {
      return {
        cancelled: false,
        available: false,
        message: "Generation timed out. RunPod cancellation was not available.",
        details: null,
      };
    }
  }

  async function pollGenerateStatus(
    jobId: string,
    trackTitle: string,
    startedAt: number,
    token: string
  ) {
    if (!isActiveGeneration(jobId, startedAt, token)) {
      return;
    }

    if (generationDeadlineRef.current && Date.now() >= generationDeadlineRef.current) {
      stopGenerationPolling();
      const cancellation = await cancelActiveGeneration(jobId);
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
        `/api/generate-track/status?jobId=${encodeURIComponent(jobId)}&title=${encodeURIComponent(trackTitle)}&startedAt=${startedAt}`,
        {
          cache: "no-store",
        }
      );
      const payload = await response.json().catch(() => null);

      if (!isActiveGeneration(jobId, startedAt, token)) {
        return;
      }

      if (!response.ok) {
        throw new Error(extractApiError(payload, "RunPod status request failed"));
      }

      if (payload?.status === "IN_QUEUE") {
        if (!isActiveGeneration(jobId, startedAt, token)) {
          return;
        }
        setGenerateStatus("Queued in RunPod...");
        generatePollTimeoutRef.current = window.setTimeout(() => {
          void pollGenerateStatus(jobId, trackTitle, startedAt, token);
        }, 3000);
        return;
      }

      if (payload?.status === "IN_PROGRESS") {
        if (!isActiveGeneration(jobId, startedAt, token)) {
          return;
        }
        setGenerateStatus("RunPod is generating your track...");
        setStepState({
          track: true,
          vocals: vocalMode !== "instrumental",
          artwork: false,
        });
        generatePollTimeoutRef.current = window.setTimeout(() => {
          void pollGenerateStatus(jobId, trackTitle, startedAt, token);
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

        const nextNumber = versions.length + 1;
        const nextId = `version-${nextNumber}`;
        const nextVersion: VersionRecord = {
          id: nextId,
          label: `Version ${nextNumber}`,
          title: payload.track.title || trackTitle,
          note: `Generated from RunPod async job ${jobId}. ${mixerSummary}. Original remains intact.`,
          source: "generated",
          mixer: { ...mixer },
          dynamics: { ...dynamics },
          audioUrl: payload.track.audioUrl,
        };

        setVersions((current) => [...current, nextVersion]);
        setActiveVersionId(nextId);
        return;
      }

      throw new Error(extractApiError(payload, "Unexpected RunPod status response"));
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
        error?.message === "Generation timed out and RunPod job was cancelled." ||
          error?.message === "Generation timed out. RunPod cancellation was not available."
          ? error.message
          : null
      );
    }
  }

  async function handleGenerate() {
    const trimmedTitle = title.trim();
    const trimmedIdea = idea.trim();
    const trimmedFinalDirection = finalDirection.trim() || musicDirection.trim();

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

    if (!vocalMode) {
      setGenerateError("Choose a vocal mode before previewing generation.");
      return;
    }

    setGenerateError(null);
    setGenerateStatus("Starting generation...");
    const previousJobId = activeGenerateJobIdRef.current || generateJobId;
    stopGenerationPolling();
    clearActiveGenerationRefs();
    setGenerateJobId(null);
    setGenerateStartedAt(null);
    if (previousJobId) {
      await cancelActiveGeneration(previousJobId);
    }
    setStudioPhase("loading");
    setStepState({
      track: true,
      vocals: false,
      artwork: false,
    });

    const startedAt = Date.now();
    const token = createGenerationToken();
    activeGenerateStartedAtRef.current = startedAt;
    activeGenerateTokenRef.current = token;
    setGenerateStartedAt(startedAt);

    try {
      const response = await fetch("/api/generate-track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: trimmedTitle,
          finalDirection: trimmedFinalDirection,
          vocalMode,
          clientGenerationToken: token,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(extractApiError(payload, "RunPod generation start failed"));
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
        throw new Error("RunPod start response missing job id");
      }

      activeGenerateJobIdRef.current = jobId;
      setGenerateJobId(jobId);
      setGenerateStatus("Queued in RunPod...");
      generationDeadlineRef.current = startedAt + GENERATE_TIMEOUT_MS;
      void pollGenerateStatus(jobId, trimmedTitle, startedAt, token);
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
      setGenerateError(error?.message || "RunPod generation start failed");
      setGenerateStatus(null);
      setGenerateStartedAt(null);
      setGenerateJobId(null);
    }
  }

  function updateFader(key: FaderKey, value: number) {
    setMixer((current) => ({
      ...current,
      [key]: clampValue(value),
    }));
  }

  function updateDynamics(key: DynamicsKey, value: number) {
    setDynamics((current) => ({
      ...current,
      [key]: clampValue(value),
    }));
  }

  function toggleMute(key: FaderKey) {
    setMuted((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleSolo(key: FaderKey) {
    setSoloed((current) => ({ ...current, [key]: !current[key] }));
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

    if (action === "Submit to SoundioX YouTube") {
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

  function applyAiAdviceToTrack() {
    if (!latestAiEditAdvice) return;

    const nextNumber = versions.length + 1;
    const nextId = `version-${nextNumber}`;
    const nextLabel = `Version ${nextNumber}`;
    const nextMixer = { ...mixer };
    const nextDynamics = { ...dynamics };

    if (latestAiEditAdvice.finalDirection) {
      setMusicDirection(latestAiEditAdvice.finalDirection);
      setFinalDirection(latestAiEditAdvice.finalDirection);
    }

    const nextVersion: VersionRecord = {
      id: nextId,
      label: nextLabel,
      title: `${title} AI Edit`,
      note:
        latestAiEditAdvice.versionNote ||
        latestAiEditAdvice.impact ||
        buildVersionNote("AI Edit", nextMixer, nextDynamics, vocalMode),
      source: "generated",
      mixer: nextMixer,
      dynamics: nextDynamics,
    };

    setVersions((current) => [...current, nextVersion]);
    setActiveVersionId(nextId);
    setWorkspaceStatus(
      latestAiEditAdvice.impact
        ? `Applied AI edit. ${latestAiEditAdvice.impact}`
        : "Applied AI edit to the current track direction."
    );
  }

  function handleWorkspaceAction(action: string) {
    setWorkspaceStatus(`${action} prepared as a mock studio step. A new branch can be created without overwriting the original.`);
    createVersion(action, "generated");
  }

  async function handleChatSend() {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    setChatMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed,
      },
    ]);

    const mode = resolveChatMode(trimmed);
    const currentDirection = getCurrentDirectionForMode(mode);
    const result = await requestCoProducer({
      mode,
      userRequest: trimmed,
      currentDirection,
    });

    if (result) {
      if (mode === "edit") {
        setLatestAiEditAdvice(parseEditAdvice(result));
      }
      applyCoProducerResult(mode, result, "chat");
      setChatMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now() + 1}`,
          role: "ai",
          text: result,
          canApply: true,
        },
      ]);
      setChatInput("");
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
                onClick={() => applyAiAdviceToTrack()}
                disabled={!latestAiEditAdvice}
                className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-full bg-sky-400 px-4 py-2 text-xs font-semibold text-white ring-1 ring-sky-200/60 shadow-[0_0_18px_rgba(56,189,248,0.22)] transition hover:bg-sky-300"
              >
                Apply to Track & Create Version
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_right,rgba(14,165,233,0.12),transparent_25%),linear-gradient(180deg,#050912_0%,#0b1120_100%)] px-4 pb-24 pt-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Studio</h1>
          <p className="mt-2 text-sm text-white">
            Start with your idea, shape it in the studio, and use the AI co-producer when you need guidance.
          </p>
        </div>

        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <section className={sectionClass}>
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  CREATE YOUR TRACK
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Start from the main idea
                </div>
              </div>

              <div className="space-y-4">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={inputClass}
                  placeholder="Track title"
                />

                <textarea
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  rows={5}
                  className={`${inputClass} resize-none`}
                  placeholder="Describe the track idea..."
                />

                <input
                  value={references}
                  onChange={(event) => setReferences(event.target.value)}
                  className={inputClass}
                  placeholder="Optional references"
                />
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
                      value={value}
                      onChange={(event) => setter(event.target.value)}
                      rows={7}
                      className={`${inputClass} resize-none`}
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
                    </div>
                  </div>
                ))}
              </div>

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

                    <textarea
                      value={lyricsPreview}
                      onChange={(event) => setLyricsPreview(event.target.value)}
                      rows={7}
                      className={`${inputClass} resize-none`}
                      placeholder="Generated lyrics preview"
                    />

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => void handleLyricsAction("generate")}
                        disabled={coProducerLoading.lyrics || coProducerRemaining <= 0}
                        className={`${primaryButtonClass} h-11 w-full justify-center`}
                      >
                        {coProducerLoading.lyrics ? "Generating..." : "Generate lyrics"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLyricsAction("hook")}
                        disabled={coProducerLoading.lyrics || coProducerRemaining <= 0}
                        className={`${secondaryButtonClass} h-11 w-full justify-center`}
                      >
                        Improve hook
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLyricsAction("emotional")}
                        disabled={coProducerLoading.lyrics || coProducerRemaining <= 0}
                        className={`${secondaryButtonClass} h-11 w-full justify-center`}
                      >
                        Make more emotional
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLyricsAction("chorus")}
                        disabled={coProducerLoading.lyrics || coProducerRemaining <= 0}
                        className={`${secondaryButtonClass} h-11 w-full justify-center`}
                      >
                        Rewrite chorus
                      </button>
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
            </section>

            <section className={sectionClass}>
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  YOUR ARTIST IDENTITY
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Create your artist identity
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white">
                    AI
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">AI Artist</div>
                    <div className="mt-1 text-sm text-white">
                      Save your artist voice and identity once, then reuse it across tracks.
                    </div>
                  </div>
                </div>

                <button type="button" className={`${secondaryButtonClass} w-full justify-center py-3`}>
                  Create or add your profile picture
                </button>

                <textarea
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder="Describe your artist identity or visual style..."
                />

                <div className="flex flex-col gap-3">
                  {["Record your voice", "Generate artist voice", "Edit identity"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={`${toolButtonClass} h-11 w-full justify-center px-4 py-2`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section className={sectionClass}>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-white">
                STUDIO CONTROLS
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Mix the layers like a small control desk
              </div>
            </div>

            <div className="mb-4 text-sm text-white/80">
              Currently editing: {title.trim() ? `${title} · ${activeVersion.label}` : "New track draft"}
            </div>

            <div className="rounded-[24px] border border-sky-200/18 bg-black/18 p-4">
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                {([
                  ["drums", "Drums"],
                  ["bass", "Bass"],
                  ["music", "Music"],
                  ["vocal", "Vocal"],
                  ["voiceover", "Voiceover"],
                  ["fx", "FX / Ambience"],
                  ["master", "Master"],
                ] as Array<[FaderKey, string]>).map(([key, label]) => (
                  <Fader
                    key={key}
                    label={label}
                    value={mixer[key]}
                    muted={muted[key]}
                    soloed={soloed[key]}
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

          <section className={sectionClass}>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-white">
                EDIT EXISTING TRACK
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Edit imported or uploaded source tracks
              </div>
            </div>

            <div className="space-y-4">
              <input
                value={uploadedTrackName}
                onChange={(event) => setUploadedTrackName(event.target.value)}
                className={inputClass}
                placeholder="Uploaded or imported track name"
              />

              <textarea
                value={uploadedTrackNotes}
                onChange={(event) => setUploadedTrackNotes(event.target.value)}
                rows={5}
                className={`${inputClass} resize-none`}
                placeholder="Describe the changes you want for this uploaded / imported track..."
              />

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
                The original source track is never overwritten. Every edit saves into a new mock
                version branch.
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {["Instrumental version", "Create remix", "Create new version"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => createVersion(label, "imported")}
                    className={`${toolButtonClass} w-full px-4 py-2`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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

                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                        VERSION NOTE
                      </div>
                      <div className="mt-2 text-sm text-white">{activeVersion.note}</div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                        MIXER SUMMARY
                      </div>
                      <div className="mt-2 text-sm text-white">{mixerSummary}</div>
                    </div>

                    {activeVersion.audioUrl ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                          AUDIO PREVIEW
                        </div>
                        <audio className="mt-3 w-full" controls src={activeVersion.audioUrl}>
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {["Instrumental version", "Create remix", "Create new version"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => createVersion(label, "generated")}
                    className={`${toolButtonClass} w-full px-4 py-2`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {[
                  "Submit to SoundioX YouTube",
                  "Export for Spotify",
                  "Export release package",
                ].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleWorkspaceAction(label)}
                    className={`${toolButtonClass} w-full px-4 py-2`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-white">
                  WORKSPACE STATUS
                </div>
                <div className="mt-2 text-sm text-white">{workspaceStatus}</div>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-white">VOICE</div>
              <div className="mt-1 text-lg font-semibold text-white">
                Choose the main vocal mode clearly
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
          </section>

          <section className={sectionClass}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.2em] text-white">
                  GENERATE
                </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Queue a short Studio test generation
              </div>
              <div className="mt-2 text-sm text-white">
                Generation runs through RunPod asynchronously and returns the finished audio when
                the job completes.
              </div>
              <div className="mt-1 text-xs text-white">
                Short 15s test mode. The current job stays exclusive until it completes, fails, or times out.
              </div>
            </div>

              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!idea.trim() || studioPhase === "loading"}
                className={primaryButtonClass}
              >
                {studioPhase === "loading"
                  ? generateStatus || "Starting generation..."
                  : "Generate"}
              </button>
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
                  <span className="mt-1 block text-xs text-white">RunPod job: {generateJobId}</span>
                ) : null}
              </div>
            ) : null}

            {studioPhase !== "idle" ? (
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {([
                  ["track", "Generating track"],
                  ["vocals", "Generating vocals"],
                  ["artwork", "Generating artwork"],
                ] as Array<[StepKey, string]>).map(([key, label]) => {
                  const active = stepState[key];
                  const done = studioPhase === "complete";

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
                        {done ? "Done" : active ? "Working..." : "Pending"}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className={sectionClass}>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.2em] text-white">VERSIONS</div>
              <div className="mt-1 text-lg font-semibold text-white">
                Original stays intact while new edits branch forward
              </div>
            </div>

            <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
              Any edit or create action branches a new mock version. Original remains untouched and
              version notes explain what changed.
            </div>

            <div className="space-y-2">
              {versions.map((version) => {
                const isActive = version.id === activeVersionId;

                return (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setActiveVersionId(version.id)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                      isActive
                        ? "bg-sky-400 text-white ring-1 ring-sky-200/60 shadow-[0_0_18px_rgba(56,189,248,0.25)]"
                        : "border border-white/10 bg-black/20 text-white/84 hover:bg-black/25"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">{version.label}</div>
                      <div className="text-xs text-white">
                        {version.note}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold">
                      {isActive ? "CURRENT" : "Open"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
