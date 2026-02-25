/**
 * Orbix Facts — generate one interesting fact using OpenAI GPT.
 * Replaces Wikidata (403 blocked) and Numbers API (timeout from Railway).
 * No external HTTP calls to third-party fact APIs — uses OpenAI which is
 * already authenticated and working for all other channels.
 */

import crypto from 'crypto';

const FACT_TOPICS = [
  'space and astronomy', 'human biology', 'ancient history', 'world records',
  'animals and nature', 'geography', 'inventions and technology', 'food and science',
  'mathematics', 'oceans and deep sea', 'psychology and the brain', 'economics',
  'famous historical events', 'engineering marvels', 'languages and linguistics'
];

/**
 * Generate one surprising, short fact using GPT.
 * @returns {Promise<{ title: string, fact_text: string, tts_script: string, entity_id: string, content_fingerprint: string, property_id: string }|null>}
 */
export async function fetchOneFact() {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const topic = FACT_TOPICS[Math.floor(Math.random() * FACT_TOPICS.length)];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You generate single surprising, specific, verifiable facts for short-form video. Each fact must:
- Be genuinely surprising or counterintuitive
- Be one sentence, 15–25 words
- Include a specific number, date, or name when possible
- Be suitable for a general audience
- NOT be a question — state it as a fact
Return JSON only: { "title": "short subject (2-4 words)", "fact": "the one-sentence fact" }`
      },
      {
        role: 'user',
        content: `Generate one surprising fact about: ${topic}`
      }
    ],
    temperature: 1.0,
    max_tokens: 120,
    response_format: { type: 'json_object' }
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  const factText = (parsed.fact || '').trim();
  const title = (parsed.title || topic).trim();

  if (!factText || factText.length < 15) return null;

  const fingerprintInput = `${topic}|${factText}`;
  const content_fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex').slice(0, 32);

  return {
    title,
    fact_text: factText,
    tts_script: factText,
    entity_id: `gpt-fact-${Date.now()}`,
    content_fingerprint,
    property_id: 'gpt-generated'
  };
}

/**
 * Legacy export — kept so scraper.js import doesn't break.
 */
export function parseFactsSourceUrl() {
  return { entityIds: [], preferredProperty: undefined };
}
