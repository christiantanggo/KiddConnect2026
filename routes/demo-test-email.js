// routes/demo-test-email.js
// Test endpoint to verify email sending works

import express from "express";
const router = express.Router();

router.post("/test", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const { sendEmail } = await import("../services/notifications.js");
    
    const subject = "Test Email from Tavari Demo";
    const bodyText = "This is a test email to verify email sending is working.";
    const bodyHtml = "<p>This is a test email to verify email sending is working.</p>";

    await sendEmail(email, subject, bodyText, bodyHtml, "Tavari Demo", null);

    res.json({
      success: true,
      message: `Test email sent to ${email}. Please check your inbox (and spam folder).`,
    });
  } catch (error) {
    console.error("[Demo Test Email] Error:", error);
    res.status(500).json({
      error: "Failed to send test email",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;













