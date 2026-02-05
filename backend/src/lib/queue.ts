import { Queue, Worker } from 'bullmq';
import redis from './redis';

export const verifyOrderQueue = new Queue('verify-order', {
  connection: redis,
});

export function createVerifyOrderWorker(processor: (job: any) => Promise<void>) {
  return new Worker('verify-order', processor, {
    connection: redis,
  });
}
