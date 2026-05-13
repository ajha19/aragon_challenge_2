import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../core/services/prisma';
import { CloudinaryService } from '../../core/services/cloudinary';
import { conversionQueue, compressionQueue, variantQueue } from '../../core/queue/config';
import logger from '../../core/services/logger';
import { Status } from '@prisma/client';

export class MediaController {
  static async upload(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const mediaId = uuidv4();
      logger.info('Received upload request', { mediaId, originalName: file.originalname });

      // 1. Upload original to Cloudinary (raw/backup)
      const originalUrl = await CloudinaryService.uploadFromBuffer(file.buffer, `${mediaId}_original`);

      // 2. Create database record
      const media = await prisma.media.create({
        data: {
          id: mediaId,
          originalUrl,
          status: Status.PENDING,
        },
      });

      // 3. Add to conversion queue
      await conversionQueue.add(
        'convert',
        { mediaId, buffer: file.buffer },
        { jobId: mediaId } // Idempotency
      );

      res.status(202).json({
        message: 'Upload successful, processing started',
        mediaId: media.id,
        status: media.status,
      });
    } catch (error) {
      logger.error('Upload handler failed', { error });
      res.status(500).json({ error: 'Internal server error during upload' });
    }
  }

  static async getStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const media = await prisma.media.findUnique({
        where: { id },
        include: { variants: true },
      });

      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }

      res.json(media);
    } catch (error) {
      logger.error('Get status handler failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async reprocess(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const media = await prisma.media.findUnique({ where: { id } });

      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }

      logger.info('Reprocessing request received', { mediaId: id });

      // 1. Force remove existing jobs from all queues to bypass BullMQ idempotency lock
      // This is necessary because BullMQ won't rerun a job if a completed/failed job with the same ID exists.
      const queues = [conversionQueue, compressionQueue, variantQueue];
      for (const queue of queues) {
        const job = await queue.getJob(id);
        if (job) {
          await job.remove();
          logger.info(`Removed stale job from ${queue.name}`, { mediaId: id });
        }
      }

      // 2. Reset status and failure reason in database
      await prisma.media.update({
        where: { id },
        data: {
          status: Status.PENDING,
          failureReason: null,
          compressionRatio: null,
          outputSize: null,
        },
      });

      // 3. Restart pipeline using the original backup URL
      await conversionQueue.add(
        'convert',
        { mediaId: id, url: media.originalUrl },
        { jobId: id, removeOnComplete: true }
      );

      res.json({ message: 'Pipeline restarted successfully', mediaId: id });
    } catch (error) {
      logger.error('Reprocess handler failed', { error });
      res.status(500).json({ error: 'Internal server error during reprocessing' });
    }
  }
}
