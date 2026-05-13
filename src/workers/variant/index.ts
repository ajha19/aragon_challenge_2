import { Worker, Job } from 'bullmq';
import { connection, QUEUES } from '../../core/queue/config';
import prisma from '../../core/services/prisma';
import { SharpService } from '../../core/services/sharp';
import { CloudinaryService } from '../../core/services/cloudinary';
import logger from '../../core/services/logger';
import { Status, VariantType } from '@prisma/client';

const worker = new Worker(
  QUEUES.VARIANT,
  async (job: Job) => {
    const { mediaId, buffer: inputBuffer } = job.data;
    logger.info(`Starting variant generation for ${mediaId}`, { jobId: job.id });

    try {
      // 1. Update status to GENERATING_VARIANTS
      await prisma.media.update({
        where: { id: mediaId },
        data: { status: Status.GENERATING_VARIANTS },
      });

      const buffer = Buffer.from(inputBuffer.data || inputBuffer);

      // Define variants to generate
      const variantConfigs = [
        { type: VariantType.THUMBNAIL, width: 200 },
        { type: VariantType.WEB, width: 800 },
        { type: VariantType.FULL, width: null }, // Null means original size
      ];

      // 2. Generate and upload each variant
      for (const config of variantConfigs) {
        let variantBuffer = buffer;
        if (config.width) {
          variantBuffer = await SharpService.resize(buffer, config.width);
        }

        const publicId = `${mediaId}_${config.type.toLowerCase()}`;
        const url = await CloudinaryService.uploadFromBuffer(variantBuffer, publicId, 'variants');

        // Upsert variant record (Idempotency: if re-running, update existing)
        await prisma.variant.upsert({
          where: { id: `${mediaId}_${config.type}` }, // We'll use a deterministic ID for variant records too
          create: {
            id: `${mediaId}_${config.type}`,
            mediaId,
            type: config.type,
            url,
          },
          update: {
            url,
          },
        });
        
        logger.info(`Generated variant ${config.type} for ${mediaId}`);
      }

      // 3. Mark as COMPLETED
      await prisma.media.update({
        where: { id: mediaId },
        data: { status: Status.COMPLETED },
      });

      logger.info(`Variant generation completed for ${mediaId}`);
    } catch (error: any) {
      logger.error(`Variant generation failed for ${mediaId}`, { error: error.message });
      await prisma.media.update({
        where: { id: mediaId },
        data: { 
          status: Status.FAILED,
          failureReason: `Variant stage: ${error.message}`
        },
      });
      throw error;
    }
  },
  { connection, concurrency: 5 }
);

export default worker;
