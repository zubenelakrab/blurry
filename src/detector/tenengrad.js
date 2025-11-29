import sharp from 'sharp';

export class TenengradDetector {
  constructor() {
    // Sobel kernels
    this.sobelX = [
      -1, 0, 1,
      -2, 0, 2,
      -1, 0, 1
    ];

    this.sobelY = [
      -1, -2, -1,
       0,  0,  0,
       1,  2,  1
    ];
  }

  async calculateBlurScore(imageBuffer) {
    try {
      // Convert to grayscale
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Calculate gradients
      const { gx, gy } = this.calculateGradients(data, info.width, info.height);

      // Calculate squared gradient magnitude
      const squaredMagnitude = new Float32Array(gx.length);
      for (let i = 0; i < gx.length; i++) {
        squaredMagnitude[i] = gx[i] * gx[i] + gy[i] * gy[i];
      }

      // Calculate variance of squared magnitude (Tenengrad)
      const mean = squaredMagnitude.reduce((a, b) => a + b, 0) / squaredMagnitude.length;
      let varianceSum = 0;
      for (let i = 0; i < squaredMagnitude.length; i++) {
        const diff = squaredMagnitude[i] - mean;
        varianceSum += diff * diff;
      }
      const variance = varianceSum / squaredMagnitude.length;

      return variance;
    } catch (error) {
      throw new Error(`Failed to calculate Tenengrad score: ${error.message}`);
    }
  }

  calculateGradients(pixels, width, height) {
    const gx = new Float32Array(pixels.length);
    const gy = new Float32Array(pixels.length);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Apply Sobel X kernel
        let sumX = 0;
        sumX += pixels[(y - 1) * width + (x - 1)] * -1;
        sumX += pixels[(y - 1) * width + (x + 1)] * 1;
        sumX += pixels[y * width + (x - 1)] * -2;
        sumX += pixels[y * width + (x + 1)] * 2;
        sumX += pixels[(y + 1) * width + (x - 1)] * -1;
        sumX += pixels[(y + 1) * width + (x + 1)] * 1;

        // Apply Sobel Y kernel
        let sumY = 0;
        sumY += pixels[(y - 1) * width + (x - 1)] * -1;
        sumY += pixels[(y - 1) * width + x] * -2;
        sumY += pixels[(y - 1) * width + (x + 1)] * -1;
        sumY += pixels[(y + 1) * width + (x - 1)] * 1;
        sumY += pixels[(y + 1) * width + x] * 2;
        sumY += pixels[(y + 1) * width + (x + 1)] * 1;

        gx[idx] = sumX;
        gy[idx] = sumY;
      }
    }

    return { gx, gy };
  }

  isBlurry(score, threshold = 1000) {
    return score < threshold;
  }
}
