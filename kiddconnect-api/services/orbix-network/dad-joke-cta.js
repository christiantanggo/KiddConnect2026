/**
 * Rotating CTA lines for Orbix Dad Joke channel.
 * Same index (e.g. episode_number) must be used for description, on-video text, and pinned comment so they match.
 */

export const DAD_JOKE_CTA_OPTIONS = [
  'Rate this dad joke 1-10',
  'Be honest... Was this funny?',
  'How bad was this dad joke? 1=terrible 10=legendary',
  'Did this joke make you laugh? Y=Yes N=No',
];

/**
 * Get the CTA line for a given index (e.g. episode_number). Rotates through the 4 options.
 * @param {number} index - Episode number or any integer (use same value for description, render, and comment)
 * @returns {string}
 */
export function getDadJokeCta(index) {
  const i = Number(index);
  const idx = (isNaN(i) || i < 0 ? 0 : Math.floor(i)) % DAD_JOKE_CTA_OPTIONS.length;
  return DAD_JOKE_CTA_OPTIONS[idx];
}
