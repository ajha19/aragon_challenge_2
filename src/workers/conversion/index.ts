import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { connection, QUEUES, compressionQueue } from '../../core/queue/config';
import prisma from '../../core/services/prisma';
import { SharpService } from '../../core/services/sharp';
import logger from '../../core/services/logger';
import { Status } from '@prisma/client';

const worker = new Worker(
  QUEUES.CONVERSION,
  async (job: Job) => {
    const { mediaId, buffer: initialBuffer, url } = job.data;
    logger.info(`Starting conversion for ${mediaId}`, { jobId: job.id });

    try {
      // 1. Update status to CONVERTING
      await prisma.media.update({
        where: { id: mediaId },
        data: { status: Status.CONVERTING },
      });

      // 2. Get buffer (from data or URL)
      let buffer: Buffer;
      if (initialBuffer) {
        buffer = Buffer.from(initialBuffer.data || initialBuffer);
      } else if (url) {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        buffer = Buffer.from(response.data);
      } else {
        throw new Error('No image data provided for conversion');
      }

      // 3. Normalize to WebP
      const normalizedBuffer = await SharpService.normalize(buffer);
      const metadata = await SharpService.getMetadata(normalizedBuffer);

      // 4. Update metadata in DB
      await prisma.media.update({
        where: { id: mediaId },
        data: { metadata: metadata as any },
      });

      // 5. Hand over to compression
      await compressionQueue.add(
        'compress',
        { mediaId, buffer: normalizedBuffer },
        { jobId: mediaId } // Keep the chain traceable
      );

      logger.info(`Conversion completed for ${mediaId}`);
    } catch (error: any) {
      logger.error(`Conversion failed for ${mediaId}`, { error: error.message });
      await prisma.media.update({
        where: { id: mediaId },
        data: { 
          status: Status.FAILED,
          failureReason: `Conversion stage: ${error.message}`
        },
      });
      throw error;
    }
  },
  { connection, concurrency: 5 }
);

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed in conversion queue`, { err });
});

export default worker;
