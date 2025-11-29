import sharp from 'sharp';
import { CompositeDetector } from './composite.js';

/**
 * Patch-based blur detector
 * Divides image into patches and analyzes each separately
 * Uses smart aggregation to handle small subjects in large backgrounds
 */
export class PatchBasedDetector {
  constructor(options = {}) {
    this.compositeDetector = new CompositeDetector(options);
    this.patchSize = options.patchSize || 8; // 8x8 grid by default
    this.calibrationStats = options.calibrationStats || null;
  }

  /**
   * Divide image into patches
   */
  async divideIntoPatches(imageBuffer, patchesX, patchesY) {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    const patchWidth = Math.floor(width / patchesX);
    const patchHeight = Math.floor(height / patchesY);

    const patches = [];

    for (let y = 0; y < patchesY; y++) {
      for (let x = 0; x < patchesX; x++) {
        const left = x * patchWidth;
        const top = y * patchHeight;

        // Extract patch - clone the image instance to avoid re-decoding
        const patchBuffer = await image
          .clone()
          .extract({
            left: left,
            top: top,
            width: patchWidth,
            height: patchHeight
          })
          .toBuffer();

        patches.push({
          x: x,
          y: y,
          left: left,
          top: top,
          width: patchWidth,
          height: patchHeight,
          buffer: patchBuffer
        });
      }
    }

    return patches;
  }

  /**
   * Compute percentile from array
   */
  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Calculate center-weighted score
   * Patches near center get more weight
   */
  calculateCenterWeighted(patchScores, patchesX, patchesY) {
    let weightedSum = 0;
    let totalWeight = 0;

    const centerX = (patchesX - 1) / 2;
    const centerY = (patchesY - 1) / 2;

    for (let i = 0; i < patchScores.length; i++) {
      const x = i % patchesX;
      const y = Math.floor(i / patchesX);

      // Distance from center (normalized to 0-1)
      const dx = (x - centerX) / centerX;
      const dy = (y - centerY) / centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Gaussian weight (higher at center)
      // sigma = 0.5 means center patches get ~4x weight vs corners
      const weight = Math.exp(-distance * distance / (2 * 0.5 * 0.5));

      weightedSum += patchScores[i].composite * weight;
      totalWeight += weight;
    }

    return weightedSum / totalWeight;
  }

  /**
   * Helper function for subject-focus variants
   * @param patchScores - Array of patch scores
   * @param patchesX - Grid width
   * @param patchesY - Grid height
   * @param topPercent - Percentage of top patches to use (0.0-1.0)
   * @param sigma - Gaussian sigma for position weighting (higher = less center bias)
   */
  calculateSubjectFocusVariant(patchScores, patchesX, patchesY, topPercent, sigma) {
    const centerX = (patchesX - 1) / 2;
    const centerY = (patchesY - 1) / 2;

    // Add position weights to each patch score
    const scoredPatches = patchScores.map((score, i) => {
      const x = i % patchesX;
      const y = Math.floor(i / patchesX);

      // Distance from center (normalized)
      const dx = (x - centerX) / centerX;
      const dy = (y - centerY) / centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Gaussian position weight
      const positionWeight = Math.exp(-distance * distance / (2 * sigma * sigma));

      return {
        composite: score.composite,
        positionWeight: positionWeight,
        index: i
      };
    });

    // Sort by composite score (highest first)
    scoredPatches.sort((a, b) => b.composite - a.composite);

    // Take top N patches
    const topN = Math.max(3, Math.ceil(patchScores.length * topPercent));
    const topPatches = scoredPatches.slice(0, topN);

    // Average top patches with position weighting
    let weightedSum = 0;
    let totalWeight = 0;

    for (const patch of topPatches) {
      weightedSum += patch.composite * patch.positionWeight;
      totalWeight += patch.positionWeight;
    }

    return weightedSum / totalWeight;
  }

  /**
   * Subject-focus aggressive: Top 5-8% patches, minimal center bias
   * Closer to max-focus, catches more sharp images
   */
  calculateSubjectFocusAggressive(patchScores, patchesX, patchesY) {
    return this.calculateSubjectFocusVariant(patchScores, patchesX, patchesY, 0.08, 1.5);
  }

  /**
   * Subject-focus (balanced): Top 10-12% patches, mild center bias
   * Good middle ground
   */
  calculateSubjectFocus(patchScores, patchesX, patchesY) {
    return this.calculateSubjectFocusVariant(patchScores, patchesX, patchesY, 0.12, 1.0);
  }

  /**
   * Subject-focus conservative: Top 15-20% patches, moderate center bias
   * Closer to center-weighted, more strict
   */
  calculateSubjectFocusConservative(patchScores, patchesX, patchesY) {
    return this.calculateSubjectFocusVariant(patchScores, patchesX, patchesY, 0.18, 0.7);
  }

  /**
   * Subject-focus relaxed: Top 25-30% patches, strong center bias
   * Between conservative and center-weighted
   */
  calculateSubjectFocusRelaxed(patchScores, patchesX, patchesY) {
    return this.calculateSubjectFocusVariant(patchScores, patchesX, patchesY, 0.28, 0.5);
  }

  /**
   * Subject-focus strict: Top 35-40% patches, very strong center bias
   * Between relaxed and center-weighted
   */
  calculateSubjectFocusStrict(patchScores, patchesX, patchesY) {
    return this.calculateSubjectFocusVariant(patchScores, patchesX, patchesY, 0.38, 0.4);
  }

  /**
   * Subject-focus very strict: Top 40% patches, extreme center bias
   * Very close to center-weighted but still selective
   */
  calculateSubjectFocusVeryStrict(patchScores, patchesX, patchesY) {
    return this.calculateSubjectFocusVariant(patchScores, patchesX, patchesY, 0.40, 0.35);
  }

  /**
   * Peak-focus strategy: Uses only the top 2-3 sharpest patches and operates on
   * RAW algorithm scores (not normalized composite) to avoid the 100-cap issue.
   * This focuses on PEAK sharpness quality rather than quantity of sharp patches.
   *
   * For images with small subjects (birds, airplanes), the sharpest 2-3 patches
   * are what matter - not how many "pretty good" patches exist.
   *
   * Example:
   *   Image A: Top 3 patches have Tenengrad scores of 520M, 496M, 315M (avg=444M)
   *   Image B: Top 3 patches have Tenengrad scores of 302M, 292M, 196M (avg=263M)
   *   Result: Image A scores higher because its PEAK sharpness is superior
   */
  calculatePeakFocus(patchScores, patchesX, patchesY) {
    // Sort patches by composite score to identify the sharpest regions
    const sorted = [...patchScores].sort((a, b) => b.composite - a.composite);

    // Take only top 3 patches - focusing on PEAK quality, not averaging many patches
    const topPatches = sorted.slice(0, 3);

    // Average the RAW Tenengrad scores (most reliable for peak sharpness)
    const avgTenengrad = topPatches.reduce((sum, p) => sum + p.tenengrad, 0) / topPatches.length;

    // Normalize using calibration stats with logarithmic scaling
    if (this.calibrationStats && this.calibrationStats.tenengrad) {
      const tenengradLog = avgTenengrad > 0 ? Math.log10(avgTenengrad) : 0;
      const p5Log = this.calibrationStats.tenengrad.p5 > 0 ? Math.log10(this.calibrationStats.tenengrad.p5) : 0;
      const p95Log = this.calibrationStats.tenengrad.p95 > 0 ? Math.log10(this.calibrationStats.tenengrad.p95) : 0;

      const normalized = 100 * this.clip((tenengradLog - p5Log) / (p95Log - p5Log), 0, 1);
      return normalized;
    } else {
      // Fallback if no calibration stats available
      const tenengradLog = avgTenengrad > 0 ? Math.log10(avgTenengrad) : 0;
      // Use empirical range: log10(1000) = 3.0 to log10(1000000000) = 9.0
      const normalized = 100 * this.clip((tenengradLog - 3.0) / (9.0 - 3.0), 0, 1);
      return normalized;
    }
  }

  /**
   * Helper function to clip values between min and max
   */
  clip(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Calculate blur map and aggregate scores
   */
  async calculateBlurScore(imageBuffer) {
    try {
      // Divide into patches
      const patchesX = this.patchSize;
      const patchesY = this.patchSize;
      const patches = await this.divideIntoPatches(imageBuffer, patchesX, patchesY);

      // Calculate score for each patch
      const patchScores = [];
      for (const patch of patches) {
        const score = await this.compositeDetector.calculateBlurScore(patch.buffer);
        patchScores.push({
          composite: score.composite,
          laplacian: score.laplacian,
          gradient: score.gradient,
          tenengrad: score.tenengrad,
          variance: score.variance,
          normalized: score.normalized,
          x: patch.x,
          y: patch.y
        });
      }

      // Create 2D blur map
      const blurMap = [];
      for (let y = 0; y < patchesY; y++) {
        const row = [];
        for (let x = 0; x < patchesX; x++) {
          const idx = y * patchesX + x;
          row.push(patchScores[idx].composite);
        }
        blurMap.push(row);
      }

      // Aggregation strategies
      const compositeScores = patchScores.map(s => s.composite);

      const maxFocus = Math.max(...compositeScores);
      const minFocus = Math.min(...compositeScores);
      const avgFocus = compositeScores.reduce((a, b) => a + b, 0) / compositeScores.length;
      const centerWeighted = this.calculateCenterWeighted(patchScores, patchesX, patchesY);
      const subjectFocusAggressive = this.calculateSubjectFocusAggressive(patchScores, patchesX, patchesY);
      const subjectFocus = this.calculateSubjectFocus(patchScores, patchesX, patchesY);
      const subjectFocusConservative = this.calculateSubjectFocusConservative(patchScores, patchesX, patchesY);
      const subjectFocusRelaxed = this.calculateSubjectFocusRelaxed(patchScores, patchesX, patchesY);
      const subjectFocusStrict = this.calculateSubjectFocusStrict(patchScores, patchesX, patchesY);
      const subjectFocusVeryStrict = this.calculateSubjectFocusVeryStrict(patchScores, patchesX, patchesY);
      const peakFocus = this.calculatePeakFocus(patchScores, patchesX, patchesY);
      const top10Percentile = this.percentile(compositeScores, 90);
      const top25Percentile = this.percentile(compositeScores, 75);
      const medianFocus = this.percentile(compositeScores, 50);

      // Count sharp patches (above threshold)
      const sharpPatchCount = compositeScores.filter(s => s > 30).length;
      const sharpPatchRatio = sharpPatchCount / compositeScores.length;

      // Distribution analysis
      const histogram = {
        'very-blurry': compositeScores.filter(s => s < 10).length,
        'blurry': compositeScores.filter(s => s >= 10 && s < 25).length,
        'borderline': compositeScores.filter(s => s >= 25 && s < 40).length,
        'sharp': compositeScores.filter(s => s >= 40 && s < 60).length,
        'very-sharp': compositeScores.filter(s => s >= 60).length
      };

      return {
        // Aggregation strategies
        composite: maxFocus,  // Default: use max focus
        maxFocus: maxFocus,
        minFocus: minFocus,
        avgFocus: avgFocus,
        centerWeighted: centerWeighted,
        subjectFocusAggressive: subjectFocusAggressive,
        subjectFocus: subjectFocus,
        subjectFocusConservative: subjectFocusConservative,
        subjectFocusRelaxed: subjectFocusRelaxed,
        subjectFocusStrict: subjectFocusStrict,
        subjectFocusVeryStrict: subjectFocusVeryStrict,
        peakFocus: peakFocus,
        top10Percentile: top10Percentile,
        top25Percentile: top25Percentile,
        medianFocus: medianFocus,

        // Patch analysis
        patchCount: patchScores.length,
        sharpPatchCount: sharpPatchCount,
        sharpPatchRatio: sharpPatchRatio,

        // Distribution
        histogram: histogram,

        // Blur map
        blurMap: blurMap,
        patchScores: patchScores,

        // Grid dimensions
        patchesX: patchesX,
        patchesY: patchesY
      };
    } catch (error) {
      throw new Error(`Failed to calculate patch-based score: ${error.message}`);
    }
  }

  /**
   * Determine if image is blurry using specified strategy
   */
  isBlurry(scores, threshold = 25, strategy = 'max-focus') {
    let score;

    switch (strategy) {
      case 'max-focus':
        score = scores.maxFocus;
        break;
      case 'subject-focus-aggressive':
        score = scores.subjectFocusAggressive;
        break;
      case 'subject-focus':
        score = scores.subjectFocus;
        break;
      case 'subject-focus-conservative':
        score = scores.subjectFocusConservative;
        break;
      case 'subject-focus-relaxed':
        score = scores.subjectFocusRelaxed;
        break;
      case 'subject-focus-strict':
        score = scores.subjectFocusStrict;
        break;
      case 'subject-focus-very-strict':
        score = scores.subjectFocusVeryStrict;
        break;
      case 'peak-focus':
        score = scores.peakFocus;
        break;
      case 'center-weighted':
        score = scores.centerWeighted;
        break;
      case 'top-25-percentile':
        score = scores.top25Percentile;
        break;
      case 'average':
        score = scores.avgFocus;
        break;
      case 'median':
        score = scores.medianFocus;
        break;
      default:
        score = scores.maxFocus;
    }

    return score < threshold;
  }

  /**
   * Format blur map for display
   */
  formatBlurMap(blurMap, width = 50) {
    const chars = ' ░▒▓█';
    const lines = [];

    for (const row of blurMap) {
      let line = '';
      for (const value of row) {
        // Map 0-100 to 0-4 (char index)
        const charIndex = Math.min(4, Math.floor(value / 25));
        line += chars[charIndex];
      }
      lines.push(line);
    }

    return lines.join('\n');
  }
}
