"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RealtimeStemUrls = {
  drums?: string | null;
  bass?: string | null;
  vocals?: string | null;
  other?: string | null;
};

type RealtimeMixControls = {
  drums: number;
  bass: number;
  vocal: number;
  music: number;
  fx?: number;
  master: number;
  subBass: number;
  speed: number;
  punch?: number;
  overdrive?: number;
  overdriveMode?: "Clean" | "Tube" | "Hard";
  stereoWidth?: number;
  stereoBalance?: number;
  monoSafe?: number;
  harshnessReduction?: number;
  effectStrength?: "subtle" | "normal" | "strong";
  air?: number;
  warmth?: number;
  compression?: number;
  loudness?: number;
  saturation?: number;
  limiter?: number;
  clipSafe?: number;
  analogFeel?: number;
  normalize?: boolean;
  dnbFeel?: number;
  houseFeel?: number;
  clubEnergy?: number;
};

type RealtimeMixOptions = {
  sourceUrl?: string | null;
  stemsReady?: boolean;
  stems?: RealtimeStemUrls;
  bufferCacheKey?: string | null;
  controls: RealtimeMixControls;
  compareMode?: "original" | "mix";
};

type ChannelKey = "source" | "drums" | "bass" | "vocals" | "other";

type RealtimeChannel = {
  key: ChannelKey;
  element?: HTMLAudioElement;
  buffer?: AudioBuffer;
  bufferSource?: AudioBufferSourceNode | null;
  gain: GainNode;
  subFilter: BiquadFilterNode;
  punchFilter: BiquadFilterNode;
  warmthFilter: BiquadFilterNode;
  harshFilter: BiquadFilterNode;
  airFilter: BiquadFilterNode;
  drive: WaveShaperNode;
  panner: StereoPannerNode | null;
  analyser: AnalyserNode;
  source?: MediaElementAudioSourceNode;
  sharedSource?: boolean;
};

type RealtimeGraph = {
  key: string;
  context: AudioContext;
  masterGain: GainNode;
  loudnessGain: GainNode;
  saturationInputGain: GainNode;
  saturationOutputGain: GainNode;
  analogFilter: BiquadFilterNode;
  softClipper: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
  masterAnalyser: AnalyserNode;
  channels: RealtimeChannel[];
  usingStems: boolean;
  isBufferMode: boolean;
  compareMode: "original" | "mix";
  startedAt: number;
  startOffset: number;
  playbackRate: number;
  duration: number;
};

type RealtimeLevels = {
  drums: number;
  bass: number;
  vocals: number;
  music: number;
  fx: number;
  master: number;
};

const FALLBACK_CHANNEL_WEIGHT = 4;
const STEM_LOAD_TIMEOUT_MS = 15_000;
const stemBufferCache = new Map<
  string,
  {
    buffers: Partial<Record<Exclude<ChannelKey, "source">, AudioBuffer>>;
    duration: number;
  }
>();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function gainFromPercent(value: number) {
  return clamp(value, 0, 120) / 100;
}

function speedFromPercent(value: number) {
  return clamp(value, 50, 200) / 100;
}

function dbFromPercent(value: number | undefined, maxDb: number) {
  return clamp(value ?? 0, 0, 100) * (maxDb / 100);
}

function getDriveCurve(amount: number | undefined) {
  const driveAmount = clamp(amount ?? 0, 0, 100);
  const samples = 256;
  const curve = new Float32Array(samples);
  const k = driveAmount * 0.12;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1;
    curve[index] = clamp(((1 + k) * x) / (1 + k * Math.abs(x)), -0.92, 0.92);
  }
  return curve;
}

function getSoftClipCurve(amount: number | undefined) {
  const clipAmount = clamp(amount ?? 0, 0, 100);
  const samples = 512;
  const curve = new Float32Array(samples);
  const drive = 1 + clipAmount * 0.012;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = clamp(Math.tanh(x * drive) * 0.92, -0.9, 0.9);
  }
  return curve;
}

function getOverdriveAmount(controls: RealtimeMixControls, bypass: boolean) {
  if (bypass || controls.overdriveMode === "Clean") return 0;
  const modeMultiplier = controls.overdriveMode === "Hard" ? 0.42 : 0.22;
  return clamp((controls.overdrive ?? 0) * modeMultiplier, 0, controls.overdriveMode === "Hard" ? 32 : 18);
}

function getEffectStrengthMultiplier(controls: RealtimeMixControls) {
  if (controls.effectStrength === "subtle") return 0.65;
  if (controls.effectStrength === "strong") return 1.45;
  return 1;
}

function getAudioContextCtor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

function createEmptyLevels(): RealtimeLevels {
  return {
    drums: 0,
    bass: 0,
    vocals: 0,
    music: 0,
    fx: 0,
    master: 0,
  };
}

function readAnalyserLevel(analyser: AnalyserNode) {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let index = 0; index < data.length; index += 1) {
    const centered = (data[index] - 128) / 128;
    sum += centered * centered;
  }
  return clamp(Math.sqrt(sum / data.length) * 3.8, 0, 1);
}

function smoothLevel(previous: number, next: number) {
  return next > previous ? previous * 0.55 + next * 0.45 : previous * 0.88 + next * 0.12;
}

function createAudioElement(url: string) {
  const element = new Audio();
  element.crossOrigin = "anonymous";
  element.preload = "auto";
  element.src = url;
  return element;
}

async function fetchAudioBuffer(context: AudioContext, url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load stem audio (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return context.decodeAudioData(arrayBuffer.slice(0));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function getChannelGain(key: ChannelKey, controls: RealtimeMixControls, usingStems: boolean) {
  let gain = 1;

  if (key === "drums") gain = gainFromPercent(controls.drums);
  else if (key === "bass") gain = gainFromPercent(controls.bass);
  else if (key === "vocals") gain = gainFromPercent(controls.vocal);
  else if (key === "other") gain = gainFromPercent(controls.music);
  else {
    gain =
      gainFromPercent(controls.drums) +
      gainFromPercent(controls.bass) +
      gainFromPercent(controls.vocal) +
      gainFromPercent(controls.music) * (0.7 + gainFromPercent(controls.fx ?? 50) * 0.6);
  }

  return usingStems ? gain : gain / FALLBACK_CHANNEL_WEIGHT;
}

function isStemChannel(key: ChannelKey) {
  return key === "drums" || key === "bass" || key === "vocals" || key === "other";
}

function getPanForChannel(key: ChannelKey, controls: RealtimeMixControls) {
  const strength = getEffectStrengthMultiplier(controls);
  const monoSafeAmount = clamp((controls.monoSafe ?? 0) * strength, 0, 100) / 100;
  const widthAmount = (clamp(controls.stereoWidth ?? 0, 0, 100) / 100) * (1 - monoSafeAmount);
  const balance = clamp(controls.stereoBalance ?? 0, -50, 50) / 100;
  let lanePan = 0;
  if (key === "drums") lanePan = -0.12 * widthAmount;
  if (key === "bass") lanePan = 0;
  if (key === "vocals") lanePan = 0.08 * widthAmount;
  if (key === "other") lanePan = 0.24 * widthAmount;
  return clamp(lanePan + balance, -0.85, 0.85);
}

function getSubGainForChannel(key: ChannelKey, controls: RealtimeMixControls, bypass: boolean) {
  if (bypass) return 0;
  if (key === "bass" || key === "source") return clamp(controls.subBass, 0, 100) * 0.08;
  return 0;
}

function getPunchGainForChannel(key: ChannelKey, controls: RealtimeMixControls, bypass: boolean) {
  if (bypass) return 0;
  const basePunch = dbFromPercent(controls.punch, 5);
  if (key === "drums") return basePunch + dbFromPercent(controls.dnbFeel, 1.2) + dbFromPercent(controls.compression, 0.8);
  if (key === "bass") return basePunch * 0.65 + dbFromPercent(controls.clubEnergy, 1);
  if (key === "source") return basePunch * 0.5 + dbFromPercent(controls.clubEnergy, 0.8);
  return dbFromPercent(controls.punch, 1.2);
}

function getWarmthGainForChannel(key: ChannelKey, controls: RealtimeMixControls, bypass: boolean) {
  if (bypass) return 0;
  if (key === "bass") return dbFromPercent(controls.warmth, 3.5) + dbFromPercent(controls.houseFeel, 1.4);
  if (key === "other") return dbFromPercent(controls.warmth, 2.2) + dbFromPercent(controls.analogFeel, 1.2);
  if (key === "source") return dbFromPercent(controls.warmth, 2.4) + dbFromPercent(controls.houseFeel, 0.8);
  return dbFromPercent(controls.warmth, 0.8);
}

function getAirGainForChannel(key: ChannelKey, controls: RealtimeMixControls, bypass: boolean) {
  if (bypass) return 0;
  const strength = getEffectStrengthMultiplier(controls);
  const harshnessCut =
    key === "drums" || key === "other" || key === "source"
      ? dbFromPercent((controls.harshnessReduction ?? 0) * strength, 10)
      : dbFromPercent((controls.harshnessReduction ?? 0) * strength, 4.5);
  if (key === "vocals") return dbFromPercent(controls.air, 4) + dbFromPercent(controls.saturation, 0.6) - harshnessCut;
  if (key === "other") return dbFromPercent(controls.air, 3) + dbFromPercent(controls.dnbFeel, 1.2) - harshnessCut;
  if (key === "source") return dbFromPercent(controls.air, 2.8) + dbFromPercent(controls.dnbFeel, 0.8) - harshnessCut;
  return dbFromPercent(controls.air, 0.8) - harshnessCut;
}

export function useRealtimeMixPreview({
  sourceUrl,
  stemsReady,
  stems,
  bufferCacheKey,
  controls,
  compareMode = "mix",
}: RealtimeMixOptions) {
  const stemDrums = stems?.drums || null;
  const stemBass = stems?.bass || null;
  const stemVocals = stems?.vocals || null;
  const stemOther = stems?.other || null;
  const audioContextRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<RealtimeGraph | null>(null);
  const buildPromiseRef = useRef<Promise<RealtimeGraph | null> | null>(null);
  const buildSerialRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const controlsRef = useRef(controls);
  const previousSourceUrlRef = useRef<string | null>(null);
  const levelsRef = useRef<RealtimeLevels>(createEmptyLevels());
  const endedRef = useRef(false);
  const lastDriftCorrectionRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTimeState] = useState(0);
  const [duration, setDuration] = useState(0);
  const [usingStems, setUsingStems] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoadingStems, setIsLoadingStems] = useState(false);
  const [buffersReady, setBuffersReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<RealtimeLevels>(() => createEmptyLevels());

  const sourceKey = useMemo(() => {
    if (compareMode === "original") {
      return sourceUrl ? `original|${sourceUrl}` : "";
    }

    const stemUrls = [stemDrums, stemBass, stemVocals, stemOther].filter(Boolean);
    if (stemsReady && stemUrls.length > 0) {
      return [
        "stems",
        bufferCacheKey || "no-version-key",
        stemDrums || "missing-drums",
        stemBass || "missing-bass",
        stemVocals || "missing-vocals",
        stemOther || "missing-other",
      ].join("|");
    }
    return sourceUrl ? `source|${sourceUrl}` : "";
  }, [bufferCacheKey, compareMode, sourceUrl, stemBass, stemDrums, stemOther, stemVocals, stemsReady]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const cleanupGraph = useCallback(
    (closeContext = false) => {
      stopRaf();
      const graph = graphRef.current;
      if (graph) {
        console.log("PRO GRAPH CLEANUP", {
          key: graph.key,
          usingStems: graph.usingStems,
          compareMode: graph.compareMode,
        });
        console.log("PRO GRAPH DESTROY", {
          key: graph.key,
          bufferMode: graph.isBufferMode,
        });
        const elements = new Set<HTMLAudioElement>();
        const sources = new Set<MediaElementAudioSourceNode>();
        graph.channels.forEach((channel) => {
          if (channel.element) elements.add(channel.element);
        if (channel.source) sources.add(channel.source);
        if (channel.bufferSource) {
          try {
            channel.bufferSource.stop();
          } catch {}
          channel.bufferSource.disconnect();
          channel.bufferSource = null;
        }
        channel.gain.disconnect();
        channel.subFilter.disconnect();
        channel.punchFilter.disconnect();
        channel.warmthFilter.disconnect();
        channel.harshFilter.disconnect();
        channel.airFilter.disconnect();
        channel.drive.disconnect();
        channel.panner?.disconnect();
        channel.analyser.disconnect();
      });
        sources.forEach((source) => source.disconnect());
        elements.forEach((element) => {
          element.pause();
          element.removeAttribute("src");
          element.load();
        });
        graph.masterGain.disconnect();
        graph.loudnessGain.disconnect();
        graph.saturationInputGain.disconnect();
        graph.saturationOutputGain.disconnect();
        graph.analogFilter.disconnect();
        graph.softClipper.disconnect();
        graph.compressor.disconnect();
        graph.limiter.disconnect();
        graph.masterAnalyser.disconnect();
      }
      graphRef.current = null;
      setPlaying(false);
      setIsReady(false);
      setUsingStems(false);
      setIsLoadingStems(false);
      setBuffersReady(false);
      levelsRef.current = createEmptyLevels();
      setLevels(levelsRef.current);

      if (closeContext && audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    },
    [stopRaf]
  );

  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return null;
    audioContextRef.current = new AudioContextCtor();
    return audioContextRef.current;
  }, []);

  const applyControls = useCallback(
    (graph: RealtimeGraph | null = graphRef.current) => {
      if (!graph) return;
      const currentControls = controlsRef.current;
      const bypass = graph.compareMode === "original";
      const playbackRate = bypass ? 1 : speedFromPercent(currentControls.speed);
      const masterGainValue = bypass ? 1 : Math.min(1.08, gainFromPercent(currentControls.master));
      const compressionAmount = bypass ? 0 : clamp(currentControls.compression ?? 0, 0, 100);
      const loudnessAmount = bypass ? 0 : clamp(currentControls.loudness ?? 0, 0, 45);
      const saturationAmount = bypass ? 0 : clamp(currentControls.saturation ?? 0, 0, 30);
      const limiterAmount = bypass ? 0 : clamp(currentControls.limiter ?? 0, 0, 100);
      const clipSafeAmount = bypass ? 0 : clamp(currentControls.clipSafe ?? 0, 0, 100);
      const analogFeelAmount = bypass ? 0 : clamp(currentControls.analogFeel ?? 0, 0, 100);
      const effectStrength = getEffectStrengthMultiplier(currentControls);
      const harshnessAmount = bypass ? 0 : clamp((currentControls.harshnessReduction ?? 0) * effectStrength, 0, 100);

      graph.masterGain.gain.setTargetAtTime(
        masterGainValue,
        graph.context.currentTime,
        0.02
      );
      graph.loudnessGain.gain.setTargetAtTime(
        Math.min(1.16, 1 + loudnessAmount * 0.0024),
        graph.context.currentTime,
        0.03
      );
      graph.saturationInputGain.gain.setTargetAtTime(
        bypass ? 1 : 0.78,
        graph.context.currentTime,
        0.03
      );
      graph.saturationOutputGain.gain.setTargetAtTime(
        bypass ? 1 : 0.88,
        graph.context.currentTime,
        0.03
      );
      graph.analogFilter.frequency.setTargetAtTime(
        180 + analogFeelAmount * 2.2,
        graph.context.currentTime,
        0.04
      );
      graph.analogFilter.gain.setTargetAtTime(
        analogFeelAmount * 0.025,
        graph.context.currentTime,
        0.04
      );
      graph.softClipper.curve = getSoftClipCurve(saturationAmount + clipSafeAmount * 0.08);

      graph.compressor.threshold.setTargetAtTime(
        currentControls.normalize || compressionAmount > 0 ? -8 - compressionAmount * 0.22 : -3,
        graph.context.currentTime,
        0.04
      );
      graph.compressor.ratio.setTargetAtTime(
        currentControls.normalize ? 2.8 + compressionAmount * 0.025 : 1 + compressionAmount * 0.035,
        graph.context.currentTime,
        0.04
      );
      graph.compressor.knee.setTargetAtTime(16, graph.context.currentTime, 0.04);
      graph.compressor.attack.setTargetAtTime(
        0.004 + (100 - compressionAmount) * 0.00012,
        graph.context.currentTime,
        0.04
      );
      graph.compressor.release.setTargetAtTime(
        0.12 + compressionAmount * 0.0012,
        graph.context.currentTime,
        0.04
      );
      graph.limiter.threshold.setTargetAtTime(
        -4 - limiterAmount * 0.055 - clipSafeAmount * 0.035,
        graph.context.currentTime,
        0.04
      );
      graph.limiter.ratio.setTargetAtTime(6 + limiterAmount * 0.12, graph.context.currentTime, 0.04);
      graph.limiter.knee.setTargetAtTime(5, graph.context.currentTime, 0.04);
      graph.limiter.attack.setTargetAtTime(0.001, graph.context.currentTime, 0.04);
      graph.limiter.release.setTargetAtTime(0.045 + clipSafeAmount * 0.001, graph.context.currentTime, 0.04);

      const stemLaneGains: Partial<Record<"drums" | "bass" | "vocals" | "music", number>> = {};

      graph.channels.forEach((channel) => {
        const laneGain = bypass ? 1 : getChannelGain(channel.key, currentControls, graph.usingStems);
        channel.gain.gain.setTargetAtTime(
          laneGain,
          graph.context.currentTime,
          0.02
        );
        if (graph.usingStems) {
          if (channel.key === "drums") stemLaneGains.drums = laneGain;
          if (channel.key === "bass") stemLaneGains.bass = laneGain;
          if (channel.key === "vocals") stemLaneGains.vocals = laneGain;
          if (channel.key === "other") stemLaneGains.music = laneGain;
        }
        if (channel.element) channel.element.playbackRate = playbackRate;
        if (channel.bufferSource) {
          channel.bufferSource.playbackRate.setTargetAtTime(playbackRate, graph.context.currentTime, 0.02);
        }
        channel.subFilter.gain.setTargetAtTime(
          getSubGainForChannel(channel.key, currentControls, bypass),
          graph.context.currentTime,
          0.03
        );
        channel.punchFilter.gain.setTargetAtTime(
          getPunchGainForChannel(channel.key, currentControls, bypass),
          graph.context.currentTime,
          0.03
        );
        channel.warmthFilter.gain.setTargetAtTime(
          getWarmthGainForChannel(channel.key, currentControls, bypass),
          graph.context.currentTime,
          0.03
        );
        channel.harshFilter.gain.setTargetAtTime(
          channel.key === "drums" || channel.key === "other" || channel.key === "source"
            ? -(harshnessAmount * 0.13)
            : -(harshnessAmount * 0.055),
          graph.context.currentTime,
          0.035
        );
        channel.harshFilter.frequency.setTargetAtTime(
          harshnessAmount > 75 ? 7600 : 8400,
          graph.context.currentTime,
          0.04
        );
        channel.airFilter.gain.setTargetAtTime(
          getAirGainForChannel(channel.key, currentControls, bypass),
          graph.context.currentTime,
          0.03
        );
        channel.airFilter.frequency.setTargetAtTime(
          harshnessAmount > 0 ? 6200 : 7800,
          graph.context.currentTime,
          0.04
        );
        channel.drive.curve = getDriveCurve(
          getOverdriveAmount(currentControls, bypass) +
            (bypass ? 0 : (currentControls.saturation ?? 0) * 0.08 + (currentControls.analogFeel ?? 0) * 0.05)
        );
        channel.panner?.pan.setTargetAtTime(
          bypass ? 0 : getPanForChannel(channel.key, currentControls),
          graph.context.currentTime,
          0.03
        );
      });

      if (graph.usingStems) {
        console.log("STEM LANE GAIN drums/bass/vocals/music", {
          drums: stemLaneGains.drums ?? 0,
          bass: stemLaneGains.bass ?? 0,
          vocals: stemLaneGains.vocals ?? 0,
          music: stemLaneGains.music ?? 0,
          master: masterGainValue,
        });
      }

      console.log("REALTIME CONTROL UPDATE", {
        usingStems: graph.usingStems,
        controls: currentControls,
        playbackRate,
        masterGain: masterGainValue,
        compareMode: graph.compareMode,
        proDsp: {
          punch: currentControls.punch ?? 0,
          overdrive: currentControls.overdrive ?? 0,
          stereoWidth: currentControls.stereoWidth ?? 0,
          stereoBalance: currentControls.stereoBalance ?? 0,
          monoSafe: currentControls.monoSafe ?? 0,
          harshnessReduction: currentControls.harshnessReduction ?? 0,
          effectStrength: currentControls.effectStrength ?? "normal",
          air: currentControls.air ?? 0,
          warmth: currentControls.warmth ?? 0,
          normalize: Boolean(currentControls.normalize),
          compression: currentControls.compression ?? 0,
          loudness: currentControls.loudness ?? 0,
          saturation: currentControls.saturation ?? 0,
          limiter: currentControls.limiter ?? 0,
          clipSafe: currentControls.clipSafe ?? 0,
          analogFeel: currentControls.analogFeel ?? 0,
        },
      });
    },
    []
  );

  const stopBufferSources = useCallback((graph: RealtimeGraph) => {
    graph.channels.forEach((channel) => {
      if (!channel.bufferSource) return;
      try {
        channel.bufferSource.stop();
      } catch {}
      channel.bufferSource.disconnect();
      channel.bufferSource = null;
    });
  }, []);

  const startBufferSources = useCallback((graph: RealtimeGraph, offset: number) => {
    const playbackRate = speedFromPercent(controlsRef.current.speed);
    const safeOffset = Math.max(0, Math.min(offset, Math.max(0, graph.duration - 0.01)));
    const startAt = graph.context.currentTime + 0.035;
    stopBufferSources(graph);
    graph.channels.forEach((channel) => {
      if (!channel.buffer) return;
      const source = graph.context.createBufferSource();
      source.buffer = channel.buffer;
      source.playbackRate.value = playbackRate;
      source.connect(channel.gain);
      source.start(startAt, safeOffset);
      channel.bufferSource = source;
    });
    graph.startedAt = startAt;
    graph.startOffset = safeOffset;
    graph.playbackRate = playbackRate;
    console.log("PRO STEM PLAY START", {
      usingStems: graph.usingStems,
      compareMode: graph.compareMode,
      currentTime: safeOffset,
      buffers: graph.channels.length,
    });
  }, [stopBufferSources]);

  const buildGraph = useCallback(async () => {
    const buildId = buildSerialRef.current + 1;
    buildSerialRef.current = buildId;
    cleanupGraph(false);
    setError(null);
    if (!sourceKey) return null;

    const context = getAudioContext();
    if (!context) {
      setError("Realtime audio is not available in this browser.");
      return null;
    }

    const stemSources: Array<{ key: Exclude<ChannelKey, "source">; url: string }> = [
      stemDrums ? { key: "drums", url: stemDrums } : null,
      stemBass ? { key: "bass", url: stemBass } : null,
      stemVocals ? { key: "vocals", url: stemVocals } : null,
      stemOther ? { key: "other", url: stemOther } : null,
    ].filter(Boolean) as Array<{ key: Exclude<ChannelKey, "source">; url: string }>;
    const hasCompleteStemSet = Boolean(compareMode === "mix" && stemsReady && stemSources.length === 4);
    let useStemBuffers = hasCompleteStemSet;

    const masterGain = context.createGain();
    const loudnessGain = context.createGain();
    const saturationInputGain = context.createGain();
    const saturationOutputGain = context.createGain();
    const analogFilter = context.createBiquadFilter();
    const softClipper = context.createWaveShaper();
    const compressor = context.createDynamicsCompressor();
    const limiter = context.createDynamicsCompressor();
    const masterAnalyser = context.createAnalyser();
    masterAnalyser.fftSize = 256;
    masterAnalyser.smoothingTimeConstant = 0.82;
    analogFilter.type = "lowshelf";
    analogFilter.frequency.value = 180;
    analogFilter.gain.value = 0;
    softClipper.curve = getSoftClipCurve(0);
    softClipper.oversample = "2x";
    masterGain.connect(loudnessGain);
    loudnessGain.connect(saturationInputGain);
    saturationInputGain.connect(analogFilter);
    analogFilter.connect(softClipper);
    softClipper.connect(saturationOutputGain);
    saturationOutputGain.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(masterAnalyser);
    masterAnalyser.connect(context.destination);

    const createLane = (
      key: ChannelKey,
      sharedSource = false
    ): RealtimeChannel => {
      const gain = context.createGain();
      const subFilter = context.createBiquadFilter();
      const punchFilter = context.createBiquadFilter();
      const warmthFilter = context.createBiquadFilter();
      const harshFilter = context.createBiquadFilter();
      const airFilter = context.createBiquadFilter();
      const drive = context.createWaveShaper();
      const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      subFilter.type = "lowshelf";
      subFilter.frequency.value = isStemChannel(key) && key !== "bass" ? 70 : 55;
      subFilter.gain.value = 0;
      punchFilter.type = "peaking";
      punchFilter.frequency.value = 105;
      punchFilter.Q.value = 1.15;
      punchFilter.gain.value = 0;
      warmthFilter.type = "lowshelf";
      warmthFilter.frequency.value = 240;
      warmthFilter.gain.value = 0;
      harshFilter.type = "peaking";
      harshFilter.frequency.value = 8400;
      harshFilter.Q.value = 2.4;
      harshFilter.gain.value = 0;
      airFilter.type = "highshelf";
      airFilter.frequency.value = 7800;
      airFilter.gain.value = 0;
      drive.curve = getDriveCurve(0);
      drive.oversample = "2x";

      gain.connect(subFilter);
      subFilter.connect(punchFilter);
      punchFilter.connect(warmthFilter);
      warmthFilter.connect(harshFilter);
      harshFilter.connect(airFilter);
      airFilter.connect(drive);
      if (panner) {
        drive.connect(panner);
        panner.connect(analyser);
      } else {
        drive.connect(analyser);
      }
      analyser.connect(masterGain);

      return {
        key,
        gain,
        subFilter,
        punchFilter,
        warmthFilter,
        harshFilter,
        airFilter,
        drive,
        panner,
        analyser,
        sharedSource,
      };
    };

    let channels: RealtimeChannel[] = [];
    if (hasCompleteStemSet) {
      const resolvedCacheKey = bufferCacheKey || sourceKey;
      const cached = stemBufferCache.get(resolvedCacheKey);
      let bufferEntry = cached || null;
      if (cached) {
        console.log("PRO GRAPH REUSE", {
          bufferCacheKey: resolvedCacheKey,
          stems: Object.keys(cached.buffers),
        });
        setBuffersReady(true);
        setIsLoadingStems(false);
      } else {
        console.log("PRO GRAPH CREATE", {
          bufferCacheKey: resolvedCacheKey,
          decodeStems: stemSources.map((stem) => stem.key),
        });
        setIsLoadingStems(true);
        setBuffersReady(false);
      }
      try {
        if (!bufferEntry) {
          const decodedPairs = await withTimeout(
            Promise.all(
              stemSources.map(async ({ key, url }) => ({
                key,
                buffer: await fetchAudioBuffer(context, url),
              }))
            ),
            STEM_LOAD_TIMEOUT_MS,
            "Stem engine load failed."
          );
          const buffers: Partial<Record<Exclude<ChannelKey, "source">, AudioBuffer>> = {};
          decodedPairs.forEach(({ key, buffer }) => {
            buffers[key] = buffer;
          });
          bufferEntry = {
            buffers,
            duration: Math.max(...decodedPairs.map((item) => item.buffer.duration), 0),
          };
          stemBufferCache.set(resolvedCacheKey, bufferEntry);
          setBuffersReady(true);
        }
        channels = stemSources
          .filter(({ key }) => Boolean(bufferEntry?.buffers[key]))
          .map(({ key }) => {
            const channel = createLane(key);
            channel.buffer = bufferEntry?.buffers[key];
            return channel;
          });
      } catch (loadError) {
        console.warn("Stem engine load failed. Stem-only routing could not start.", loadError);
        setError("Stem engine load failed. Reload or retry stems.");
        setBuffersReady(false);
        useStemBuffers = true;
        channels = [];
      } finally {
        setIsLoadingStems(false);
      }
    }

    if (!useStemBuffers) {
      channels = sourceUrl
        ? (() => {
            const element = createAudioElement(sourceUrl);
            const source = context.createMediaElementSource(element);
            return (["drums", "bass", "vocals", "other"] as ChannelKey[]).map((key) => {
              const channel = createLane(key, true);
              channel.element = element;
              channel.source = source;
              source.connect(channel.gain);
              return channel;
            });
          })()
        : [];
    }

    if (buildId !== buildSerialRef.current) {
      channels.forEach((channel) => {
        channel.gain.disconnect();
        channel.subFilter.disconnect();
        channel.punchFilter.disconnect();
        channel.warmthFilter.disconnect();
        channel.harshFilter.disconnect();
        channel.airFilter.disconnect();
        channel.drive.disconnect();
        channel.panner?.disconnect();
        channel.analyser.disconnect();
        channel.source?.disconnect();
        channel.element?.pause();
      });
      return null;
    }

    const graph: RealtimeGraph = {
      key: sourceKey,
      context,
      masterGain,
      loudnessGain,
      saturationInputGain,
      saturationOutputGain,
      analogFilter,
      softClipper,
      compressor,
      limiter,
      masterAnalyser,
      channels,
      usingStems: useStemBuffers,
      isBufferMode: useStemBuffers,
      compareMode,
      startedAt: 0,
      startOffset: 0,
      playbackRate: 1,
      duration: useStemBuffers
        ? Math.max(...channels.map((channel) => channel.buffer?.duration || 0), 0)
        : 0,
    };

    if (useStemBuffers) {
      setDuration(graph.duration);
    }

    const primary = channels[0]?.element;
    if (primary) {
      const updateDuration = () => setDuration(Number.isFinite(primary.duration) ? primary.duration : 0);
      const handleEnded = () => {
        console.log("PRO STEM ENDED", {
          usingStems: hasCompleteStemSet,
          compareMode,
          currentTime: primary.currentTime,
          duration: Number.isFinite(primary.duration) ? primary.duration : null,
        });
        stopRaf();
        endedRef.current = true;
        setPlaying(false);
        currentTimeRef.current = Number.isFinite(primary.duration) ? primary.duration : primary.currentTime || 0;
        setCurrentTimeState(currentTimeRef.current);
        new Set(channels.map((channel) => channel.element).filter(Boolean) as HTMLAudioElement[]).forEach((element) => {
          element.pause();
        });
      };
      primary.addEventListener("loadedmetadata", updateDuration, { once: false });
      primary.addEventListener("durationchange", updateDuration, { once: false });
      primary.addEventListener("ended", handleEnded, { once: false });
    }

    graphRef.current = graph;
    setUsingStems(useStemBuffers);
    setIsReady(channels.length > 0);
    applyControls(graph);
    console.log("REALTIME GRAPH CREATED", {
      sourceKey,
      usingStems: hasCompleteStemSet,
      bufferMode: useStemBuffers,
      compareMode,
      channels: channels.map((channel) => channel.key),
    });
    console.log(useStemBuffers ? "PRO ROUTING MODE: STEM_ONLY" : "PRO ROUTING MODE: STEREO_FALLBACK", {
      compareMode,
      stemCount: stemSources.length,
      channels: channels.map((channel) => channel.key),
      sourceUrlConnected: !useStemBuffers && Boolean(sourceUrl),
    });
    console.log(
      useStemBuffers ? "REALTIME STEM ROUTING ACTIVE" : "REALTIME FALLBACK ROUTING ACTIVE",
      {
        sourceUrl: sourceUrl || null,
        stems: {
          drums: Boolean(stemDrums),
          bass: Boolean(stemBass),
          vocals: Boolean(stemVocals),
          other: Boolean(stemOther),
        },
      }
    );
    console.log("REALTIME AUDIO CONNECTED", {
      route: hasCompleteStemSet
        ? "AudioBufferSourceNode -> stem gain/filter lanes -> master gain -> destination"
        : "HTMLAudioElement -> MediaElementAudioSourceNode -> gain/filter lanes -> master gain -> destination",
      directNativeAudioElement: false,
      sharedFallbackSource: !useStemBuffers,
      compareMode,
    });
    return graph;
  }, [
    applyControls,
    cleanupGraph,
    getAudioContext,
    sourceKey,
    sourceUrl,
    stemBass,
    stemDrums,
    stemOther,
    stemVocals,
    stemsReady,
    bufferCacheKey,
    compareMode,
    stopRaf,
  ]);

  const startRaf = useCallback(() => {
    stopRaf();
    const tick = () => {
      const graph = graphRef.current;
      const primary = graph?.channels[0]?.element;
      if (graph?.isBufferMode) {
        const nextTime = graph.startOffset + Math.max(0, graph.context.currentTime - graph.startedAt) * graph.playbackRate;
        const safeTime = Math.min(nextTime, graph.duration || nextTime);
        currentTimeRef.current = safeTime;
        setCurrentTimeState(safeTime);
        if (graph.duration) setDuration(graph.duration);
        if (graph.duration && safeTime >= graph.duration - 0.02) {
          console.log("PRO STEM ENDED", {
            usingStems: true,
            compareMode: graph.compareMode,
            currentTime: safeTime,
            duration: graph.duration,
          });
          stopBufferSources(graph);
          stopRaf();
          endedRef.current = true;
          setPlaying(false);
          currentTimeRef.current = graph.duration;
          setCurrentTimeState(graph.duration);
          return;
        }
      } else if (primary) {
        currentTimeRef.current = primary.currentTime || 0;
        setCurrentTimeState(currentTimeRef.current);
        if (Number.isFinite(primary.duration)) setDuration(primary.duration);
        if (graph?.usingStems && performance.now() - lastDriftCorrectionRef.current > 1500) {
          new Set(graph.channels.map((channel) => channel.element).filter(Boolean) as HTMLAudioElement[]).forEach((element) => {
            const drift = Math.abs(element.currentTime - primary.currentTime);
            if (element !== primary && !element.paused && drift > 0.35) {
              console.log("PRO STEM DRIFT CORRECTED", {
                drift,
                from: element.currentTime,
                to: primary.currentTime,
              });
              element.currentTime = primary.currentTime;
              lastDriftCorrectionRef.current = performance.now();
            }
          });
        }
      }
      if (graph) {
        const nextLevels = createEmptyLevels();
        graph.channels.forEach((channel) => {
          const level = readAnalyserLevel(channel.analyser);
          if (channel.key === "drums") nextLevels.drums = Math.max(nextLevels.drums, level);
          if (channel.key === "bass") nextLevels.bass = Math.max(nextLevels.bass, level);
          if (channel.key === "vocals") nextLevels.vocals = Math.max(nextLevels.vocals, level);
          if (channel.key === "other") {
            nextLevels.music = Math.max(nextLevels.music, level);
            nextLevels.fx = Math.max(nextLevels.fx, level * gainFromPercent(controlsRef.current.fx ?? 50));
          }
        });
        if (!graph.usingStems) {
          const fallbackLevel = Math.max(
            nextLevels.drums,
            nextLevels.bass,
            nextLevels.vocals,
            nextLevels.music
          );
          nextLevels.drums = fallbackLevel * gainFromPercent(controlsRef.current.drums);
          nextLevels.bass = fallbackLevel * gainFromPercent(controlsRef.current.bass);
          nextLevels.vocals = fallbackLevel * gainFromPercent(controlsRef.current.vocal);
          nextLevels.music = fallbackLevel * gainFromPercent(controlsRef.current.music);
          nextLevels.fx = fallbackLevel * gainFromPercent(controlsRef.current.fx ?? 50);
        }
        nextLevels.master = readAnalyserLevel(graph.masterAnalyser);

        const previous = levelsRef.current;
        const smoothed = {
          drums: smoothLevel(previous.drums, clamp(nextLevels.drums, 0, 1)),
          bass: smoothLevel(previous.bass, clamp(nextLevels.bass, 0, 1)),
          vocals: smoothLevel(previous.vocals, clamp(nextLevels.vocals, 0, 1)),
          music: smoothLevel(previous.music, clamp(nextLevels.music, 0, 1)),
          fx: smoothLevel(previous.fx, clamp(nextLevels.fx, 0, 1)),
          master: smoothLevel(previous.master, clamp(nextLevels.master, 0, 1)),
        };
        levelsRef.current = smoothed;
        setLevels(smoothed);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
  }, [stopBufferSources, stopRaf]);

  const pause = useCallback(() => {
    if (graphRef.current) {
      console.log("PRO STEM PAUSE", {
        usingStems: graphRef.current.usingStems,
        compareMode: graphRef.current.compareMode,
        currentTime: currentTimeRef.current,
      });
      if (graphRef.current.isBufferMode) {
        const elapsed = Math.max(0, graphRef.current.context.currentTime - graphRef.current.startedAt);
        currentTimeRef.current = Math.min(
          graphRef.current.duration,
          graphRef.current.startOffset + elapsed * graphRef.current.playbackRate
        );
        setCurrentTimeState(currentTimeRef.current);
        stopBufferSources(graphRef.current);
      } else {
        new Set(graphRef.current.channels.map((channel) => channel.element).filter(Boolean) as HTMLAudioElement[]).forEach((element) =>
          element.pause()
        );
      }
    }
    stopRaf();
    setPlaying(false);
    levelsRef.current = createEmptyLevels();
    setLevels(levelsRef.current);
  }, [stopBufferSources, stopRaf]);

  const seek = useCallback((nextTime: number) => {
    const graph = graphRef.current;
    const maxDuration = duration || graph?.duration || graph?.channels[0]?.element?.duration || 0;
    const safeTime = Math.max(0, maxDuration ? Math.min(nextTime, maxDuration) : nextTime);
    console.log("PRO STEM SEEK", {
      requestedTime: nextTime,
      safeTime,
      usingStems: graph?.usingStems || false,
    });
    endedRef.current = false;
    currentTimeRef.current = safeTime;
    setCurrentTimeState(safeTime);
    if (graph?.isBufferMode) {
      const wasPlaying = playing;
      stopBufferSources(graph);
      graph.startOffset = safeTime;
      graph.startedAt = graph.context.currentTime;
      if (wasPlaying) {
        startBufferSources(graph, safeTime);
      }
    } else {
      new Set((graph?.channels.map((channel) => channel.element).filter(Boolean) as HTMLAudioElement[]) || []).forEach((element) => {
        element.currentTime = safeTime;
      });
    }
  }, [duration, playing, startBufferSources, stopBufferSources]);

  const play = useCallback(async () => {
    let graph = graphRef.current;
    if (!graph || graph.key !== sourceKey) {
      if (!buildPromiseRef.current) {
        buildPromiseRef.current = buildGraph().finally(() => {
          buildPromiseRef.current = null;
        });
      }
      graph = await buildPromiseRef.current;
    }
    if (!graph || graph.channels.length === 0) return;

    try {
      if (graph.context.state === "suspended") {
        await graph.context.resume();
      }
      applyControls(graph);
      if (endedRef.current || (duration > 0 && currentTimeRef.current >= duration - 0.05)) {
        currentTimeRef.current = 0;
        setCurrentTimeState(0);
        endedRef.current = false;
      }
      if (graph.isBufferMode) {
        startBufferSources(graph, currentTimeRef.current);
      } else {
        const elements = new Set(graph.channels.map((channel) => channel.element).filter(Boolean) as HTMLAudioElement[]);
        elements.forEach((element) => {
          element.currentTime = currentTimeRef.current;
        });
        console.log("PRO STEM PLAY START", {
          usingStems: graph.usingStems,
          compareMode: graph.compareMode,
          currentTime: currentTimeRef.current,
          elements: elements.size,
        });
        await Promise.all([...elements].map((element) => element.play()));
      }
      setPlaying(true);
      startRaf();
    } catch (playError: any) {
      setPlaying(false);
      stopRaf();
      const message = playError?.message || "Could not start realtime playback.";
      setError(message);
      throw new Error(message);
    }
  }, [applyControls, buildGraph, duration, sourceKey, startBufferSources, startRaf, stopRaf]);

  const toggle = useCallback(async () => {
    if (playing) {
      pause();
      return;
    }
    await play();
  }, [pause, play, playing]);

  useEffect(() => {
    const sourceChanged = previousSourceUrlRef.current !== (sourceUrl || null);
    previousSourceUrlRef.current = sourceUrl || null;
    if (graphRef.current) {
      console.log("PRO MODE SWITCH CLEANUP", {
        fromKey: graphRef.current.key,
        nextKey: sourceKey,
        compareMode,
      });
    }
    buildSerialRef.current += 1;
    buildPromiseRef.current = null;
    cleanupGraph(false);
    if (sourceChanged) {
      currentTimeRef.current = 0;
      setCurrentTimeState(0);
      setDuration(0);
    }
    endedRef.current = false;
    setError(null);
    setIsReady(Boolean(sourceKey));
    setUsingStems(sourceKey.startsWith("stems|") && compareMode === "mix");
  }, [cleanupGraph, compareMode, sourceKey, sourceUrl]);

  useEffect(() => {
    controlsRef.current = controls;
    applyControls();
  }, [applyControls, controls]);

  useEffect(() => {
    return () => cleanupGraph(true);
  }, [cleanupGraph]);

  return {
    isReady,
    isRealtimeActive: isReady && Boolean(sourceUrl),
    usingStems,
    compareMode,
    playing,
    currentTime,
    duration,
    progress: duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0,
    error,
    isLoadingStems,
    buffersReady,
    levels,
    play,
    pause,
    toggle,
    seek,
  };
}
