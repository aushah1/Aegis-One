import { Worker } from "bullmq";
import IORedis from "ioredis";
import mongoose from "mongoose";

import Audit from "../../shared/Audit.js";

import { runPsi } from "./checks/psi.js";
import { runHeaders } from "./checks/headers.js";
import { runSsl } from "./checks/ssl.js";
import { runSeo } from "./checks/seo.js";

import { summarize } from "./ai.js";

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/audit";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const AI_TOTAL_TIMEOUT_MS = Number(process.env.AI_TOTAL_TIMEOUT_MS || 190000);

// ---------------- DATABASE ----------------

await mongoose.connect(MONGO_URL);

console.log("[Worker] MongoDB connected");

// ---------------- REDIS ----------------

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on("error", (error) => {
  console.error("[Worker] Redis error:", error.message);
});

await connection.ping();

console.log("[Worker] Redis connected");

// ---------------- TIMEOUT HELPER ----------------

async function withTimeout(promise, milliseconds, taskName) {
  let timer;

  try {
    return await Promise.race([
      promise,

      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`${taskName} timed out after ` + `${milliseconds}ms`),
          );
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- AUDIT PIPELINE ----------------

async function processAudit({ auditId, url }) {
  console.log(`[Audit] Starting ${url}`);

  await Audit.findByIdAndUpdate(auditId, {
    status: "running",
  });

  const jobs = {
    psi: () => runPsi(url),
    headers: () => runHeaders(url),
    ssl: () => runSsl(url),
    seo: () => runSeo(url),
  };

  const results = {};

  // Run website checks independently.
  await Promise.all(
    Object.entries(jobs).map(async ([name, fn]) => {
      await Audit.findByIdAndUpdate(auditId, {
        [`progress.${name}`]: "running",
      });

      try {
        results[name] = await withTimeout(fn(), 55000, name);

        await Audit.findByIdAndUpdate(auditId, {
          [`progress.${name}`]: "done",
          [`checks.${name}`]: results[name],
        });

        console.log(`[Audit] ${name} completed`);
      } catch (error) {
        results[name] = {
          error: error.message,
        };

        await Audit.findByIdAndUpdate(auditId, {
          [`progress.${name}`]: "failed",
          [`checks.${name}`]: {
            error: error.message,
          },
        });

        console.error(`[Audit] ${name} failed:`, error.message);
      }
    }),
  );

  const allFailed = Object.values(results).every((item) => item.error);

  if (allFailed) {
    throw new Error("All website checks failed.");
  }

  // ---------------- AI SUMMARY ----------------

  await Audit.findByIdAndUpdate(auditId, {
    "progress.ai": "running",
  });

  let ai = null;

  try {
    console.log("[AI] Generating website summary...");

    ai = await withTimeout(
      summarize(url, results),
      AI_TOTAL_TIMEOUT_MS,
      "AI summary",
    );

    await Audit.findByIdAndUpdate(auditId, {
      "progress.ai": "done",
    });

    console.log("[AI] Summary generated successfully");
  } catch (error) {
    console.error("[AI] Summary failed:", error.message);

    await Audit.findByIdAndUpdate(auditId, {
      "progress.ai": "failed",
    });
  }

  // Save audit even if AI fails.
  await Audit.findByIdAndUpdate(auditId, {
    status: "done",
    ai,
  });

  console.log(`[Audit] Completed ${url}`);
}

// ---------------- BULLMQ WORKER ----------------

const worker = new Worker(
  "audits",

  async (job) => {
    try {
      await processAudit(job.data);
    } catch (error) {
      await Audit.findByIdAndUpdate(job.data.auditId, {
        status: "failed",
        error: error.message,
      });

      throw error;
    }
  },

  {
    connection,
    concurrency: 2,
    lockDuration: 300000,
  },
);

worker.on("ready", () => {
  console.log("[Worker] BullMQ ready");
});

worker.on("completed", (job) => {
  console.log("[Worker] Audit job completed:", job.data.url);
});

worker.on("failed", (job, error) => {
  console.error("[Worker] Audit failed:", job?.data?.url, error.message);
});

worker.on("error", (error) => {
  console.error("[Worker] Error:", error.message);
});

console.log("[Worker] Waiting for audit jobs...");
