import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const verifyOrderQueue = new Queue('verify-order', {
  connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
});

export function createVerifyOrderWorker(processor: (job: any) => Promise<void>) {
  return new Worker('verify-order', processor, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
  });
}
