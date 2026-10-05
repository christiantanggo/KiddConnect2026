// routes/contact.js
// Public "Contact Us" form on the Le Fournier home page → email to the site owner.

import express from 'express';
import { sendEmail } from '../services/notifications.js';

const router = express.Router();

const CONTACT_TO = (process.env.CONTACT_FORM_TO || 'christian.fournier@tanggo.ca').trim();
const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.post('/', async (req, res) => {
  const body = req.body || {};

  // Honeypot: real visitors never see this field, so pretend success for bots.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.json({ success: true });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!name || name.length > MAX_NAME) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!message || message.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `Please enter a message (up to ${MAX_MESSAGE} characters).` });
  }

  const singleLineName = name.replace(/[\r\n]+/g, ' ');
  const subject = `Le Fournier contact: ${singleLineName}`;
  const replyHref = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Re: your message to Le Fournier')}`;

  const text = [
    'New message from the Le Fournier contact form.',
    '',
    `Name: ${singleLineName}`,
    `Email: ${email}`,
    '',
    message,
    '',
    `Reply by emailing ${email} directly.`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; color: #1c1917;">
      <h2 style="margin: 0 0 16px;">New message from the Le Fournier contact form</h2>
      <p style="margin: 0 0 4px;"><strong>Name:</strong> ${escapeHtml(singleLineName)}</p>
      <p style="margin: 0 0 16px;"><strong>Email:</strong> <a href="${escapeHtml(replyHref)}">${escapeHtml(email)}</a></p>
      <div style="white-space: pre-wrap; padding: 16px; background: #f5f5f4; border-radius: 8px;">${escapeHtml(message)}</div>
      <p style="margin: 24px 0 0;">
        <a href="${escapeHtml(replyHref)}" style="display: inline-block; padding: 10px 20px; background: #1c1917; color: #fef3c7; text-decoration: none; border-radius: 999px;">Reply to ${escapeHtml(singleLineName)}</a>
      </p>
    </div>`;

  try {
    await sendEmail(CONTACT_TO, subject, text, html, 'Le Fournier');
    return res.json({ success: true });
  } catch (err) {
    console.error('[Contact] Failed to send contact email:', err?.message || err);
    return res.status(502).json({ error: 'Sorry, your message could not be sent. Please try again later.' });
  }
});

export default router;
