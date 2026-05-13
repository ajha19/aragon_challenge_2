import { Worker, Job } from 'bullmq';
import { connection, QUEUES, variantQueue } from '../../core/queue/config';
import prisma from '../../core/services/prisma';
import { SharpService } from '../../core/services/sharp';
import logger from '../../core/services/logger';
import { Status } from '@prisma/client';

const worker = new Worker(
  QUEUES.COMPRESSION,
  async (job: Job) => {
    const { mediaId, buffer: inputBuffer } = job.data;
    logger.info(`Starting compression for ${mediaId}`, { jobId: job.id });

    try {
      // 1. Update status to COMPRESSING
      await prisma.media.update({
        where: { id: mediaId },
        data: { status: Status.COMPRESSING },
      });

      const buffer = Buffer.from(inputBuffer.data || inputBuffer);

      // 2. Perform compression
      const { buffer: compressedBuffer, outputSize, compressionRatio } = await SharpService.compress(buffer);

      // 3. Update DB with metrics
      await prisma.media.update({
        where: { id: mediaId },
        data: { 
          outputSize,
          compressionRatio,
        },
      });

      // 4. Hand over to variant generation
      await variantQueue.add(
        'generate-variants',
        { mediaId, buffer: compressedBuffer },
        { jobId: mediaId }
      );

      logger.info(`Compression completed for ${mediaId}`, { compressionRatio, outputSize });
    } catch (error: any) {
      logger.error(`Compression failed for ${mediaId}`, { error: error.message });
      await prisma.media.update({
        where: { id: mediaId },
        data: { 
          status: Status.FAILED,
          failureReason: `Compression stage: ${error.message}`
        },
      });
      throw error;
    }
  },
  { connection, concurrency: 5 }
);

export default worker;
