import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    url: { type: String, required: true, index: true },
    status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    progress: { type: mongoose.Schema.Types.Mixed, default: {} }, // { psi: 'running'|'done'|'failed', ... }
    checks: { type: mongoose.Schema.Types.Mixed, default: {} },   // raw results per check
    ai: { type: mongoose.Schema.Types.Mixed, default: null },     // AI summary JSON
    error: String,
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // TTL: 30 days
  },
  { minimize: false }
);

export default mongoose.models.Audit || mongoose.model('Audit', schema);
