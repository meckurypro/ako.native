// src/lib/waveform.ts
// Waveform bars for voice notes. The web build decoded the finished recording
// with Web Audio to find its peaks. Native doesn't need to: the recorder
// already reports a metering level (dB) while it records, so the bars are just
// those samples bucketed down to a fixed count — no decoding, instant preview.
export const WAVEFORM_BAR_COUNT = 40;

const DB_FLOOR = -50; // anything quieter than this renders as the minimum bar

/** Map a metering reading in dB (−160…0) to a 0…1 bar height. */
export function dbToLevel(db: number | undefined | null): number {
  if (db == null || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - DB_FLOOR) / -DB_FLOOR));
}

/** Bucket metering samples (dB) into `barCount` bars, each the loudest sample in its bucket. */
export function peaksFromMetering(samplesDb: number[], barCount: number = WAVEFORM_BAR_COUNT): number[] {
  if (samplesDb.length === 0) return Array(barCount).fill(0.08);
  const peaks: number[] = [];
  const bucket = samplesDb.length / barCount;
  for (let i = 0; i < barCount; i++) {
    const from = Math.floor(i * bucket);
    const to = Math.max(from + 1, Math.floor((i + 1) * bucket));
    let max = 0;
    for (let j = from; j < to && j < samplesDb.length; j++) max = Math.max(max, dbToLevel(samplesDb[j]));
    peaks.push(Math.max(0.08, Math.min(1, max)));
  }
  return peaks;
}

/** Placeholder bars for older voice notes sent without stored peaks. */
export function flatPeaks(barCount: number = WAVEFORM_BAR_COUNT): number[] {
  return Array(barCount).fill(0.3);
}
