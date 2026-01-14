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
  try {
    const systemPrompt = `You are a script writer for Orbix Network, a video news network tracking sudden power shifts. Write scripts that are:

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

    const userPrompt = `Category: ${categoryNames[story.category] || story.category}
Title: ${rawItem.title}
Snippet: ${rawItem.snippet || 'No snippet available'}
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

    const scriptData = JSON.parse(completion.choices[0].message.content);
    
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
    if (!script.hook || !script.what_happened || !script.why_it_matters || !script.what_happens_next) {
      throw new Error('Generated script missing required fields');
    }
    
    return script;
  } catch (error) {
    console.error('[Orbix Script Generator] Error generating script:', error);
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
  try {
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
    
    if (error) throw error;
    
    console.log(`[Orbix Script Generator] Created script: ${script.id}`);
    return script;
  } catch (error) {
    console.error('[Orbix Script Generator] Error saving script:', error);
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
  try {
    // Get raw item data
    const { data: rawItem, error: rawError } = await supabaseClient
      .from('orbix_raw_items')
      .select('*')
      .eq('id', story.raw_item_id)
      .single();
    
    if (rawError || !rawItem) {
      throw new Error('Raw item not found');
    }
    
    // Generate script
    const scriptData = await generateScript(story, rawItem);
    
    // Save script
    const script = await saveScript(businessId, story.id, scriptData);
    
    return script;
  } catch (error) {
    console.error('[Orbix Script Generator] Error in generateAndSaveScript:', error);
    throw error;
  }
}

