import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const QUEUES = {
  CONVERSION: 'conversion-queue',
  COMPRESSION: 'compression-queue',
  VARIANT: 'variant-queue',
};

export const conversionQueue = new Queue(QUEUES.CONVERSION, { connection });
export const compressionQueue = new Queue(QUEUES.COMPRESSION, { connection });
export const variantQueue = new Queue(QUEUES.VARIANT, { connection });

export { connection };
