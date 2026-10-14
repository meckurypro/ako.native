// src/lib/audioClip.ts
//
// Native port of web's lib/audioClip.ts — supports the catalogue "pick the best 30 seconds"
// selector. Two jobs, same as web:
//
//  1. Decode the source audio ONCE and compute a REAL waveform over the full track (never faked),
//     so the selector can show accurate peaks under a draggable window.
//  2. At confirm time, slice the decoded buffer to the selected window, downmix to mono and encode
//     it as its own small 16-bit PCM WAV — a genuine derived asset. That file is what gets uploaded
//     to the public 'music-catalogue' bucket; the private original is never exposed.
//
// Differences from web: there is no browser Web Audio here, so decoding goes through
// react-native-audio-api (same decodeAudioData/AudioBuffer shape), and the WAV is written to the
// cache directory and handed back as a LocalFile (the upload hooks take file URIs, not Blobs).
//
// The native module is loaded lazily: a dev client built before the dependency was added just gets
// a clear error in the clip step instead of failing at app start.
import { File, Paths } from "expo-file-system";

import type { LocalFile } from "@/lib/localFile";

/** The slice of AudioBuffer this file uses (matches both react-native-audio-api and the web type). */
export interface DecodedBuffer {
  readonly length: number;
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface DecodedAudio {
  buffer: DecodedBuffer;
  durationSeconds: number;
}

const UNAVAILABLE = "Clip selection isn't available in this version of the app yet. Update the app and try again.";

/** Decodes a track from a URL (or file path). The decoder fetches and decodes natively. */
export async function decodeAudioFile(source: string): Promise<DecodedAudio> {
  let decode: (input: string) => Promise<DecodedBuffer>;
  try {
    ({ decodeAudioData: decode } = await import("react-native-audio-api"));
  } catch {
    throw new Error(UNAVAILABLE);
  }
  const buffer = await decode(source);
  return { buffer, durationSeconds: buffer.duration };
}

/**
 * Peak-amplitude bars across the ENTIRE decoded buffer — drawn once, with a selection window moved
 * over them. Loudest sample per slice (strided read), normalised 0..1 with a small floor.
 */
export function computeBufferPeaks(buffer: DecodedBuffer, barCount = 160): number[] {
  const { numberOfChannels: channels, length } = buffer;
  const samplesPerBar = Math.max(1, Math.floor(length / barCount));
  const peaks: number[] = [];

  for (let bar = 0; bar < barCount; bar++) {
    const start = bar * samplesPerBar;
    const end = Math.min(length, start + samplesPerBar);
    let peak = 0;
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < end; i += 4) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    peaks.push(peak);
  }

  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => Math.max(0.08, Math.min(1, p / max)));
}

/**
 * Slices [startSeconds, startSeconds + durationSeconds) out of the decoded buffer, downmixes to
 * mono, encodes 16-bit PCM WAV, and writes it to the cache dir. Returns it as an uploadable LocalFile.
 */
export function sliceAndEncodeWav(buffer: DecodedBuffer, startSeconds: number, durationSeconds: number): LocalFile {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSeconds * sampleRate));
  const sampleCount = Math.min(buffer.length - startSample, Math.round(durationSeconds * sampleRate));
  if (sampleCount <= 0) {
    throw new Error("Selected clip range is empty");
  }

  // Downmix to mono by averaging channels.
  const mono = new Float32Array(sampleCount);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < sampleCount; i++) {
      mono[i] += data[startSample + i] / buffer.numberOfChannels;
    }
  }

  const bytes = encodeMonoPcmWav(mono, sampleRate);
  const name = `ako-clip-${Date.now()}.wav`;
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(bytes);
  return { uri: file.uri, name, type: "audio/wav", size: bytes.byteLength };
}

function encodeMonoPcmWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(arrayBuffer);
}

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
