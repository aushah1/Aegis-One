import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import Audit from '../../shared/Audit.js';
import { runPsi } from './checks/psi.js';
import { runHeaders } from './checks/headers.js';
import { runSsl } from './checks/ssl.js';
import { runSeo } from './checks/seo.js';
import { summarize } from './ai.js';

await mongoose.connect(process.env.MONGO_URL);
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const withTimeout = (p, ms, name) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${name} timed out`)), ms))]);

async function processAudit({ auditId, url }) {
  await Audit.findByIdAndUpdate(auditId, { status: 'running' });

  const jobs = {
    psi: () => runPsi(url),
    headers: () => runHeaders(url),
    ssl: () => runSsl(url),
    seo: () => runSeo(url),
  };

  // Run all checks in parallel; one failure never kills the audit.
  const results = {};
  await Promise.all(
    Object.entries(jobs).map(async ([name, fn]) => {
      await Audit.findByIdAndUpdate(auditId, { [`progress.${name}`]: 'running' });
      try {
        results[name] = await withTimeout(fn(), 55_000, name);
        await Audit.findByIdAndUpdate(auditId, {
          [`progress.${name}`]: 'done',
          [`checks.${name}`]: results[name],
        });
      } catch (err) {
        results[name] = { error: err.message };
        await Audit.findByIdAndUpdate(auditId, {
          [`progress.${name}`]: 'failed',
          [`checks.${name}`]: { error: err.message },
        });
      }
    })
  );

  if (Object.values(results).every((r) => r.error)) {
    throw new Error('All checks failed. The site may be blocking automated requests.');
  }

  await Audit.findByIdAndUpdate(auditId, { 'progress.ai': 'running' });
  let ai = null;
  try {
    ai = await withTimeout(summarize(url, results), 30_000, 'ai');
    await Audit.findByIdAndUpdate(auditId, { 'progress.ai': 'done' });
  } catch (err) {
    await Audit.findByIdAndUpdate(auditId, { 'progress.ai': 'failed' });
    console.error('AI summary failed:', err.message);
  }

  await Audit.findByIdAndUpdate(auditId, { status: 'done', ai });
}

const worker = new Worker(
  'audits',
  async (job) => {
    try {
      await processAudit(job.data);
    } catch (err) {
      await Audit.findByIdAndUpdate(job.data.auditId, { status: 'failed', error: err.message });
      throw err;
    }
  },
  { connection, concurrency: 2 }
);

worker.on('completed', (job) => console.log('audit done', job.data.url));
worker.on('failed', (job, err) => console.error('audit failed', job?.data?.url, err.message));
console.log('Worker ready');
