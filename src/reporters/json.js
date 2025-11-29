import fs from 'fs/promises';

export class JsonReporter {
  async generate(results, outputPath = null) {
    const report = {
      summary: this.generateSummary(results),
      results: results,
      timestamp: new Date().toISOString()
    };

    const json = JSON.stringify(report, null, 2);

    if (outputPath) {
      await fs.writeFile(outputPath, json, 'utf-8');
      return outputPath;
    }

    return json;
  }

  generateSummary(results) {
    const total = results.length;
    const blurry = results.filter(r => r.isBlurry && !r.error).length;
    const sharp = results.filter(r => !r.isBlurry && !r.error).length;
    const errors = results.filter(r => r.error).length;

    const totalTime = results.reduce((sum, r) => sum + (r.processingTime || 0), 0);
    const avgTime = total > 0 ? Math.round(totalTime / total) : 0;

    const scores = results
      .filter(r => !r.error && r.blurScore)
      .map(r => r.blurScore);

    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;

    return {
      total,
      blurry,
      sharp,
      errors,
      blurryPercentage: total > 0 ? Math.round((blurry / total) * 100) : 0,
      avgProcessingTime: avgTime,
      avgBlurScore: avgScore
    };
  }
}
