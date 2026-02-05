import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: '../.env' });

import authRoutes from './routes/auth';
import campaignRoutes from './routes/campaigns';
import offerRoutes from './routes/offers';
import orderRoutes from './routes/orders';
import { errorHandler, notFoundHandler } from './middleware/error';
import { createVerifyOrderWorker } from './lib/queue';
import { processVerifyOrder } from './jobs/verify-order';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/', offerRoutes); // mounted at / because it has /campaigns/:id/offers and /offers/:id/...
app.use('/orders', orderRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shillmarket-backend' });
});

// Serve skill.md
app.get('/skill.md', (_req, res) => {
  const skillPath = path.resolve(__dirname, '..', 'skill.md');
  if (fs.existsSync(skillPath)) {
    res.type('text/markdown').send(fs.readFileSync(skillPath, 'utf-8'));
  } else {
    res.status(404).json({ error: 'skill.md not found' });
  }
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ShillMarket backend running on port ${PORT}`);

  // Start verification worker
  try {
    const worker = createVerifyOrderWorker(processVerifyOrder);
    worker.on('completed', (job) => {
      console.log(`[worker] Job ${job.id} completed`);
    });
    worker.on('failed', (job, err) => {
      console.error(`[worker] Job ${job?.id} failed:`, err);
    });
    worker.on('error', (err) => {
      console.error('[worker] Worker error:', err.message);
    });
    console.log('Verification worker started');
  } catch (err) {
    console.error('[worker] Failed to start verification worker:', err);
  }
});

export default app;
