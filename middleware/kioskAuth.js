// middleware/kioskAuth.js
// Kiosk authentication middleware - validates kiosk access token

import { Business } from '../models/Business.js';
import { supabaseClient } from '../config/database.js';

/**
 * Authenticate kiosk requests using kiosk_access_token
 * Token is passed as query parameter: ?token=xxx or header: Authorization: Bearer xxx
 */
export const authenticateKiosk = async (req, res, next) => {
  try {
    // Get token from query parameter or Authorization header
    const token = req.query.token || 
                  (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                    ? req.headers.authorization.substring(7) 
                    : null);
    
    if (!token) {
      return res.status(401).json({ error: 'Kiosk token required. Provide ?token=xxx in URL or Authorization header.' });
    }
    
    // Find business by kiosk token
    const { data: business, error } = await supabaseClient
      .from('businesses')
      .select('id, name, kiosk_access_token, kiosk_token_created_at')
      .eq('kiosk_access_token', token)
      .single();
    
    if (error || !business) {
      console.error('[Kiosk Auth] Invalid token:', error?.message || 'Business not found');
      return res.status(401).json({ error: 'Invalid kiosk token' });
    }
    
    if (!business.kiosk_access_token) {
      return res.status(401).json({ error: 'Kiosk access not enabled for this business' });
    }
    
    // Attach business info to request
    req.businessId = business.id;
    req.business = business;
    req.kioskToken = token;
    
    console.log(`[Kiosk Auth] ✅ Authenticated kiosk request for business: ${business.name} (${business.id})`);
    
    next();
  } catch (error) {
    console.error('[Kiosk Auth] Error:', error);
    return res.status(401).json({ error: 'Kiosk authentication failed' });
  }
};

