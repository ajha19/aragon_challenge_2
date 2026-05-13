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
        // Handle both raw buffer and BullMQ's serialized buffer format
        const rawData = initialBuffer.data || initialBuffer;
        buffer = Buffer.from(rawData as any);
      } else if (url) {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        buffer = Buffer.from(response.data as ArrayBuffer);
      } else {
        throw new Error('No image data provided for conversion');
      }

      // 3. Normalize to WebP with Fallback logic
      let normalizedBuffer: Buffer;
      let metadata: any;

      try {
        normalizedBuffer = await SharpService.normalize(buffer);
        metadata = await SharpService.getMetadata(normalizedBuffer);
      } catch (sharpError: any) {
        const errorMessage = (sharpError.message || String(sharpError)).toLowerCase();
        logger.debug(`Checking error for fallback: ${errorMessage}`);

        // Fallback: If local sharp fails due to missing HEIF/HEVC support, use Cloudinary to convert
        if (
          errorMessage.includes('heif') || 
          errorMessage.includes('bad seek') || 
          errorMessage.includes('hevc') ||
          errorMessage.includes('unsupported format')
        ) {
          logger.warn(`Local HEIF processing failed for ${mediaId}, engaging Cloudinary fallback`, { error: errorMessage });
          
          const media = await prisma.media.findUnique({ where: { id: mediaId } });
          if (!media) throw sharpError;

          // Transform the original Cloudinary URL to request a WebP version
          const fallbackUrl = media.originalUrl.replace('/upload/', '/upload/f_webp/');
          const response = await axios.get(fallbackUrl, { responseType: 'arraybuffer' });
          normalizedBuffer = Buffer.from(response.data as ArrayBuffer);
          metadata = await SharpService.getMetadata(normalizedBuffer);
        } else {
          throw sharpError;
        }
      }

      // 4. Update metadata in DB
      await prisma.media.update({
        where: { id: mediaId },
        data: { metadata: metadata as any },
      });

      // 5. Hand over to compression
      await compressionQueue.add(
        'compress',
        { mediaId, buffer: normalizedBuffer },
        { jobId: mediaId }
      );

      logger.info(`Conversion completed for ${mediaId} (Fallback used: ${!normalizedBuffer ? 'No' : 'Yes'})`);
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
