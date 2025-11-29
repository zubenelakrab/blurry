import Table from 'cli-table3';
import chalk from 'chalk';

export class ConsoleReporter {
  generate(results, options = {}) {
    const { verbose = false, showStats = false, showAlgorithms = false } = options;

    // Create summary
    const summary = this.generateSummary(results);
    this.printSummary(summary);

    console.log(); // Empty line

    // Show statistics if requested
    if (showStats) {
      this.printScoreDistribution(results);
      console.log(); // Empty line
    }

    // Create results table
    if (verbose || results.length <= 20) {
      this.printDetailedResults(results, { showAlgorithms });
    } else {
      this.printBlurryFiles(results, { showAlgorithms });
    }
  }

  generateSummary(results) {
    const total = results.length;
    const blurry = results.filter(r => r.isBlurry && !r.error).length;
    const sharp = results.filter(r => !r.isBlurry && !r.error).length;
    const errors = results.filter(r => r.error).length;

    const totalTime = results.reduce((sum, r) => sum + (r.processingTime || 0), 0);
    const avgTime = total > 0 ? Math.round(totalTime / total) : 0;

    return { total, blurry, sharp, errors, avgTime };
  }

  printSummary(summary) {
    console.log(chalk.bold('\nAnalysis Summary:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Total files:        ${chalk.cyan(summary.total)}`);
    console.log(`Blurry files:       ${chalk.red(summary.blurry)}`);
    console.log(`Sharp files:        ${chalk.green(summary.sharp)}`);
    if (summary.errors > 0) {
      console.log(`Errors:             ${chalk.yellow(summary.errors)}`);
    }
    console.log(`Avg processing:     ${chalk.gray(summary.avgTime + 'ms')}`);
    console.log(chalk.gray('─'.repeat(50)));
  }

  printDetailedResults(results, options = {}) {
    const { showAlgorithms = false } = options;

    // Check if this is patch-based mode
    const isPatchBased = results.length > 0 && results[0].scores && results[0].scores.maxFocus !== undefined;

    let table;
    if (isPatchBased) {
      // Patch-based table headers
      table = new Table({
        head: [
          chalk.bold('File'),
          chalk.bold('Score'),
          chalk.bold('Max'),
          chalk.bold('Avg'),
          chalk.bold('Center'),
          chalk.bold('Sharp %'),
          chalk.bold('Status')
        ],
        colWidths: [35, 11, 11, 11, 11, 11, 10]
      });
    } else {
      // Composite/single algorithm table headers
      table = new Table({
        head: [
          chalk.bold('File'),
          chalk.bold('Composite'),
          chalk.bold('Laplacian'),
          chalk.bold('Gradient'),
          chalk.bold('Tenengrad'),
          chalk.bold('Variance'),
          chalk.bold('Status')
        ],
        colWidths: [35, 11, 11, 11, 11, 11, 10]
      });
    }

    for (const result of results) {
      if (result.error) {
        table.push([
          result.fileName,
          chalk.yellow('ERROR'),
          '', '', '', '',
          ''
        ]);
      } else {
        const status = result.isBlurry
          ? chalk.red('Blurry')
          : chalk.green('Sharp');

        if (isPatchBased && result.scores) {
          // Patch-based mode
          table.push([
            result.fileName,
            result.blurScore.toFixed(2),
            result.scores.maxFocus.toFixed(2),
            result.scores.avgFocus.toFixed(2),
            result.scores.centerWeighted.toFixed(2),
            result.scores.sharpPatchRatio.toFixed(1) + '%',
            status
          ]);
        } else if (result.scores && result.scores.laplacian !== undefined) {
          // Composite mode
          table.push([
            result.fileName,
            result.blurScore.toFixed(2),
            result.scores.laplacian.toFixed(2),
            result.scores.gradient.toFixed(2),
            result.scores.tenengrad.toFixed(0),
            result.scores.variance.toFixed(2),
            status
          ]);
        } else {
          // Single algorithm mode
          table.push([
            result.fileName,
            result.blurScore.toFixed(2),
            '-', '-', '-', '-',
            status
          ]);
        }
      }
    }

    console.log(table.toString());
  }

  printBlurryFiles(results, options = {}) {
    const { showAlgorithms = false } = options;
    const blurryFiles = results.filter(r => r.isBlurry && !r.error);

    console.log(chalk.bold(`Blurry Files (${blurryFiles.length}):`));
    console.log(chalk.gray('─'.repeat(50)));

    if (blurryFiles.length === 0) {
      console.log(chalk.green('No blurry files found!'));
    } else {
      for (const result of blurryFiles) {
        console.log(`${chalk.red('✗')} ${result.fileName} (score: ${result.blurScore.toFixed(2)})`);

        // Show individual algorithm scores if available and requested
        if (showAlgorithms && result.scores) {
          // Patch-based scores
          if (result.scores.maxFocus !== undefined) {
            console.log(chalk.gray(`    Max: ${result.scores.maxFocus.toFixed(2)} | Avg: ${result.scores.avgFocus.toFixed(2)} | Center: ${result.scores.centerWeighted.toFixed(2)} | Sharp patches: ${result.scores.sharpPatchRatio.toFixed(1)}%`));
          }
          // Composite scores
          else if (result.scores.laplacian !== undefined) {
            console.log(chalk.gray(`    Laplacian: ${result.scores.laplacian.toFixed(2)} | Gradient: ${result.scores.gradient.toFixed(2)} | Tenengrad: ${result.scores.tenengrad.toFixed(2)} | Variance: ${result.scores.variance.toFixed(2)}`));
          }
        }
      }
    }
  }

  printScoreDistribution(results) {
    const validResults = results.filter(r => !r.error && r.blurScore !== undefined);

    if (validResults.length === 0) {
      return;
    }

    // Calculate distribution buckets
    const ranges = [
      { min: 0, max: 5, label: '0-5' },
      { min: 5, max: 10, label: '5-10' },
      { min: 10, max: 20, label: '10-20' },
      { min: 20, max: 30, label: '20-30' },
      { min: 30, max: 50, label: '30-50' },
      { min: 50, max: 100, label: '50-100' },
      { min: 100, max: 200, label: '100-200' },
      { min: 200, max: Infinity, label: '200+' }
    ];

    const distribution = ranges.map(range => {
      const count = validResults.filter(r =>
        r.blurScore >= range.min && r.blurScore < range.max
      ).length;
      const percentage = (count / validResults.length * 100).toFixed(1);
      return { ...range, count, percentage };
    });

    // Calculate statistics
    const scores = validResults.map(r => r.blurScore).sort((a, b) => a - b);
    const min = scores[0];
    const max = scores[scores.length - 1];
    const median = scores[Math.floor(scores.length / 2)];
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

    console.log(chalk.bold('Score Distribution:'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const bucket of distribution) {
      if (bucket.count > 0) {
        const bar = '█'.repeat(Math.ceil(bucket.percentage / 2));
        console.log(`${bucket.label.padEnd(12)} ${String(bucket.count).padStart(4)} (${String(bucket.percentage).padStart(5)}%) ${chalk.cyan(bar)}`);
      }
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Min:            ${chalk.cyan(min.toFixed(2))}`);
    console.log(`Max:            ${chalk.cyan(max.toFixed(2))}`);
    console.log(`Median:         ${chalk.cyan(median.toFixed(2))}`);
    console.log(`Mean:           ${chalk.cyan(mean.toFixed(2))}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.dim('Tip: Adjust threshold with --threshold flag'));
    console.log(chalk.dim('     Lower threshold = more strict (fewer blurry)'));
  }
}
