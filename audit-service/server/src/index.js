import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import { Queue } from 'bullmq';
import Audit from '../../shared/Audit.js';
import { assertPublicUrl } from '../../shared/ssrf.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin(origin, cb) { if (!origin || origin === (process.env.CLIENT_ORIGIN || 'http://localhost:5173') || /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return cb(null, true); return cb(new Error('Origin not allowed')); } }));
app.use(express.json({ limit: '10kb' }));

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('audits', { connection });

const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true });

// 1) Start an audit (reuses a fresh result from the last 24h if one exists)
app.post('/api/audits', createLimiter, async (req, res) => {
  try {
    const u = await assertPublicUrl(req.body?.url);
    const url = u.toString();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cached = await Audit.findOne({
      url,
      status: 'done',
      ai: { $ne: null }, // don't reuse a run whose AI summary failed
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 });
    if (cached) return res.json({ id: cached.id, cached: true });

    const audit = await Audit.create({ url });
    await queue.add('audit', { auditId: audit.id, url }, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    res.status(202).json({ id: audit.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2) Fetch an audit
app.get('/api/audits/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const audit = await Audit.findById(req.params.id).lean();
  if (!audit) return res.status(404).json({ error: 'Not found' });
  res.json(audit);
});

// 3) Live progress via Server-Sent Events (polls Mongo once a second)
app.get('/api/audits/:id/events', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  let lastSent = '';
  const tick = async () => {
    const audit = await Audit.findById(req.params.id).lean();
    if (!audit) return res.end();
    const payload = JSON.stringify(audit);
    if (payload !== lastSent) {
      res.write(`data: ${payload}\n\n`);
      lastSent = payload;
    }
    if (audit.status === 'done' || audit.status === 'failed') {
      clearInterval(timer);
      res.end();
    }
  };
  const timer = setInterval(() => tick().catch(() => {}), 1000);
  tick().catch(() => {});
  req.on('close', () => clearInterval(timer));
});

await mongoose.connect(process.env.MONGO_URL);
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
