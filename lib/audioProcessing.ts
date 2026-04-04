"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type ProcessingCallbacks = {
  onStatus?: (value: string) => void;
  onProgress?: (value: number | null) => void;
};

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let currentStatusCallback: ((value: string) => void) | null = null;
let currentProgressCallback: ((value: number | null) => void) | null = null;

function sanitizeBaseName(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toArrayBuffer(data: Uint8Array | ArrayBuffer | string): ArrayBuffer {
  if (data instanceof Uint8Array) {
    return data.slice().buffer;
  }

  if (data instanceof ArrayBuffer) {
    return data.slice(0);
  }

  return new TextEncoder().encode(data).buffer;
}

function setCallbacks(callbacks?: ProcessingCallbacks) {
  currentStatusCallback = callbacks?.onStatus ?? null;
  currentProgressCallback = callbacks?.onProgress ?? null;
}

export function shouldCompressToMp3(file: File) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  return (
    type.includes("wav") ||
    type.includes("wave") ||
    type.includes("aiff") ||
    type.includes("flac") ||
    name.endsWith(".wav") ||
    name.endsWith(".wave") ||
    name.endsWith(".aif") ||
    name.endsWith(".aiff") ||
    name.endsWith(".flac")
  );
}

async function getFfmpeg(callbacks?: ProcessingCallbacks) {
  if (ffmpegSingleton) {
    setCallbacks(callbacks);
    return ffmpegSingleton;
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpeg = new FFmpeg();

      ffmpeg.on("log", ({ message }) => {
        if (message && currentStatusCallback) {
          currentStatusCallback(message);
        }
      });

      ffmpeg.on("progress", ({ progress }) => {
        if (!currentProgressCallback) return;

        const percent = Math.max(
          0,
          Math.min(100, Math.round((progress || 0) * 100))
        );

        currentProgressCallback(percent);

        if (currentStatusCallback) {
          currentStatusCallback(`Compressing audio... ${percent}%`);
        }
      });

      const baseURL =
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });

      ffmpegSingleton = ffmpeg;
      return ffmpeg;
    })();
  }

  setCallbacks(callbacks);
  return ffmpegLoadPromise;
}

async function compressAudioToMp3(inputFile: File, callbacks?: ProcessingCallbacks) {
  setCallbacks(callbacks);

  const ffmpeg = await getFfmpeg(callbacks);
  const safeBaseName = sanitizeBaseName(inputFile.name) || "track";
  const inputExt = inputFile.name.split(".").pop()?.toLowerCase() || "wav";
  const inputName = `input.${inputExt}`;
  const outputName = `${safeBaseName}.mp3`;

  currentStatusCallback?.("Preparing audio engine...");
  currentProgressCallback?.(0);

  await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

  currentStatusCallback?.("Converting to MP3 192 kbps...");

  await ffmpeg.exec([
    "-i",
    inputName,
    "-vn",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-b:a",
    "192k",
    outputName,
  ]);

  const outputData = await ffmpeg.readFile(outputName);
  const outputBuffer = toArrayBuffer(outputData);

  try {
    await ffmpeg.deleteFile(inputName);
  } catch {}

  try {
    await ffmpeg.deleteFile(outputName);
  } catch {}

  currentProgressCallback?.(100);
  currentStatusCallback?.("Compression finished.");

  currentProgressCallback = null;

  return new File([outputBuffer], outputName, {
    type: "audio/mpeg",
    lastModified: Date.now(),
  });
}

export async function prepareTrackAudioFile(
  inputFile: File,
  callbacks?: ProcessingCallbacks
) {
  if (!shouldCompressToMp3(inputFile)) {
    return inputFile;
  }

  return compressAudioToMp3(inputFile, callbacks);
}
