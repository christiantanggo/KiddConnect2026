/**
 * Willie & Billy production API.
 * Queues a short or a chapter. The worker on the API makes the video.
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import {
  enqueueChapter,
  enqueueShort,
  getSchedule,
  listRenders,
  queueToday,
  saveSchedule,
} from '../../services/willie-billy/queue.js';

const router = express.Router();
router.use(authenticate);
router.use(requireBusinessContext);

router.get('/schedule', async (req, res) => {
  try {
    const schedule = await getSchedule(req.active_business_id);
    res.json({ schedule });
  } catch (error) {
    console.error('[WillieBilly] schedule', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.put('/schedule', async (req, res) => {
  try {
    const schedule = await saveSchedule(req.active_business_id, req.body || {});
    res.json({ schedule });
  } catch (error) {
    console.error('[WillieBilly] save schedule', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/renders', async (req, res) => {
  try {
    const renders = await listRenders(req.active_business_id, {
      week: req.query.week,
      limit: req.query.limit,
    });
    res.json({ renders });
  } catch (error) {
    console.error('[WillieBilly] list renders', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/renders', async (req, res) => {
  try {
    const body = req.body || {};
    const force = !!body.force;
    const row = body.kind === 'chapter'
      ? await enqueueChapter(req.active_business_id, body.week, { force })
      : await enqueueShort(req.active_business_id, body.episode, { force });
    res.status(202).json({ render: row });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[WillieBilly] enqueue', error.message);
    res.status(status).json({ error: error.message });
  }
});

router.post('/produce-today', async (req, res) => {
  try {
    const result = await queueToday(req.active_business_id);
    res.status(202).json(result);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[WillieBilly] produce today', error.message);
    res.status(status).json({ error: error.message });
  }
});

export default router;
