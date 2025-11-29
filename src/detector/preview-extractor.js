import { exiftool } from 'exiftool-vendored';
import sharp from 'sharp';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export class PreviewExtractor {
  async extract(filePath) {
    try {
      // Try different preview tags in order of preference (largest/best quality first)
      const tagsToTry = ['PreviewImage', 'JpgFromRaw', 'OtherImage', 'ThumbnailImage'];

      for (const tag of tagsToTry) {
        try {
          const buffer = await exiftool.extractBinaryTagToBuffer(tag, filePath);
          if (buffer && buffer.length > 0) {
            return sharp(buffer);
          }
        } catch (err) {
          // Tag doesn't exist or couldn't be extracted, try next one
          continue;
        }
      }

      throw new Error('No preview image found in RAW file');
    } catch (error) {
      throw new Error(`Failed to extract preview from ${filePath}: ${error.message}`);
    }
  }

  async extractToFile(filePath, outputPath) {
    const image = await this.extract(filePath);
    await image.toFile(outputPath);
    return outputPath;
  }

  async close() {
    // Clean up exiftool process
    await exiftool.end();
  }
}
