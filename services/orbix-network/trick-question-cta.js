/**
 * Rotating CTA lines for Orbix Trick Question channel.
 * Same index (e.g. episode_number) must be used for description, on-video text, and pinned comment so they match.
 */

export const TRICK_QUESTION_CTA_OPTIONS = [
  'Did you fall for it? Comment below',
  'How many got this wrong? 1–10',
  'Did you guess before the reveal?',
  'Trick questions every week — follow for more',
];

/**
 * Get the CTA line for a given index (e.g. episode_number).
 * @param {number} index - Episode number or any integer
 * @returns {string}
 */
export function getTrickQuestionCta(index) {
  const i = Number(index);
  const idx = (isNaN(i) || i < 0 ? 0 : Math.floor(i)) % TRICK_QUESTION_CTA_OPTIONS.length;
  return TRICK_QUESTION_CTA_OPTIONS[idx];
}
