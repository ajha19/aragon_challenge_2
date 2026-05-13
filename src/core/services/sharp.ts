import sharp from 'sharp';
import logger from './logger';

export class SharpService {
  static async normalize(buffer: Buffer): Promise<Buffer> {
    try {
      // Convert to WebP by default as a "normalized" format
      return await sharp(buffer)
        .rotate() // Handle EXIF orientation
        .toFormat('webp', { quality: 100 })
        .toBuffer();
    } catch (error) {
      logger.error('Sharp normalization failed', { error });
      throw error;
    }
  }

  static async compress(buffer: Buffer): Promise<{ buffer: Buffer; outputSize: number; compressionRatio: number }> {
    try {
      const originalSize = buffer.length;
      const optimizedBuffer = await sharp(buffer)
        .webp({ quality: 80, effort: 6 })
        .toBuffer();
      
      const outputSize = optimizedBuffer.length;
      const compressionRatio = parseFloat((originalSize / outputSize).toFixed(2));

      return {
        buffer: optimizedBuffer,
        outputSize,
        compressionRatio,
      };
    } catch (error) {
      logger.error('Sharp compression failed', { error });
      throw error;
    }
  }

  static async resize(buffer: Buffer, width: number): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(width, null, { withoutEnlargement: true })
        .toBuffer();
    } catch (error) {
      logger.error('Sharp resize failed', { error, width });
      throw error;
    }
  }

  static async getMetadata(buffer: Buffer) {
    try {
      return await sharp(buffer).metadata();
    } catch (error) {
      logger.error('Sharp metadata extraction failed', { error });
      throw error;
    }
  }
}
