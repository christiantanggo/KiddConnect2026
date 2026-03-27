/**
 * Strip section headers, labels, and stage-direction brackets from dad joke long-form scripts
 * so TTS does not read them aloud. Used by the renderer and by the "Rewrite for voice" API.
 */

/** Banner-style section headers (e.g. "=== COLD OPEN ===" or "=== ACT 1 – SETUP ==="); remove entire lines. */
const BANNER_HEADER = /^\s*={2,}\s*.+\s*={2,}\s*$/;

/** Structural labels that must not be read aloud; remove lines that are only these. */
const STRUCTURAL_LABEL_PATTERNS = [
  /^Act\s*[123]\s*[–\-:]?\s*(Setup|Escalation|Chaos|Absurd\s+Chaos)?\s*$/i,
  /^Cold\s+Open(\s+Joke)?\s*$/i,
  /^Story\s+Introduction\s*$/i,
  /^Peak\s+Chaos(\s+Moment)?\s*$/i,
  /^Final\s+Reset\s*$/i,
  /^Final\s+(Dad\s+)?Joke\s*$/i,
  /^Closing\s+Call\s+to\s+Action\s*$/i,
  /^Escalation\s*$/i,
  /^Setup\s*$/i,
  /^Chaos\s*$/i,
  /^Outro\s+CTA\s*$/i,
  /^Beat\s*$/i,
  /^Pause\s*$/i,
];

/** Regex to strip structural prefixes at start of a line (e.g. "Act 2 – Escalation. " or "Cold open: "). */
const STRUCTURAL_PREFIX = /^\s*(Act\s*[123]\s*[–\-:]?\s*(Setup|Escalation|Chaos|Absurd\s+Chaos)?\s*[\.:]\s*|Cold\s+Open(\s+Joke)?\s*[\.:]\s*|Story\s+Introduction\s*[\.:]\s*|Peak\s+Chaos(\s+Moment)?\s*[\.:]\s*|Final\s+Reset\s*[\.:]\s*|Final\s+(Dad\s+)?Joke\s*[\.:]\s*|Closing\s+Call\s+to\s+Action\s*[\.:]\s*|Escalation\s*[\.:]\s*)/i;

/**
 * Strip section headers and stage-direction brackets so TTS does not read them aloud.
 * Removes: [beat], [pause], [sigh], [looks around], line-leading labels (Cold Open, Act 1, etc.),
 * and lines that are only structural labels (e.g. "Beat", "Act 2 – Escalation").
 * @param {string} script - full_script from script_json
 * @returns {string} Script safe for TTS / for display as "voice-only"
 */
export function sanitizeScriptForTTS(script) {
  if (!script || typeof script !== 'string') return '';
  let out = script
    .replace(/\[\s*beat\s*\]/gi, ' ')
    .replace(/\[\s*pause\s*\]/gi, ' ')
    .replace(/\[\s*sigh\s*\]/gi, ' ')
    .replace(/\[\s*looks\s+around\s*\]/gi, ' ');
  const lines = out.split(/\r?\n/);
  const kept = lines.map((line) => {
    let t = line.trim();
    t = t.replace(STRUCTURAL_PREFIX, '').trim();
    return t;
  }).filter((line) => {
    if (!line) return true;
    if (BANNER_HEADER.test(line)) return false;
    const isLabel = STRUCTURAL_LABEL_PATTERNS.some((p) => p.test(line));
    return !isLabel;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
