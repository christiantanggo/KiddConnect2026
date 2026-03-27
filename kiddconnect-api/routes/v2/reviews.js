import express from 'express';

const router = express.Router();

// TODO: Implement reviews module routes
// This file is a placeholder - routes should be added here when the reviews module is implemented

// Placeholder route to prevent 404 errors
router.get('/', (req, res) => {
  res.json({ message: 'Reviews module routes - coming soon' });
});

export default router;
