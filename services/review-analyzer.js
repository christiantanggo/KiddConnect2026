/**
 * Review Analyzer Service
 * Automatically analyzes reviews for sentiment, risk, and crisis detection
 * before reply generation
 */

/**
 * Analyze review text for sentiment, risk, and crisis indicators
 */
export async function analyzeReview(reviewText, starRating, contextNotes = '') {
  const analysis = {
    sentiment: 'neutral',
    emotional_intensity: 'low',
    risk_level: 'low',
    crisis_detected: false,
    risk_flags: [],
    keywords: {
      positive: [],
      negative: [],
      legal: [],
      safety: []
    }
  };

  const text = (reviewText + ' ' + contextNotes).toLowerCase();

  // Sentiment classification based on rating and text
  if (starRating >= 4) {
    analysis.sentiment = 'positive';
  } else if (starRating <= 2) {
    analysis.sentiment = 'negative';
  } else {
    analysis.sentiment = 'neutral';
  }

  // Emotional intensity detection
  const intensityKeywords = {
    high: ['terrible', 'awful', 'horrible', 'disgusting', 'hate', 'worst', 'never again', 'disappointed', 'outraged', 'furious', 'appalled'],
    medium: ['bad', 'poor', 'disappointing', 'unsatisfactory', 'not good', 'could be better', 'issues', 'problems', 'concerns'],
    low: ['ok', 'okay', 'fine', 'decent', 'average', 'acceptable']
  };

  let intensityCount = { high: 0, medium: 0, low: 0 };
  for (const [level, keywords] of Object.entries(intensityKeywords)) {
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        intensityCount[level]++;
      }
    });
  }

  if (intensityCount.high >= 2 || intensityCount.high >= 1 && starRating <= 2) {
    analysis.emotional_intensity = 'high';
  } else if (intensityCount.medium >= 2 || intensityCount.high >= 1) {
    analysis.emotional_intensity = 'medium';
  }

  // Risk level classification
  const legalKeywords = ['sue', 'lawsuit', 'legal', 'lawyer', 'attorney', 'liability', 'negligent', 'negligence', 'unsafe', 'dangerous', 'injury', 'injured', 'hurt', 'hospital'];
  const safetyKeywords = ['unsafe', 'dangerous', 'hazard', 'risk', 'accident', 'injury', 'injured', 'sick', 'illness', 'health', 'toxic', 'contaminated'];
  const reputationalKeywords = ['never coming back', 'tell everyone', 'post everywhere', 'social media', 'review everywhere', 'bad reputation', 'worst experience'];
  const refundKeywords = ['refund', 'money back', 'charge back', 'dispute', 'chargeback', 'cancel', 'void'];

  // Check for legal keywords
  legalKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      analysis.risk_flags.push('legal_concern');
      analysis.keywords.legal.push(keyword);
      if (analysis.risk_level === 'low') analysis.risk_level = 'reputational';
      if (analysis.risk_level === 'reputational') analysis.risk_level = 'legal';
    }
  });

  // Check for safety keywords
  safetyKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      analysis.risk_flags.push('safety_concern');
      analysis.keywords.safety.push(keyword);
      if (analysis.risk_level !== 'legal') analysis.risk_level = 'legal';
    }
  });

  // Check for refund requests
  refundKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      analysis.risk_flags.push('refund_request');
      if (analysis.risk_level === 'low') analysis.risk_level = 'reputational';
    }
  });

  // Check for reputational threats
  reputationalKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      analysis.risk_flags.push('reputational_threat');
      if (analysis.risk_level === 'low') analysis.risk_level = 'reputational';
    }
  });

  // Crisis detection
  const crisisIndicators = [
    analysis.risk_level === 'legal',
    analysis.emotional_intensity === 'high' && analysis.sentiment === 'negative',
    analysis.risk_flags.includes('safety_concern'),
    (analysis.risk_flags.includes('legal_concern') && analysis.sentiment === 'negative'),
    text.includes('never') && text.includes('again') && starRating <= 2
  ];

  if (crisisIndicators.filter(Boolean).length >= 2 || 
      (analysis.risk_level === 'legal' && analysis.sentiment === 'negative')) {
    analysis.crisis_detected = true;
    if (analysis.risk_level === 'reputational') analysis.risk_level = 'legal';
  }

  // Detect positive keywords
  const positiveKeywords = ['excellent', 'amazing', 'wonderful', 'fantastic', 'great', 'love', 'best', 'perfect', 'outstanding', 'exceptional'];
  positiveKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      analysis.keywords.positive.push(keyword);
    }
  });

  // Detect negative keywords
  const negativeKeywords = ['terrible', 'awful', 'horrible', 'disgusting', 'hate', 'worst', 'bad', 'poor', 'disappointed', 'unsatisfactory'];
  negativeKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      analysis.keywords.negative.push(keyword);
    }
  });

  return analysis;
}

/**
 * Determine recommended response posture based on analysis
 */
export function getRecommendedPosture(analysis, settings) {
  // Crisis situations - always neutral
  if (analysis.crisis_detected || analysis.risk_level === 'legal') {
    return 'neutral';
  }

  // High emotional intensity - de-escalate
  if (analysis.emotional_intensity === 'high' && analysis.sentiment === 'negative') {
    const apologyBehavior = settings.legal_rules?.apology_behavior || settings.apology_behavior || 'apologize';
    return (apologyBehavior === 'neutral' || apologyBehavior === 'non_committal') ? 'neutral' : 'apologetic';
  }

  // Positive reviews - always friendly/grateful
  if (analysis.sentiment === 'positive') {
    return 'grateful';
  }

  // Default based on settings
  const replyGoal = settings.reply_strategy?.default_reply_goal || settings.default_reply_goal || 'professional';
  if (replyGoal === 'de_escalate') {
    return 'apologetic';
  } else if (replyGoal === 'professional') {
    return 'neutral';
  } else if (replyGoal === 'redirect_offline') {
    return 'neutral';
  } else if (replyGoal === 'encourage_return') {
    return 'grateful';
  }

  return 'neutral';
}

/**
 * Adjust tone based on risk level and analysis
 */
export function getAdjustedTone(baseTone, analysis, toneSlider = 3) {
  // Crisis or legal risk - force neutral/professional
  if (analysis.crisis_detected || analysis.risk_level === 'legal') {
    return 'professional';
  }

  // Tone slider override (1-5 scale)
  if (toneSlider <= 2) {
    return 'friendly';
  } else if (toneSlider >= 4) {
    return 'firm';
  }

  return baseTone || 'professional';
}

