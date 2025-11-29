import sharp from 'sharp';

export class LaplacianDetector {
  constructor() {
    // Laplacian kernel for edge detection
    this.kernel = [
      0, 1, 0,
      1, -4, 1,
      0, 1, 0
    ];
  }

  async calculateBlurScore(imageBuffer) {
    try {
      // Convert to grayscale for processing
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Apply Laplacian operator
      const laplacian = this.applyLaplacian(data, info.width, info.height);

      // Calculate variance
      const variance = this.calculateVariance(laplacian);

      return variance;
    } catch (error) {
      throw new Error(`Failed to calculate blur score: ${error.message}`);
    }
  }

  applyLaplacian(pixels, width, height) {
    const result = new Float32Array(pixels.length);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Apply 3x3 Laplacian kernel
        const sum =
          pixels[(y - 1) * width + x] * 1 +      // top
          pixels[y * width + (x - 1)] * 1 +      // left
          pixels[y * width + x] * -4 +           // center
          pixels[y * width + (x + 1)] * 1 +      // right
          pixels[(y + 1) * width + x] * 1;       // bottom

        result[idx] = sum;
      }
    }

    return result;
  }

  calculateVariance(data) {
    // Calculate mean
    let sum = 0;
    let count = 0;

    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      count++;
    }

    const mean = sum / count;

    // Calculate variance
    let varianceSum = 0;
    for (let i = 0; i < data.length; i++) {
      const diff = data[i] - mean;
      varianceSum += diff * diff;
    }

    return varianceSum / count;
  }

  isBlurry(score, threshold = 100) {
    return score < threshold;
  }
}
