/**
 * Orbix Network Classification Service
 * Classifies stories into categories and scores them for "shock" value
 */

import OpenAI from 'openai';
import { supabaseClient } from '../../config/database.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';

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

const CATEGORIES = [
  'ai-automation',
  'corporate-collapses',
  'tech-decisions',
  'laws-rules',
  'money-markets'
];

/**
 * Classify a raw item into one of the 5 categories
 * @param {Object} rawItem - Raw item from database
 * @returns {Promise<string>} Category key
 */
export async function classifyStory(rawItem) {
  try {
    const systemPrompt = `You are a content classifier for Orbix Network, which tracks sudden power shifts. Classify news stories into exactly one of these 5 categories:

1. ai-automation: AI and automation taking over jobs, industries, or processes
2. corporate-collapses: Major company failures, reversals, or market exits
3. tech-decisions: Technology decisions with massive fallout or impact
4. laws-rules: Laws, regulations, or rules that quietly changed everything
5. money-markets: Money and market shocks (NOT stock picks or financial advice)

Return ONLY the category key (e.g., "ai-automation"). If the story doesn't clearly fit any category, return "REJECT".`;

    const userPrompt = `Title: ${rawItem.title}

Snippet: ${rawItem.snippet || 'No snippet available'}

URL: ${rawItem.url}

Classify this story into one of the 5 categories. Return only the category key, or "REJECT" if it doesn't fit.`;

    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 50
    });

    const category = completion.choices[0].message.content.trim().toLowerCase();
    
    if (category === 'reject' || !CATEGORIES.includes(category)) {
      return null; // Rejected
    }
    
    return category;
  } catch (error) {
    console.error('[Orbix Classifier] Classification error:', error);
    throw error;
  }
}

/**
 * Score a story for "shock" value (0-100)
 * @param {Object} storyData - Story data with category
 * @returns {Promise<Object>} Score and factors
 */
export async function scoreShock(storyData) {
  try {
    const systemPrompt = `You are a "shock score" evaluator for Orbix Network. Score stories from 0-100 based on these factors:

1. Scale (0-30): How many people/companies/industries are affected?
2. Speed (0-20): How quickly did the shift happen?
3. Power shift (0-25): How much power changed hands or was disrupted?
4. Permanence (0-15): How permanent/reversible is this change?
5. Explainability (0-10): How easy is it to explain the impact?

Return a JSON object with:
{
  "total_score": <0-100>,
  "factors": {
    "scale": <0-30>,
    "speed": <0-20>,
    "power_shift": <0-25>,
    "permanence": <0-15>,
    "explainability": <0-10>
  },
  "reasoning": "<brief explanation>"
}`;

    const userPrompt = `Category: ${storyData.category}
Title: ${storyData.title}
Snippet: ${storyData.snippet || 'No snippet available'}

Score this story and return JSON.`;

    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    // Validate and clamp scores
    const factors = {
      scale: Math.min(30, Math.max(0, result.factors?.scale || 0)),
      speed: Math.min(20, Math.max(0, result.factors?.speed || 0)),
      power_shift: Math.min(25, Math.max(0, result.factors?.power_shift || 0)),
      permanence: Math.min(15, Math.max(0, result.factors?.permanence || 0)),
      explainability: Math.min(10, Math.max(0, result.factors?.explainability || 0))
    };
    
    const totalScore = Math.min(100, Math.max(0, 
      factors.scale + factors.speed + factors.power_shift + factors.permanence + factors.explainability
    ));
    
    return {
      score: totalScore,
      factors: factors,
      reasoning: result.reasoning || ''
    };
  } catch (error) {
    console.error('[Orbix Classifier] Scoring error:', error);
    throw error;
  }
}

/**
 * Check if story should be processed (meets threshold)
 * @param {Object} scoreResult - Result from scoreShock
 * @param {number} threshold - Minimum score threshold (default 65)
 * @returns {boolean}
 */
export function shouldProcess(scoreResult, threshold = 65) {
  return scoreResult.score >= threshold;
}

/**
 * Process a raw item: classify, score, and create story if it passes
 * @param {string} businessId - Business ID
 * @param {Object} rawItem - Raw item from database
 * @returns {Promise<Object|null>} Created story or null if rejected
 */
export async function processRawItem(businessId, rawItem) {
  try {
    // Get threshold from settings
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'orbix-network');
    const threshold = moduleSettings?.settings?.scoring?.shock_score_threshold || 65;
    
    // Classify
    const category = await classifyStory(rawItem);
    if (!category) {
      // Mark raw item as discarded
      await supabaseClient
        .from('orbix_raw_items')
        .update({
          status: 'DISCARDED',
          discard_reason: 'Failed classification'
        })
        .eq('id', rawItem.id);
      return null;
    }
    
    // Score
    const scoreResult = await scoreShock({
      category,
      title: rawItem.title,
      snippet: rawItem.snippet,
      url: rawItem.url
    });
    
    // Check threshold
    if (!shouldProcess(scoreResult, threshold)) {
      // Mark raw item as discarded
      await supabaseClient
        .from('orbix_raw_items')
        .update({
          status: 'DISCARDED',
          discard_reason: `Score too low: ${scoreResult.score} < ${threshold}`
        })
        .eq('id', rawItem.id);
      return null;
    }
    
    // Create story
    const { data: story, error } = await supabaseClient
      .from('orbix_stories')
      .insert({
        business_id: businessId,
        raw_item_id: rawItem.id,
        category: category,
        shock_score: scoreResult.score,
        factors_json: scoreResult.factors,
        status: 'QUEUED'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Mark raw item as processed
    await supabaseClient
      .from('orbix_raw_items')
      .update({ status: 'PROCESSED' })
      .eq('id', rawItem.id);
    
    console.log(`[Orbix Classifier] Created story: ${story.id} (score: ${scoreResult.score})`);
    return story;
  } catch (error) {
    console.error('[Orbix Classifier] Error processing raw item:', error);
    throw error;
  }
}

