import fs from 'fs/promises';
import path from 'path';

/**
 * Calibration utility for computing dataset statistics
 * Uses percentile-based normalization instead of hard-coded constants
 */
export class Calibration {
  constructor() {
    this.stats = null;
  }

  /**
   * Calculate percentile from sorted array
   */
  percentile(sortedArray, p) {
    if (sortedArray.length === 0) return 0;

    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Compute statistics from a set of results
   * @param {Array} results - Array of blur detection results
   * @param {Boolean} patchMode - If true, collect stats from patch scores instead of full-image scores
   * @returns {Object} Statistics for each algorithm
   */
  computeStats(results, patchMode = false) {
    const validResults = results.filter(r => !r.error && r.scores);

    if (validResults.length === 0) {
      throw new Error('No valid results to compute statistics from');
    }

    let laplacianScores, gradientScores, tenengradScores, varianceScores;

    if (patchMode) {
      // Collect scores from all patches across all images
      laplacianScores = [];
      gradientScores = [];
      tenengradScores = [];
      varianceScores = [];

      for (const result of validResults) {
        if (result.scores.patchScores) {
          for (const patchScore of result.scores.patchScores) {
            laplacianScores.push(patchScore.laplacian);
            gradientScores.push(patchScore.gradient);
            tenengradScores.push(patchScore.tenengrad);
            varianceScores.push(patchScore.variance);
          }
        }
      }

      // Sort all scores
      laplacianScores.sort((a, b) => a - b);
      gradientScores.sort((a, b) => a - b);
      tenengradScores.sort((a, b) => a - b);
      varianceScores.sort((a, b) => a - b);
    } else {
      // Extract full-image scores
      laplacianScores = validResults.map(r => r.scores.laplacian).sort((a, b) => a - b);
      gradientScores = validResults.map(r => r.scores.gradient).sort((a, b) => a - b);
      tenengradScores = validResults.map(r => r.scores.tenengrad).sort((a, b) => a - b);
      varianceScores = validResults.map(r => r.scores.variance).sort((a, b) => a - b);
    }

    // Compute percentiles for robust normalization (5th and 95th)
    const stats = {
      laplacian: {
        p5: this.percentile(laplacianScores, 5),
        p95: this.percentile(laplacianScores, 95),
        median: this.percentile(laplacianScores, 50),
        min: laplacianScores[0],
        max: laplacianScores[laplacianScores.length - 1]
      },
      gradient: {
        p5: this.percentile(gradientScores, 5),
        p95: this.percentile(gradientScores, 95),
        median: this.percentile(gradientScores, 50),
        min: gradientScores[0],
        max: gradientScores[gradientScores.length - 1]
      },
      tenengrad: {
        p5: this.percentile(tenengradScores, 5),
        p95: this.percentile(tenengradScores, 95),
        median: this.percentile(tenengradScores, 50),
        min: tenengradScores[0],
        max: tenengradScores[tenengradScores.length - 1]
      },
      variance: {
        p5: this.percentile(varianceScores, 5),
        p95: this.percentile(varianceScores, 95),
        median: this.percentile(varianceScores, 50),
        min: varianceScores[0],
        max: varianceScores[varianceScores.length - 1]
      },
      sampleSize: validResults.length,
      patchMode: patchMode,
      totalSamples: laplacianScores.length, // Total data points (images or patches)
      version: '1.0.0'
    };

    this.stats = stats;
    return stats;
  }

  /**
   * Save statistics to a JSON file
   */
  async saveStats(filePath, stats = null) {
    const statsToSave = stats || this.stats;
    if (!statsToSave) {
      throw new Error('No statistics to save. Run computeStats first.');
    }

    await fs.writeFile(filePath, JSON.stringify(statsToSave, null, 2));
    return statsToSave;
  }

  /**
   * Load statistics from a JSON file
   */
  async loadStats(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      this.stats = JSON.parse(content);
      return this.stats;
    } catch (error) {
      throw new Error(`Failed to load calibration stats: ${error.message}`);
    }
  }

  /**
   * Check if calibration stats file exists
   */
  async statsExist(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get statistics (load from file if not in memory)
   */
  async getStats(filePath = null) {
    if (this.stats) {
      return this.stats;
    }

    if (filePath) {
      return await this.loadStats(filePath);
    }

    throw new Error('No statistics available. Run calibration first.');
  }

  /**
   * Print statistics in human-readable format
   */
  printStats(stats = null) {
    const s = stats || this.stats;
    if (!s) {
      console.log('No statistics available');
      return;
    }

    console.log('\nCalibration Statistics:');
    console.log('═'.repeat(70));
    if (s.patchMode) {
      console.log(`Mode: Patch-level calibration`);
      console.log(`Images processed: ${s.sampleSize}`);
      console.log(`Total patches analyzed: ${s.totalSamples}`);
    } else {
      console.log(`Mode: Full-image calibration`);
      console.log(`Sample size: ${s.sampleSize} images`);
    }
    console.log('');

    const algorithms = ['laplacian', 'gradient', 'tenengrad', 'variance'];

    for (const alg of algorithms) {
      console.log(`${alg.toUpperCase()}:`);
      console.log(`  5th percentile:  ${s[alg].p5.toFixed(2)}`);
      console.log(`  Median:          ${s[alg].median.toFixed(2)}`);
      console.log(`  95th percentile: ${s[alg].p95.toFixed(2)}`);
      console.log(`  Range:           ${s[alg].min.toFixed(2)} - ${s[alg].max.toFixed(2)}`);
      console.log('');
    }
    console.log('═'.repeat(70));
  }
}
