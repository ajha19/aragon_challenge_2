import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class CloudinaryService {
  static async uploadFromBuffer(buffer: Buffer, publicId: string, folder: string = 'media-pipeline'): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: folder,
          resource_type: 'image',
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            logger.error('Cloudinary upload failed', { error, publicId });
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Cloudinary upload result is undefined'));
          }
          resolve(result.secure_url);
        }
      );

      uploadStream.end(buffer);
    });
  }

  static async uploadUrl(url: string, publicId: string, folder: string = 'media-pipeline'): Promise<string> {
    try {
      const result = await cloudinary.uploader.upload(url, {
        public_id: publicId,
        folder: folder,
        overwrite: true,
      });
      return result.secure_url;
    } catch (error) {
      logger.error('Cloudinary upload from URL failed', { error, url, publicId });
      throw error;
    }
  }
}
