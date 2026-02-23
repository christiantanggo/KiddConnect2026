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

Return ONLY the category key (e.g., "ai-automation"). When in doubt, prefer the closest category rather than REJECT. Use REJECT only if the story has nothing to do with power shifts, tech, business, or markets.`;

    const userPrompt = `Title: ${rawItem.title}

Snippet: ${rawItem.snippet || 'No snippet available'}

URL: ${rawItem.url}

Classify this story into one of the 5 categories. Return only the category key. Use REJECT only if it clearly doesn't fit any category.`;

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
    const threshold = moduleSettings?.settings?.scoring?.shock_score_threshold ?? 45;
    
    // Use pre-calculated shock score from raw item (calculated during scraping)
    const shockScore = rawItem.shock_score;
    const category = rawItem.category;
    const factorsJson = rawItem.factors_json;
    
    // If shock score wasn't calculated during scraping, calculate it now
    if (!shockScore || !category) {
      console.log(`[Classifier] Shock score not pre-calculated for raw item ${rawItem.id}, calculating now...`);
      
      // Classify
      const classifiedCategory = await classifyStory(rawItem);
      if (!classifiedCategory) {
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
        category: classifiedCategory,
        title: rawItem.title,
        snippet: rawItem.snippet,
        url: rawItem.url
      });
      
      // Update raw item with calculated score
      await supabaseClient
        .from('orbix_raw_items')
        .update({
          category: classifiedCategory,
          shock_score: scoreResult.score,
          factors_json: scoreResult.factors
        })
        .eq('id', rawItem.id);
      
      // Check threshold (evergreen categories psychology/money/trivia/facts always pass)
      const isEvergreen = classifiedCategory === 'psychology' || classifiedCategory === 'money' || classifiedCategory === 'trivia' || classifiedCategory === 'facts';
      if (!isEvergreen && !shouldProcess(scoreResult, threshold)) {
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
      
      // Use the newly calculated values
      const finalCategory = classifiedCategory;
      const finalScore = scoreResult.score;
      const finalFactors = scoreResult.factors;
      
      // Create story (channel_id from raw item for multi-channel support)
      // Trivia and facts are auto-approved; others start as PENDING
      const storyStatus = (finalCategory === 'trivia' || finalCategory === 'facts') ? 'APPROVED' : 'PENDING';
      const { data: story, error } = await supabaseClient
        .from('orbix_stories')
        .insert({
          business_id: businessId,
          channel_id: rawItem.channel_id ?? null,
          raw_item_id: rawItem.id,
          category: finalCategory,
          shock_score: finalScore,
          factors_json: finalFactors ?? {},
          status: storyStatus
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Mark raw item as processed
      await supabaseClient
        .from('orbix_raw_items')
        .update({ status: 'PROCESSED' })
        .eq('id', rawItem.id);
      
      console.log(`[Orbix Classifier] Created story: ${story.id} (score: ${finalScore})`);
      return story;
    } else {
      // Use pre-calculated values
      // Check threshold (skip for evergreen categories: psychology, money, trivia, facts — they always pass)
      const isEvergreen = category === 'psychology' || category === 'money' || category === 'trivia' || category === 'facts';
      if (!isEvergreen && shockScore < threshold) {
        // Mark raw item as discarded
        await supabaseClient
          .from('orbix_raw_items')
          .update({
            status: 'DISCARDED',
            discard_reason: `Score too low: ${shockScore} < ${threshold}`
          })
          .eq('id', rawItem.id);
        return null;
      }

      // Create story using pre-calculated values (channel_id from raw item)
      // Trivia and facts are auto-approved; others start as PENDING
      const storyStatus = (category === 'trivia' || category === 'facts') ? 'APPROVED' : 'PENDING';
      const { data: story, error } = await supabaseClient
        .from('orbix_stories')
        .insert({
          business_id: businessId,
          channel_id: rawItem.channel_id ?? null,
          raw_item_id: rawItem.id,
          category: category,
          shock_score: shockScore,
          factors_json: factorsJson ?? {},
          status: storyStatus
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Mark raw item as processed
      await supabaseClient
        .from('orbix_raw_items')
        .update({ status: 'PROCESSED' })
        .eq('id', rawItem.id);
      
      console.log(`[Orbix Classifier] Created story: ${story.id} (score: ${shockScore})`);
      return story;
    }
  } catch (error) {
    console.error('[Orbix Classifier] Error processing raw item:', error);
    throw error;
  }
}

