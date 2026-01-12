import OpenAI from 'openai';
import { Business } from '../models/Business.js';
import { ModuleSettings } from '../models/v2/ModuleSettings.js';
import { ReviewsOutput } from '../models/v2/ReviewsOutput.js';
import { UsageLog } from '../models/v2/UsageLog.js';
import { supabaseClient } from '../config/database.js';
import { sanitizeInput } from '../utils/sanitize.js';
import { REVIEWS_DEFAULTS } from '../config/module-defaults.js';
import { analyzeReview, getRecommendedPosture, getAdjustedTone } from './review-analyzer.js';
import { getLearningBiases } from './review-feedback-learning.js';

// Lazy OpenAI client initialization (like VAPI client pattern)
// This allows the module to load even if OpenAI isn't configured
let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Please configure it in your environment variables.');
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
  }
  return openaiClient;
}

const DEFAULT_MODEL = process.env.REVIEWS_MODEL || 'gpt-4o';
const DEFAULT_TEMPERATURE = parseFloat(process.env.REVIEWS_TEMPERATURE || '0.7');
const DEFAULT_MAX_TOKENS = parseInt(process.env.REVIEWS_MAX_TOKENS || '2000');
const MAX_REVIEW_TEXT_LENGTH = REVIEWS_DEFAULTS.max_review_text_length || 5000;
const MIN_REVIEW_TEXT_LENGTH = REVIEWS_DEFAULTS.min_review_text_length || 10;

/**
 * Generate review replies
 */
export async function generateReviewReply(input, business, userId) {
  // Validate input
  if (!input.review_text || typeof input.review_text !== 'string' || input.review_text.trim().length < MIN_REVIEW_TEXT_LENGTH) {
    throw new Error(`Review text must be at least ${MIN_REVIEW_TEXT_LENGTH} characters`);
  }
  
  if (input.review_text.length > MAX_REVIEW_TEXT_LENGTH) {
    throw new Error(`Review text must be less than ${MAX_REVIEW_TEXT_LENGTH} characters`);
  }
  
  if (!input.star_rating || input.star_rating < 1 || input.star_rating > 5) {
    throw new Error('Star rating must be between 1 and 5');
  }
  
  // Sanitize input (prevent XSS)
  const sanitizedReviewText = sanitizeInput(input.review_text);
  const sanitizedCustomerName = input.customer_name ? sanitizeInput(input.customer_name) : null;
  const sanitizedContextNotes = input.context_notes ? sanitizeInput(input.context_notes) : null;
  
  // Get module settings
  let moduleSettings = await ModuleSettings.findByBusinessAndModule(business.id, 'reviews');
  if (!moduleSettings) {
    // Create default settings
    moduleSettings = await ModuleSettings.create({
      business_id: business.id,
      module_key: 'reviews',
      settings: {
        default_tone: REVIEWS_DEFAULTS.default_tone,
        default_length: REVIEWS_DEFAULTS.default_length,
        include_resolution_by_default: REVIEWS_DEFAULTS.include_resolution_by_default,
        risk_detection_enabled: REVIEWS_DEFAULTS.risk_detection_enabled
      }
    });
  }
  
  const settings = moduleSettings.settings || {};

  // Analyze review for sentiment, risk, and crisis detection
  const analysis = await analyzeReview(
    sanitizedReviewText,
    input.star_rating,
    sanitizedContextNotes || ''
  );

  // Get recommended response posture based on analysis
  const recommendedPosture = input.response_posture || getRecommendedPosture(analysis, settings);
  
  // Adjust tone based on analysis, slider, and learning biases
  const learningBiases = await getLearningBiases(business.id);
  const toneSlider = input.tone_slider || 3;
  const adjustedTone = getAdjustedTone(
    input.tone || settings.default_tone || REVIEWS_DEFAULTS.default_tone,
    analysis,
    toneSlider
  );
  
  // Apply learning biases to tone if available
  let finalTone = adjustedTone;
  if (learningBiases.tone_adjustment !== 0) {
    // Apply bias: -1 = more friendly, +1 = more firm
    if (learningBiases.style_preference === 'friendly' && adjustedTone === 'professional') {
      finalTone = 'friendly';
    } else if (learningBiases.style_preference === 'firm' && adjustedTone !== 'professional') {
      finalTone = 'firm';
    }
  }
  
  // Build prompt with analysis and all context
  const { systemPrompt, userPrompt } = buildReviewPrompt({
    ...input,
    review_text: sanitizedReviewText,
    customer_name: sanitizedCustomerName,
    context_notes: sanitizedContextNotes,
    tone: finalTone,
    response_posture: recommendedPosture,
    analysis,
    learningBiases
  }, business, settings, analysis);
  
  // Call OpenAI with retry logic
  let completion;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      completion = await getOpenAIClient().chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: DEFAULT_TEMPERATURE,
        max_tokens: DEFAULT_MAX_TOKENS,
        response_format: { type: 'json_object' }
      });
      
      break; // Success
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.error('[generateReviewReply] OpenAI API error after retries:', error);
        throw new Error(`Failed to generate review reply: ${error.message}`);
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempts) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Parse and validate response
  const responseText = completion.choices[0].message.content;
  let output;
  
  try {
    output = JSON.parse(responseText);
  } catch (parseError) {
    console.error('[generateReviewReply] Failed to parse JSON response:', parseError);
    console.error('[generateReviewReply] Response text:', responseText);
    throw new Error('Invalid response format from AI');
  }
  
  // Validate output structure
  validateReviewOutput(output);
  
  // Calculate tokens
  const tokensUsed = completion.usage?.total_tokens || 0;
  const promptTokens = completion.usage?.prompt_tokens || 0;
  const completionTokens = completion.usage?.completion_tokens || 0;
  
  // Create review output record with analysis (will be updated with analysis data after)
  const reviewOutput = await ReviewsOutput.create({
    business_id: business.id,
    user_id: userId,
    module_key: 'reviews',
    prompt_type: 'reviews.reply',
    input: {
      review_text: sanitizedReviewText,
      star_rating: input.star_rating,
      customer_name: sanitizedCustomerName,
      context_notes: sanitizedContextNotes,
      tone: finalTone,
      length: input.length || learningBiases.length_preference || settings.default_length,
      response_posture: recommendedPosture,
      tone_slider: toneSlider
    },
    output: {
      reply_options: output.reply_options,
      internal_notes: output.internal_notes
    }
  });

  // Update with analysis data
  await ReviewsOutput.updateAnalysis(reviewOutput.id, {
    sentiment: analysis.sentiment,
    risk_level: analysis.risk_level,
    crisis_detected: analysis.crisis_detected,
    response_posture: recommendedPosture,
    tone_slider_value: toneSlider,
    review_date: input.review_date ? new Date(input.review_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  });
  
  // Record usage using existing UsageLog model
  await UsageLog.create({
    business_id: business.id,
    user_id: userId,
    module_key: 'reviews',
    action: 'reviews.generate',
    units_used: 1,
    metadata: {
      output_id: reviewOutput.id,
      star_rating: input.star_rating
    }
  });
  
  // Record AI request
  await supabaseClient
    .from('ai_requests')
    .insert({
      business_id: business.id,
      user_id: userId,
      module_key: 'reviews',
      prompt_type: 'reviews.reply',
      input: userPrompt.substring(0, 1000), // Truncate for storage
      output: responseText.substring(0, 1000), // Truncate for storage
      tokens_used: tokensUsed,
      model: DEFAULT_MODEL
    });
  
  return {
    output_id: reviewOutput.id,
    reply_options: output.reply_options,
    internal_notes: output.internal_notes,
    analysis: {
      sentiment: analysis.sentiment,
      risk_level: analysis.risk_level,
      crisis_detected: analysis.crisis_detected,
      emotional_intensity: analysis.emotional_intensity,
      risk_flags: analysis.risk_flags
    },
    tokens_used: tokensUsed
  };
}

/**
 * Build system and user prompts
 */
function buildReviewPrompt(input, business, settings, analysis = null) {
  // Build business context with scraped content if available
  let businessContext = `BUSINESS CONTEXT:
- Business Name: ${business.name || 'Unknown Business'}
- Industry: ${business.industry || settings.custom_branding?.industry || 'General'}
- Brand Voice: ${settings.custom_branding?.brand_voice || settings.default_tone || REVIEWS_DEFAULTS.default_tone}`;

  // Add scraped website content if available
  if (settings.scraped_content?.website_content) {
    businessContext += `\n\nBUSINESS WEBSITE INFORMATION (extracted from ${settings.business_website || 'website'}):
${settings.scraped_content.website_content.substring(0, 2000)}

Use this information to understand the business's products, services, policies, and communication style.`;
  }

  // Add tone preferences if user provided examples
  let toneGuidance = '';
  if (settings.tone_preferences && Object.keys(settings.tone_preferences).length > 0) {
    toneGuidance = `\n\nTONE PREFERENCES (learned from user examples):
The user has indicated preferences for certain response styles. Match the tone and style demonstrated in their preferred examples.`;
  }

  const systemPrompt = `You are Tavari AI, a professional review reply assistant. This request comes from the Review Reply AI module.

${businessContext}${toneGuidance}

TASK:
Generate exactly ${input.length === 'short' || (input.learningBiases && input.learningBiases.length_preference === 'short') ? '1' : input.length === 'long' || (input.learningBiases && input.learningBiases.length_preference === 'long') ? '1' : '3'} reply option${input.length === 'short' || input.length === 'long' || (input.learningBiases && ['short', 'long'].includes(input.learningBiases.length_preference)) ? '' : 's'} for a Google review in JSON format:
${input.length === 'short' || (input.learningBiases && input.learningBiases.length_preference === 'short')
  ? '1. Short (50-75 words): Concise, direct response'
  : input.length === 'long' || (input.learningBiases && input.learningBiases.length_preference === 'long')
  ? '1. Long (200-250 words): Comprehensive, thorough response'
  : `1. Short (50-75 words): Concise, direct response
2. Medium (100-150 words): Balanced, detailed response  
3. Long (200-250 words): Comprehensive, thorough response`}

REQUIREMENTS:
- Tone: ${input.tone || settings.default_tone || REVIEWS_DEFAULTS.default_tone} (calm/friendly/professional/firm)
- Always professional and brand-appropriate
- Never defensive or confrontational

REPLY STRUCTURE:
${settings.reply_openings?.includes('thank') ? '- START replies with "Thank you" (for all reviews)' : ''}
${settings.reply_openings?.includes('business_name') ? `- Include business name "${business.name}" in opening` : ''}
${settings.reply_openings?.includes('customer_name') ? '- Personalize opening with customer name when available' : ''}
${settings.reply_closings?.includes('contact_info') ? `- END with contact information (${settings.custom_branding?.contact_method || business.email || 'customer service'})` : ''}
${settings.reply_closings?.includes('invite_back') ? '- Include invitation to return ("We hope to serve you again")' : ''}
${settings.reply_closings?.includes('business_name') ? `- Sign with business name "${business.name}"` : ''}

RESPONSE POSTURE:
${input.response_posture === 'apologetic' 
  ? '- Use apologetic language, acknowledge fault, take responsibility' 
  : input.response_posture === 'corrective'
  ? '- Correct misinformation in review, provide factual information, maintain professionalism'
  : input.response_posture === 'grateful'
  ? '- Express gratitude, reinforce positive experience, encourage return'
  : '- Use neutral acknowledgment, avoid admitting fault, factual and professional'}

APOLOGY STYLE (if negative review and apologetic posture):
${settings.apology_tone === 'non_admitting' 
  ? '- Use non-admitting language like "Sorry for the experience that you have described" (acknowledge without admitting fault)' 
  : '- Use apologetic language like "We sincerely apologize" (admits responsibility)'}

${settings.legal_awareness_enabled !== false ? `LEGAL COMPLIANCE (${settings.legal_rules?.legal_sensitivity || settings.legal_sensitivity || 'medium'} sensitivity):
- Be mindful of legal implications and avoid language that could create liability
- Avoid admitting fault in ways that could create legal exposure
- Use language appropriate for ${settings.jurisdiction ? settings.jurisdiction : 'your jurisdiction'}
- Do not make promises that cannot be fulfilled
- Avoid language that could be construed as defamation or slander
- Be particularly careful with safety, health, or regulatory concerns
${((settings.legal_rules?.forbidden_phrases && settings.legal_rules.forbidden_phrases.length > 0) || (settings.forbidden_phrases && settings.forbidden_phrases.length > 0)) ? `- FORBIDDEN PHRASES (never use): ${(settings.legal_rules?.forbidden_phrases || settings.forbidden_phrases || []).join(', ')}` : ''}
${((settings.legal_rules?.preferred_phrases && settings.legal_rules.preferred_phrases.length > 0) || (settings.preferred_phrases && settings.preferred_phrases.length > 0)) ? `- PREFERRED PHRASES (use when appropriate): ${(settings.legal_rules?.preferred_phrases || settings.preferred_phrases || []).join(', ')}` : ''}` : ''}

${analysis ? `REVIEW ANALYSIS:
- Sentiment: ${analysis.sentiment}
- Emotional Intensity: ${analysis.emotional_intensity}
- Risk Level: ${analysis.risk_level}
${analysis.risk_flags.length > 0 ? `- Risk Flags: ${analysis.risk_flags.join(', ')}` : ''}
${analysis.crisis_detected ? '- ⚠️ CRISIS MODE: Handle with extreme care, neutral language only' : ''}` : ''}

${input.learningBiases && input.learningBiases.learning_enabled ? `LEARNING BIASES (from user feedback):
- Tone Preference: ${input.learningBiases.style_preference || 'none'}
- Length Preference: ${input.learningBiases.length_preference || 'medium'}
Adjust style slightly toward these preferences.` : ''}

REPLY CONTENT:
${input.response_posture === 'corrective' 
  ? '- Correct any factual inaccuracies in the review using the provided context' 
  : input.response_posture === 'grateful'
  ? '- Express genuine gratitude, reinforce positive aspects, invite return'
  : '- Acknowledge concern, respond appropriately based on posture selected, offer solution'}

${input.response_posture === 'corrective' && input.context_notes 
  ? `- Use context to correct: "${input.context_notes.substring(0, 200)}"` 
  : ''}

${(settings.brand_voice_profile?.emoji_usage && settings.brand_voice_profile.emoji_usage !== 'none')
  ? `- Emoji usage: ${settings.brand_voice_profile.emoji_usage} (${settings.brand_voice_profile.emoji_usage === 'light' ? 'sparingly, 0-1 per response' : 'moderately, 1-2 per response'})` 
  : '- No emojis'}

${(settings.brand_voice_profile?.perspective || 'we')
  ? `- Use ${(settings.brand_voice_profile?.perspective || 'we') === 'I' ? 'first-person "I"' : 'first-person plural "We"'} perspective` 
  : '- Use "We" perspective'}

${(settings.brand_voice_profile?.sign_off && settings.brand_voice_profile.sign_off !== 'none')
  ? settings.brand_voice_profile.sign_off === 'business_team' 
    ? `- Sign off with: "— The ${business.name} Team"` 
    : settings.brand_voice_profile.sign_off === 'custom' && settings.brand_voice_profile.custom_sign_off
    ? `- Sign off with: "${settings.brand_voice_profile.custom_sign_off}"`
    : ''
  : ''}

${settings.reply_strategy?.default_reply_goal 
  ? `- Default Reply Goal: ${settings.reply_strategy.default_reply_goal}` 
  : ''}

${input.include_resolution_step !== false ? `- Include clear next step for resolution (contact: ${settings.custom_branding?.contact_method || business.email || 'customer service'})` : ''}
${analysis && analysis.crisis_detected ? '- CRITICAL: Suggest offline/private resolution, avoid public discussion of details' : ''}

RISK DETECTION:
Analyze the review for potential issues:
- Defamation claims
- Refund requests
- Safety concerns
- Legal issues
- Privacy violations

OUTPUT FORMAT (STRICT JSON):
{
  "reply_options": [
    { "label": "Short", "text": "..." },
    { "label": "Medium", "text": "..." },
    { "label": "Long", "text": "..." }
  ],
  "internal_notes": {
    "risk_flags": ["flag1", "flag2"],
    "suggested_next_step": "Recommended action..."
  }
}

Return ONLY valid JSON, no other text.`;

  // Build context section
  let contextSection = '';
  if (input.context_notes) {
    contextSection = `\n\nIMPORTANT CONTEXT (use this to provide accurate, business-specific responses):
${input.context_notes}

CRITICAL: Incorporate this context into your responses. For example, if the context mentions specific details (like "the plate is 9 inches, pizza is 7 inches"), use this factual information in your reply rather than making generic apologies. This helps provide accurate, helpful responses that address the actual situation and correct any misconceptions.`;
  }

  const userPrompt = `Review Details:
- Rating: ${input.star_rating}/5 stars
- Review Text: "${input.review_text}"
${input.customer_name ? `- Customer Name: ${input.customer_name}` : ''}${contextSection}

Generate ${input.length || 'medium'} length replies with ${input.tone || 'professional'} tone.`;

  return { systemPrompt, userPrompt };
}

/**
 * Validate output structure
 */
function validateReviewOutput(output) {
  if (!output || typeof output !== 'object') {
    throw new Error('Invalid output: must be an object');
  }
  
  if (!output.reply_options || !Array.isArray(output.reply_options)) {
    throw new Error('Invalid output: reply_options must be an array');
  }
  
  if (output.reply_options.length !== 3) {
    throw new Error('Invalid output: must have exactly 3 reply options');
  }
  
  const requiredLabels = ['Short', 'Medium', 'Long'];
  const labels = output.reply_options.map(r => r.label);
  
  for (const requiredLabel of requiredLabels) {
    if (!labels.includes(requiredLabel)) {
      throw new Error(`Invalid output: missing "${requiredLabel}" reply option`);
    }
  }
  
  for (const option of output.reply_options) {
    if (!option.label || !option.text) {
      throw new Error('Invalid output: each reply option must have label and text');
    }
    if (typeof option.text !== 'string' || option.text.trim().length === 0) {
      throw new Error('Invalid output: reply option text must be non-empty string');
    }
  }
  
  if (!output.internal_notes || typeof output.internal_notes !== 'object') {
    throw new Error('Invalid output: internal_notes must be an object');
  }
  
  if (!Array.isArray(output.internal_notes.risk_flags)) {
    throw new Error('Invalid output: risk_flags must be an array');
  }
  
  if (!output.internal_notes.suggested_next_step || typeof output.internal_notes.suggested_next_step !== 'string') {
    throw new Error('Invalid output: suggested_next_step must be a string');
  }
}

