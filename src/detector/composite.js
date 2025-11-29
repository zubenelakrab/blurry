import { LaplacianDetector } from './laplacian.js';
import { GradientDetector } from './gradient.js';
import { TenengradDetector } from './tenengrad.js';
import { VarianceDetector } from './variance.js';

export class CompositeDetector {
  constructor(options = {}) {
    this.laplacian = new LaplacianDetector();
    this.gradient = new GradientDetector();
    this.tenengrad = new TenengradDetector();
    this.variance = new VarianceDetector();

    // Calibration stats for dataset-driven normalization
    this.calibrationStats = options.calibrationStats || null;
    this.useCalibration = !!this.calibrationStats;
  }

  /**
   * Clip value to range [min, max]
   */
  clip(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Normalize using hand-tuned constants (legacy method)
   */
  normalizeHandTuned(laplacianScore, gradientScore, tenengradScore, varianceScore) {
    const normalizedLaplacian = Math.min(100, (laplacianScore / 0.5));
    const normalizedGradient = Math.min(100, (gradientScore / 0.3));

    // Logarithmic scale for Tenengrad
    const tenengradLog = tenengradScore > 0 ? Math.log10(tenengradScore) : 0;
    const normalizedTenengrad = Math.max(0, Math.min(100, ((tenengradLog - 2) / 6) * 100));

    const normalizedVariance = Math.min(100, (varianceScore / 10));

    return {
      laplacian: normalizedLaplacian,
      gradient: normalizedGradient,
      tenengrad: normalizedTenengrad,
      variance: normalizedVariance
    };
  }

  /**
   * Normalize using dataset-driven percentile mapping
   * Maps 5th percentile → 0, 95th percentile → 100
   * Uses logarithmic scaling for Tenengrad due to its huge range
   */
  normalizePercentile(laplacianScore, gradientScore, tenengradScore, varianceScore) {
    const stats = this.calibrationStats;

    const normalizedLaplacian = 100 * this.clip(
      (laplacianScore - stats.laplacian.p5) / (stats.laplacian.p95 - stats.laplacian.p5),
      0, 1
    );

    const normalizedGradient = 100 * this.clip(
      (gradientScore - stats.gradient.p5) / (stats.gradient.p95 - stats.gradient.p5),
      0, 1
    );

    // Use logarithmic scaling for Tenengrad (huge range: ~100 to ~150M)
    // Convert to log space first, then apply percentile mapping
    const tenengradLog = tenengradScore > 0 ? Math.log10(tenengradScore) : 0;
    const p5Log = stats.tenengrad.p5 > 0 ? Math.log10(stats.tenengrad.p5) : 0;
    const p95Log = stats.tenengrad.p95 > 0 ? Math.log10(stats.tenengrad.p95) : 0;

    const normalizedTenengrad = 100 * this.clip(
      (tenengradLog - p5Log) / (p95Log - p5Log),
      0, 1
    );

    const normalizedVariance = 100 * this.clip(
      (varianceScore - stats.variance.p5) / (stats.variance.p95 - stats.variance.p5),
      0, 1
    );

    return {
      laplacian: normalizedLaplacian,
      gradient: normalizedGradient,
      tenengrad: normalizedTenengrad,
      variance: normalizedVariance
    };
  }

  async calculateBlurScore(imageBuffer) {
    try {
      // Calculate scores from all methods
      const [laplacianScore, gradientScore, tenengradScore, varianceScore] = await Promise.all([
        this.laplacian.calculateBlurScore(imageBuffer),
        this.gradient.calculateBlurScore(imageBuffer),
        this.tenengrad.calculateBlurScore(imageBuffer),
        this.variance.calculateBlurScore(imageBuffer)
      ]);

      // Normalize scores using appropriate method
      const normalized = this.useCalibration
        ? this.normalizePercentile(laplacianScore, gradientScore, tenengradScore, varianceScore)
        : this.normalizeHandTuned(laplacianScore, gradientScore, tenengradScore, varianceScore);

      // Weighted average
      // Laplacian and Tenengrad get more weight as they're most reliable
      const compositeScore = (
        normalized.laplacian * 0.30 +
        normalized.gradient * 0.20 +
        normalized.tenengrad * 0.40 +
        normalized.variance * 0.10
      );

      return {
        composite: compositeScore,
        laplacian: laplacianScore,
        gradient: gradientScore,
        tenengrad: tenengradScore,
        variance: varianceScore,
        normalized: {
          laplacian: normalized.laplacian,
          gradient: normalized.gradient,
          tenengrad: normalized.tenengrad,
          variance: normalized.variance
        }
      };
    } catch (error) {
      throw new Error(`Failed to calculate composite score: ${error.message}`);
    }
  }

  isBlurry(scores, threshold = 30) {
    // Use composite score for decision
    return scores.composite < threshold;
  }
}
