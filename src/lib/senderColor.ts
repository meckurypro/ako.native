// src/lib/senderColor.ts
// One stable hue per person, so the same sender is the same colour in every group, every session. The set is
// hand-picked (no muddy yellows, nothing that fights the sage accent) and the CSS in index.css (.sender-name)
// turns the hue into a readable light-mode / dark-mode colour.
const HUES = [8, 22, 36, 195, 212, 232, 262, 286, 318, 340, 172, 352];

export function senderHue(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}
