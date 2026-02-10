/**
 * Orbix Network Script Generator Service
 * Generates video scripts from classified stories
 */

import OpenAI from 'openai';
import { supabaseClient } from '../../config/database.js';

// Lazy OpenAI client initialization
let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
  }
  return openaiClient;
}

/**
 * Generate script for a story
 * @param {Object} story - Story object from database
 * @param {Object} rawItem - Raw item data
 * @returns {Promise<Object>} Script object
 */
export async function generateScript(story, rawItem) {
  const startTime = Date.now();
  console.log(`[Script Generator] ========== generateScript START ==========`);
  console.log(`[Script Generator] Story ID: ${story.id}, Raw Item ID: ${rawItem?.id}`);
  const isPsychology = story.category === 'psychology';
  const isMoney = story.category === 'money';

  try {
    console.log(`[Script Generator] Step 1: Building prompts... (psychology=${isPsychology}, money=${isMoney})`);
    let systemPrompt;
    let userPrompt;
    if (isPsychology) {
      systemPrompt = `You are a script writer for short-form psychology videos. Write like you're talking to one person, not a group. Psychology scripts only—follow these rules:

HOOK (max 10 words):
- Directly address the viewer. Use "you" or "your brain".
- Slightly urgent or confrontational. Prefer strong verbs: "hides", "ignores", "decides", "misses", "lies", "skips".
- Bad: "Ever wonder why surveys can be tricky?"
- Good: "Your brain hides this from you." or "Your brain ignores what actually matters."

BODY (what_happened):
- Simple, everyday language. Frame as something the brain does automatically.
- Short, conversational sentences. No academic wording.

WHY IT MATTERS (one short sentence):
- Focus on visible behavior or decisions, not internal confusion. Emphasize repeated choices, actions, or patterns the viewer recognizes in themselves.
- No research or academic phrasing.

CALL TO ACTION (what_happens_next):
- End with a question that invites comments or self-reflection.

General:
- Total length 30–45 words for the whole script. Do not increase length.
- No medical or diagnostic language. Do not sound like a lesson or article.`;

      userPrompt = `Write a YouTube Shorts script about this psychology concept.

Concept: ${rawItem?.title || story.title || 'Psychology concept'}
Source summary: ${(rawItem?.snippet || '').slice(0, 800)}

Return JSON with:
{
  "hook": "<direct, urgent or confrontational, use verbs like hides/ignores/decides/misses, max 10 words>",
  "what_happened": "<simple everyday language, brain does this automatically, short sentences>",
  "why_it_matters": "<one short sentence: visible behavior or decisions—repeated choices, actions, or patterns the viewer recognizes>",
  "what_happens_next": "<question that invites comments or self-reflection>",
  "cta_line": "",
  "duration_target_seconds": 35
}`;
    } else if (isMoney) {
      systemPrompt = `You are a script writer for short-form money/wealth behavior videos. Write like you're talking to one person. Tone: practical, relatable, non-judgmental. No financial advice or guarantees. Focus on behavior, habits, and common mistakes.

HOOK (max 10 words):
- Short, calm hook-style. Speak directly to the viewer ("you", "your money").
- No emojis, no clickbait, no dollar amounts or promises.
- Examples: "Why money decisions feel harder than they should." "Your brain treats money differently than time."

BODY (what_happened):
- Simple, everyday language. Use "often", "tends to", "many people", "over time".
- Avoid advice like "you should invest" or "do this to get rich". No income promises or results.
- Frame around: spending habits, inflation effects, lifestyle creep, compound interest behavior, emotional money decisions.

WHY IT MATTERS (one short sentence):
- Reinforce the idea in plain language. No financial advice. No promises.

CALL TO ACTION (what_happens_next):
- End with a soft question or reflection (e.g. "What do you think?").

General:
- Total length 30–45 words for the whole script. Same structure as psychology: Hook, What Happened, Why It Matters, What Happens Next.`;

      userPrompt = `Write a YouTube Shorts script about this money/wealth concept.

Concept: ${rawItem?.title || story.title || 'Money concept'}
Source summary: ${(rawItem?.snippet || '').slice(0, 800)}

Return JSON with:
{
  "hook": "<short calm hook, speak to viewer, no emojis/clickbait/dollar amounts, max 10 words>",
  "what_happened": "<simple language, use often/tends to/many people/over time, no advice or promises>",
  "why_it_matters": "<one short sentence, plain language, no financial advice>",
  "what_happens_next": "<soft question or reflection>",
  "cta_line": "",
  "duration_target_seconds": 35
}`;
    } else {
      systemPrompt = `You are a script writer for Orbix Network, a video news network tracking sudden power shifts. Write scripts that are:

- Calm and observational (not sensational)
- Authoritative and factual
- Structured for short-form video (30-45 seconds)
- NO speculation language ("might", "could", "probably")
- NO political rage framing
- NO graphic violence or tragedy

Script Structure:
1. Hook: One clear statement (NOT a question) that grabs attention
2. What happened: Brief factual summary
3. Why it matters: The impact and significance
4. What happens next: Forward-looking perspective
5. CTA: Soft utility call-to-action (never "please subscribe")

Tone: Calm, authoritative, observational.`;

      const categoryNames = {
        'ai-automation': 'AI & Automation',
        'corporate-collapses': 'Corporate Collapses',
        'tech-decisions': 'Tech Decisions',
        'laws-rules': 'Laws & Rules',
        'money-markets': 'Money & Markets'
      };

      userPrompt = `Category: ${categoryNames[story.category] || story.category}
Title: ${rawItem?.title}
Snippet: ${rawItem?.snippet || 'No snippet available'}
Shock Score: ${story.shock_score}/100

Generate a script for a short-form video. Return JSON with:
{
  "hook": "<one clear statement, not a question>",
  "what_happened": "<brief factual summary>",
  "why_it_matters": "<the impact and significance>",
  "what_happens_next": "<forward-looking perspective>",
  "cta_line": "<soft utility CTA, never 'please subscribe'>",
  "duration_target_seconds": <estimate: 30-45>
}`;
    }

    console.log(`[Script Generator] Step 2: Calling OpenAI API...`);
    const openaiStartTime = Date.now();
    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });
    const openaiDuration = Date.now() - openaiStartTime;
    console.log(`[Script Generator] ✓ OpenAI API call completed in ${openaiDuration}ms`);
    console.log(`[Script Generator] Response tokens: ${completion.usage?.total_tokens || 'unknown'}`);

    console.log(`[Script Generator] Step 3: Parsing JSON response...`);
    const scriptData = JSON.parse(completion.choices[0].message.content);
    console.log(`[Script Generator] ✓ JSON parsed successfully`);
    console.log(`[Script Generator] Script data keys:`, Object.keys(scriptData || {}));
    
    // Validate and clean script data
    const script = {
      hook: (scriptData.hook || '').trim(),
      what_happened: (scriptData.what_happened || '').trim(),
      why_it_matters: (scriptData.why_it_matters || '').trim(),
      what_happens_next: (scriptData.what_happens_next || '').trim(),
      cta_line: (scriptData.cta_line || '').trim(),
      duration_target_seconds: Math.min(45, Math.max(30, scriptData.duration_target_seconds || 35))
    };
    
    // Validate all fields are present
    console.log(`[Script Generator] Step 4: Validating script data...`);
    if (!script.hook || !script.what_happened || !script.why_it_matters || !script.what_happens_next) {
      console.error(`[Script Generator] ERROR: Missing required fields:`, {
        hasHook: !!script.hook,
        hasWhatHappened: !!script.what_happened,
        hasWhyItMatters: !!script.why_it_matters,
        hasWhatHappensNext: !!script.what_happens_next
      });
      throw new Error('Generated script missing required fields');
    }
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Script Generator] ========== generateScript SUCCESS (${totalDuration}ms) ==========`);
    console.log(`[Script Generator] Script preview:`, {
      hook: script.hook?.substring(0, 50),
      what_happened_length: script.what_happened?.length,
      why_it_matters_length: script.why_it_matters?.length
    });
    
    return script;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[Script Generator] ========== generateScript ERROR (${totalDuration}ms) ==========`);
    console.error('[Script Generator] Error generating script:', error);
    console.error('[Script Generator] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Create script record in database
 * @param {string} businessId - Business ID
 * @param {string} storyId - Story ID
 * @param {Object} scriptData - Script data from generateScript
 * @returns {Promise<Object>} Created script record
 */
export async function saveScript(businessId, storyId, scriptData) {
  const startTime = Date.now();
  console.log(`[Script Generator] ========== saveScript START ==========`);
  console.log(`[Script Generator] Business ID: ${businessId}, Story ID: ${storyId}`);
  console.log(`[Script Generator] Script data preview:`, {
    hook_length: scriptData?.hook?.length,
    what_happened_length: scriptData?.what_happened?.length,
    why_it_matters_length: scriptData?.why_it_matters?.length,
    what_happens_next_length: scriptData?.what_happens_next?.length,
    duration_target_seconds: scriptData?.duration_target_seconds
  });
  
  try {
    console.log(`[Script Generator] Inserting script into database...`);
    const insertStartTime = Date.now();
    const { data: script, error } = await supabaseClient
      .from('orbix_scripts')
      .insert({
        business_id: businessId,
        story_id: storyId,
        hook: scriptData.hook,
        what_happened: scriptData.what_happened,
        why_it_matters: scriptData.why_it_matters,
        what_happens_next: scriptData.what_happens_next,
        cta_line: scriptData.cta_line,
        duration_target_seconds: scriptData.duration_target_seconds
      })
      .select()
      .single();
    
    const insertDuration = Date.now() - insertStartTime;
    
    if (error) {
      console.error(`[Script Generator] ERROR: Database insert failed after ${insertDuration}ms:`, error);
      console.error(`[Script Generator] Error code: ${error.code}, message: ${error.message}`);
      console.error(`[Script Generator] Error details:`, error.details);
      throw error;
    }
    
    console.log(`[Script Generator] ✓ Script inserted into database in ${insertDuration}ms`);
    console.log(`[Script Generator] Created script ID: ${script.id}`);
    console.log(`[Script Generator] Script record:`, {
      id: script.id,
      story_id: script.story_id,
      business_id: script.business_id,
      created_at: script.created_at
    });
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Script Generator] ========== saveScript SUCCESS (${totalDuration}ms) ==========`);
    
    return script;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[Script Generator] ========== saveScript ERROR (${totalDuration}ms) ==========`);
    console.error('[Script Generator] Error saving script:', error);
    console.error('[Script Generator] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Generate script and save it for a story
 * @param {string} businessId - Business ID
 * @param {Object} story - Story object
 * @returns {Promise<Object>} Created script record
 */
export async function generateAndSaveScript(businessId, story) {
  const startTime = Date.now();
  console.log(`[Script Generator] ========== generateAndSaveScript START ==========`);
  console.log(`[Script Generator] Story ID: ${story.id}, Business ID: ${businessId}`);
  
  try {
    // Get raw item data
    console.log(`[Script Generator] Step 1: Fetching raw item (raw_item_id: ${story.raw_item_id})...`);
    const { data: rawItem, error: rawError } = await supabaseClient
      .from('orbix_raw_items')
      .select('*')
      .eq('id', story.raw_item_id)
      .single();
    
    if (rawError) {
      console.error(`[Script Generator] ERROR: Raw item fetch failed:`, rawError);
      throw new Error(`Raw item not found: ${rawError.message}`);
    }
    
    if (!rawItem) {
      console.error(`[Script Generator] ERROR: Raw item not found (no data returned)`);
      throw new Error('Raw item not found (no data)');
    }
    
    console.log(`[Script Generator] ✓ Raw item found:`, {
      id: rawItem.id,
      title: rawItem.title?.substring(0, 50),
      status: rawItem.status
    });
    
    // Generate script
    console.log(`[Script Generator] Step 2: Calling generateScript function...`);
    const generateStartTime = Date.now();
    const scriptData = await generateScript(story, rawItem);
    const generateDuration = Date.now() - generateStartTime;
    console.log(`[Script Generator] ✓ Script data generated in ${generateDuration}ms`);
    console.log(`[Script Generator] Script data keys:`, Object.keys(scriptData || {}));
    
    // Save script
    console.log(`[Script Generator] Step 3: Saving script to database...`);
    const saveStartTime = Date.now();
    const script = await saveScript(businessId, story.id, scriptData);
    const saveDuration = Date.now() - saveStartTime;
    console.log(`[Script Generator] ✓ Script saved to database in ${saveDuration}ms`);
    console.log(`[Script Generator] Script ID: ${script?.id}`);
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Script Generator] ========== generateAndSaveScript SUCCESS (${totalDuration}ms) ==========`);
    
    return script;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[Script Generator] ========== generateAndSaveScript ERROR (${totalDuration}ms) ==========`);
    console.error(`[Script Generator] Error:`, error);
    console.error(`[Script Generator] Error stack:`, error.stack);
    throw error;
  }
}

