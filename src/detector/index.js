import { PreviewExtractor } from './preview-extractor.js';
import { LaplacianDetector } from './laplacian.js';
import { GradientDetector } from './gradient.js';
import { TenengradDetector } from './tenengrad.js';
import { VarianceDetector } from './variance.js';
import { CompositeDetector } from './composite.js';
import { PatchBasedDetector } from './patch-based.js';
import path from 'path';

export class BlurDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 10;
    this.algorithm = options.algorithm || 'composite';
    this.calibrationStats = options.calibrationStats || null;
    this.strategy = options.strategy || 'average'; // aggregation strategy for patch-based
    this.patchSize = options.patchSize || 8; // grid size for patch-based

    this.extractor = new PreviewExtractor();

    // Initialize detector based on algorithm choice
    switch (this.algorithm) {
      case 'laplacian':
        this.detector = new LaplacianDetector();
        break;
      case 'gradient':
        this.detector = new GradientDetector();
        break;
      case 'tenengrad':
        this.detector = new TenengradDetector();
        break;
      case 'variance':
        this.detector = new VarianceDetector();
        break;
      case 'patch-based':
        this.detector = new PatchBasedDetector({
          calibrationStats: this.calibrationStats,
          patchSize: this.patchSize
        });
        // Patch-based with different strategies use different default thresholds
        if (options.threshold !== undefined) {
          this.threshold = options.threshold;
        } else {
          // Peak-focus strategy needs much higher threshold since it only looks at top 3 patches
          if (this.strategy === 'peak-focus') {
            this.threshold = this.calibrationStats ? 70 : 75;
          } else {
            this.threshold = this.calibrationStats ? 25 : 30;
          }
        }
        break;
      case 'composite':
      default:
        this.detector = new CompositeDetector({
          calibrationStats: this.calibrationStats
        });
        // Use lower default threshold when using calibration (percentile normalization)
        // vs hand-tuned normalization, as the score distributions differ
        if (options.threshold !== undefined) {
          this.threshold = options.threshold;
        } else {
          this.threshold = this.calibrationStats ? 25 : 30;
        }
        break;
    }
  }

  async analyze(filePath) {
    const startTime = Date.now();

    try {
      // Extract preview from RAW file
      const previewImage = await this.extractor.extract(filePath);

      // Convert to buffer for analysis
      const buffer = await previewImage.toBuffer();

      // Calculate blur score
      const rawScore = await this.detector.calculateBlurScore(buffer);

      // Handle different algorithm types
      let blurScore, isBlurry, scores;

      if (this.algorithm === 'patch-based') {
        // Patch-based analysis
        isBlurry = this.detector.isBlurry(rawScore, this.threshold, this.strategy);

        // Use the selected strategy for the main blur score
        switch (this.strategy) {
          case 'max-focus':
            blurScore = Math.round(rawScore.maxFocus * 100) / 100;
            break;
          case 'subject-focus-aggressive':
            blurScore = Math.round(rawScore.subjectFocusAggressive * 100) / 100;
            break;
          case 'subject-focus':
            blurScore = Math.round(rawScore.subjectFocus * 100) / 100;
            break;
          case 'subject-focus-conservative':
            blurScore = Math.round(rawScore.subjectFocusConservative * 100) / 100;
            break;
          case 'subject-focus-relaxed':
            blurScore = Math.round(rawScore.subjectFocusRelaxed * 100) / 100;
            break;
          case 'subject-focus-strict':
            blurScore = Math.round(rawScore.subjectFocusStrict * 100) / 100;
            break;
          case 'subject-focus-very-strict':
            blurScore = Math.round(rawScore.subjectFocusVeryStrict * 100) / 100;
            break;
          case 'peak-focus':
            blurScore = Math.round(rawScore.peakFocus * 100) / 100;
            break;
          case 'center-weighted':
            blurScore = Math.round(rawScore.centerWeighted * 100) / 100;
            break;
          case 'top-25-percentile':
            blurScore = Math.round(rawScore.top25Percentile * 100) / 100;
            break;
          case 'median':
            blurScore = Math.round(rawScore.medianFocus * 100) / 100;
            break;
          case 'average':
          default:
            blurScore = Math.round(rawScore.avgFocus * 100) / 100;
        }

        scores = {
          maxFocus: Math.round(rawScore.maxFocus * 100) / 100,
          minFocus: Math.round(rawScore.minFocus * 100) / 100,
          avgFocus: Math.round(rawScore.avgFocus * 100) / 100,
          centerWeighted: Math.round(rawScore.centerWeighted * 100) / 100,
          subjectFocusAggressive: Math.round(rawScore.subjectFocusAggressive * 100) / 100,
          subjectFocus: Math.round(rawScore.subjectFocus * 100) / 100,
          subjectFocusConservative: Math.round(rawScore.subjectFocusConservative * 100) / 100,
          subjectFocusRelaxed: Math.round(rawScore.subjectFocusRelaxed * 100) / 100,
          subjectFocusStrict: Math.round(rawScore.subjectFocusStrict * 100) / 100,
          subjectFocusVeryStrict: Math.round(rawScore.subjectFocusVeryStrict * 100) / 100,
          peakFocus: Math.round(rawScore.peakFocus * 100) / 100,
          top10Percentile: Math.round(rawScore.top10Percentile * 100) / 100,
          top25Percentile: Math.round(rawScore.top25Percentile * 100) / 100,
          medianFocus: Math.round(rawScore.medianFocus * 100) / 100,
          sharpPatchCount: rawScore.sharpPatchCount,
          sharpPatchRatio: Math.round(rawScore.sharpPatchRatio * 1000) / 10, // as percentage
          histogram: rawScore.histogram,
          blurMap: rawScore.blurMap,
          patchScores: rawScore.patchScores, // Include raw patch scores for calibration
          patchesX: rawScore.patchesX,
          patchesY: rawScore.patchesY
        };
      } else if (this.algorithm === 'composite') {
        // Composite analysis
        blurScore = Math.round(rawScore.composite * 100) / 100;
        isBlurry = this.detector.isBlurry(rawScore, this.threshold);
        scores = {
          composite: Math.round(rawScore.composite * 100) / 100,
          laplacian: Math.round(rawScore.laplacian * 100) / 100,
          gradient: Math.round(rawScore.gradient * 100) / 100,
          tenengrad: Math.round(rawScore.tenengrad * 100) / 100,
          variance: Math.round(rawScore.variance * 100) / 100,
          normalized: {
            laplacian: Math.round(rawScore.normalized.laplacian * 100) / 100,
            gradient: Math.round(rawScore.normalized.gradient * 100) / 100,
            tenengrad: Math.round(rawScore.normalized.tenengrad * 100) / 100,
            variance: Math.round(rawScore.normalized.variance * 100) / 100
          }
        };
      } else {
        // Single algorithm
        blurScore = Math.round(rawScore * 100) / 100;
        isBlurry = this.detector.isBlurry(rawScore, this.threshold);
      }

      const processingTime = Date.now() - startTime;

      const result = {
        file: filePath,
        fileName: path.basename(filePath),
        blurScore,
        isBlurry,
        threshold: this.threshold,
        processingTime,
        algorithm: this.algorithm
      };

      // Add detailed scores for composite
      if (scores) {
        result.scores = scores;
      }

      return result;
    } catch (error) {
      return {
        file: filePath,
        fileName: path.basename(filePath),
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  async close() {
    await this.extractor.close();
  }

  setThreshold(threshold) {
    this.threshold = threshold;
  }

  getThreshold() {
    return this.threshold;
  }
}
