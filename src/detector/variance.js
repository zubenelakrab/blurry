import sharp from 'sharp';

export class VarianceDetector {
  async calculateBlurScore(imageBuffer) {
    try {
      // Convert to grayscale
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Calculate normalized graylevel variance
      const variance = this.calculateVariance(data);

      return variance;
    } catch (error) {
      throw new Error(`Failed to calculate variance score: ${error.message}`);
    }
  }

  calculateVariance(pixels) {
    // Calculate mean
    let sum = 0;
    for (let i = 0; i < pixels.length; i++) {
      sum += pixels[i];
    }
    const mean = sum / pixels.length;

    // Calculate variance
    let varianceSum = 0;
    for (let i = 0; i < pixels.length; i++) {
      const diff = pixels[i] - mean;
      varianceSum += diff * diff;
    }
    const variance = varianceSum / pixels.length;

    return variance;
  }

  isBlurry(score, threshold = 100) {
    return score < threshold;
  }
}
