/**
 * Business Content Scraper
 * Fetches and analyzes business website and social media content
 * to provide better context for AI-generated responses
 */

import { ModuleSettings } from '../models/v2/ModuleSettings.js';

/**
 * Scrape business content from website and social media
 * Stores extracted content in module_settings for use in AI prompts
 */
export async function scrapeBusinessContent(businessId, urls) {
  try {
    console.log(`[Business Scraper] Starting content scrape for business ${businessId}`);
    
    const scrapedContent = {
      website_content: null,
      social_content: {
        facebook: null,
        instagram: null,
        tiktok: null
      },
      scraped_at: new Date().toISOString()
    };

    // Scrape website if provided
    if (urls.website) {
      try {
        const websiteContent = await fetchWebsiteContent(urls.website);
        scrapedContent.website_content = websiteContent;
        console.log(`[Business Scraper] Website content scraped: ${websiteContent?.length || 0} characters`);
      } catch (error) {
        console.error(`[Business Scraper] Failed to scrape website ${urls.website}:`, error.message);
      }
    }

    // Note: Social media scraping requires APIs or more sophisticated tools
    // For now, we'll store the URLs and could implement scraping later
    // Facebook/Instagram/TikTok require API access or browser automation
    
    // Save scraped content to module settings
    const moduleSettings = await ModuleSettings.findByBusinessAndModule(businessId, 'reviews');
    if (moduleSettings) {
      const updatedSettings = {
        ...moduleSettings.settings,
        scraped_content: scrapedContent
      };
      await ModuleSettings.update(businessId, 'reviews', updatedSettings);
      console.log(`[Business Scraper] Scraped content saved to module settings`);
    }

    return scrapedContent;
  } catch (error) {
    console.error('[Business Scraper] Error scraping business content:', error);
    throw error;
  }
}

/**
 * Fetch website content
 * Basic implementation - can be enhanced with proper scraping tools
 */
async function fetchWebsiteContent(url) {
  try {
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL');
    }

    // Ensure URL has protocol
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      fullUrl = `https://${url}`;
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(fullUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KiddConnect/1.0; +https://www.kiddconnect.com)'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Extract text content (basic implementation)
      // Remove scripts, styles, and extract visible text
      const textContent = extractTextFromHTML(html);
      
      // Limit to first 5000 characters to avoid token limits
      return textContent.substring(0, 5000);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error(`[fetchWebsiteContent] Error fetching ${url}:`, error.message);
    throw error;
  }
}

/**
 * Extract text content from HTML
 * Basic implementation - could be enhanced with proper HTML parsing
 */
function extractTextFromHTML(html) {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities (basic)
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Fetch social media content (placeholder for future implementation)
 * Requires API access or browser automation tools
 */
async function fetchSocialMediaContent(platform, url) {
  // TODO: Implement with appropriate APIs or scraping tools
  // - Facebook: Requires Graph API access
  // - Instagram: Requires Instagram Basic Display API or scraping
  // - TikTok: Requires TikTok API or scraping
  
  console.log(`[Business Scraper] Social media scraping not yet implemented for ${platform}`);
  return null;
}





