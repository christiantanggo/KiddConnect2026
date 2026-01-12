import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { User } from '../../models/User.js';

const router = express.Router();

/**
 * POST /api/v2/auth/accept-terms
 * Accept Terms of Service and Privacy Policy
 */
router.post('/accept-terms', authenticate, async (req, res) => {
  try {
    const { terms_version } = req.body;
    const currentTermsVersion = process.env.CURRENT_TERMS_VERSION || '1.0.0';

    if (!terms_version) {
      return res.status(400).json({ error: 'Terms version is required' });
    }

    // Update user's terms acceptance
    const updateData = {
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
      terms_version: terms_version || currentTermsVersion,
      terms_accepted_ip: req.ip,
      updated_at: new Date().toISOString(),
    };
    
    await User.update(req.user.id, updateData);

    res.json({
      success: true,
      message: 'Terms and Privacy Policy accepted',
      terms_version: terms_version || currentTermsVersion,
    });
  } catch (error) {
    console.error('[POST /api/v2/auth/accept-terms] Error:', error);
    res.status(500).json({ error: 'Failed to accept terms' });
  }
});

export default router;

