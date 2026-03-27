// middleware/validator.js
// Input validation middleware

/**
 * Validate email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (basic validation)
 */
export function validatePhoneNumber(phone) {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // Check if it's between 10 and 15 digits (international format)
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Sanitize string input
 */
export function sanitizeString(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Validate business name
 */
export function validateBusinessName(name) {
  if (!name || typeof name !== 'string') return false;
  const sanitized = sanitizeString(name);
  return sanitized.length >= 2 && sanitized.length <= 100;
}

/**
 * Validate FAQ structure
 */
export function validateFAQ(faq) {
  if (!faq || typeof faq !== 'object') return false;
  if (!faq.question || typeof faq.question !== 'string') return false;
  if (!faq.answer || typeof faq.answer !== 'string') return false;
  
  const question = sanitizeString(faq.question);
  const answer = sanitizeString(faq.answer);
  
  return question.length >= 5 && question.length <= 200 &&
         answer.length >= 10 && answer.length <= 500;
}

/**
 * Validate business hours
 */
export function validateBusinessHours(hours) {
  if (!hours || typeof hours !== 'object') return false;
  
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  
  for (const day of days) {
    if (hours[day]) {
      const dayHours = hours[day];
      if (dayHours.closed === true) continue;
      if (dayHours.open && !timeRegex.test(dayHours.open)) return false;
      if (dayHours.close && !timeRegex.test(dayHours.close)) return false;
    }
  }
  
  return true;
}

/**
 * Express middleware to validate request body
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, validator] of Object.entries(schema)) {
      const value = req.body[field];
      
      if (validator.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      if (value !== undefined && value !== null && value !== '' && validator.validate) {
        if (!validator.validate(value)) {
          errors.push(`${field} is invalid`);
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    
    next();
  };
}



















