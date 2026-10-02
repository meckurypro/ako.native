// src/lib/audioClip.ts
//
// Supports the catalogue "60-second clip" selector (see
// done/AKO_MUSIC_CATALOGUE_AND_CREATOR_DISCOVERY_SYSTEM.md §8). Two
// jobs, deliberately kept separate from src/lib/waveform.ts:
//
//  1. Decode the source audio once and compute a REAL waveform over
//     the FULL track (not faked), so the selector can show accurate
//     peaks under a draggable up-to-60s window without re-decoding
//     on every drag.
//  2. At confirm time, slice the decoded buffer to the selected
//     window and encode it as its own small WAV file — a genuine
//     derived asset, not a pointer into the private original. This
//     is what actually gets uploaded to the public 'music-catalogue'
//     bucket; the private Project audio in 'private-content' is
//     never exposed (§20 of the same spec).
//
// Downmixed to mono at the source sample rate on export — no
// resampling library, just a lighter file for Feed playback (§21
// "Feed performance" in the UX audit) than a full-quality stereo WAV
// would be.

export interface DecodedAudio {
  buffer: AudioBuffer;
  durationSeconds: number;
}

export async function decodeAudioFile(blob: Blob): Promise<DecodedAudio> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  try {
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    return { buffer, durationSeconds: buffer.duration };
  } finally {
    audioCtx.close().catch(() => {});
  }
}

/**
 * Peak-amplitude bars across the ENTIRE decoded buffer — the
 * selector draws these once and moves a selection window over them,
 * rather than recomputing on every drag. Same peak-picking approach
 * as computeWaveformPeaks in waveform.ts (loudest sample per slice,
 * strided read, normalized 0..1 with a small floor).
 */
export function computeBufferPeaks(buffer: AudioBuffer, barCount = 160): number[] {
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
 * Slices [startSeconds, startSeconds + durationSeconds) out of the
 * decoded buffer, downmixes to mono, and encodes it as a 16-bit PCM
 * WAV Blob — the real derived clip that gets uploaded, matching the
 * "do not fake the waveform" / "do not expose the original" rules in
 * the product spec.
 */
export function sliceAndEncodeWav(buffer: AudioBuffer, startSeconds: number, durationSeconds: number): Blob {
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

  return encodeMonoPcmWav(mono, sampleRate);
}

function encodeMonoPcmWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
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

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
