export const AUDIO_MOOD_TAGS = [
  'upbeat',
  'triumphant',
  'tension',
  'suspenseful',
  'sad',
  'heartfelt',
  'comedic',
  'chill-ambient',
  'epic-cinematic',
  'romantic',
  'mysterious',
  'motivational',
] as const;

export const SFX_MOMENT_TAGS = [
  'riser-buildup',
  'whoosh-transition',
  'impact-hit',
  'comedic-beat',
  'pop-ui',
  'reveal-sting',
  'notification-ding',
  'glitch-error',
  'camera-shutter',
  'clock-tick',
] as const;

export type AudioMoodTag = (typeof AUDIO_MOOD_TAGS)[number];
export type SfxMomentTag = (typeof SFX_MOMENT_TAGS)[number];
export const ALL_AUDIO_TAGS = [...AUDIO_MOOD_TAGS, ...SFX_MOMENT_TAGS];

const SFX_FILENAME_PATTERNS: [RegExp, SfxMomentTag][] = [
  [/woosh|swoosh/i, 'whoosh-transition'],
  [/riser|build.?up/i, 'riser-buildup'],
  [/impact|punch|explosion|fight|hit/i, 'impact-hit'],
  [/laugh/i, 'comedic-beat'],
  [/ding|pop|click/i, 'notification-ding'],
  [/camera|shutter/i, 'camera-shutter'],
  [/glitch|error/i, 'glitch-error'],
  [/clock|tick/i, 'clock-tick'],
  [/cash|coin|reveal|sting/i, 'reveal-sting'],
];

/** Filename-keyword based SFX tagging — cheap, no API call, reasonably reliable since SFX
 * libraries are typically named after their sound (unlike music, whose titles rarely
 * describe mood — those get classified by Gemini instead, see musicLibrary.ts). */
export function tagSfxByFilename(fileName: string): SfxMomentTag[] {
  const tags: SfxMomentTag[] = [];
  for (const [pattern, tag] of SFX_FILENAME_PATTERNS) {
    if (pattern.test(fileName)) tags.push(tag);
  }
  return tags;
}
