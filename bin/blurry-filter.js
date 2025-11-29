#!/usr/bin/env node

import { Command } from 'commander';
import { BlurDetector } from '../src/detector/index.js';
import { FileScanner } from '../src/scanner/file-scanner.js';
import { JsonReporter } from '../src/reporters/json.js';
import { ConsoleReporter } from '../src/reporters/console.js';
import { FileOperations } from '../src/utils/file-operations.js';
import { Calibration } from '../src/utils/calibration.js';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';

const program = new Command();

program
  .name('blurry-filter')
  .description('Detect and filter blurry RAW camera files')
  .version('0.1.0')
  .argument('[directory]', 'Directory to scan', '.')
  .option('-t, --threshold <number>', 'Blur detection threshold (lower = more strict)')
  .option('-r, --recursive', 'Scan directories recursively', false)
  .option('-f, --format <format>', 'Only scan specific RAW format (e.g., nef, cr2)')
  .option('-o, --output <file>', 'Output results to JSON file')
  .option('-v, --verbose', 'Show detailed output', false)
  .option('-q, --quiet', 'Minimal output (only summary and errors)', false)
  .option('-a, --algorithm <type>', 'Algorithm: composite (default), patch-based, laplacian, gradient, tenengrad, variance', 'composite')
  .option('--strategy <type>', 'Patch-based strategy: max-focus, subject-focus-aggressive, subject-focus, subject-focus-conservative, subject-focus-relaxed, subject-focus-strict, subject-focus-very-strict, peak-focus, center-weighted, top-25-percentile, median, average', 'max-focus')
  .option('--patch-size <number>', 'Patch grid size (NxN patches)', '8')
  .option('--show-stats', 'Show score distribution statistics', false)
  .option('--show-algorithms', 'Show individual algorithm scores (composite mode only)', false)
  .option('--copy-to <directory>', 'Copy blurry files to specified directory')
  .option('--move-to <directory>', 'Move blurry files to specified directory')
  .option('--rename', 'Rename blurry files in place by adding "_blurry" suffix', false)
  .option('--dry-run', 'Show what would be copied/moved without actually doing it', false)
  .option('--use-calibration', 'Use dataset-driven calibration (requires .blurry-calibration.json)', false)
  .option('--calibration-file <file>', 'Path to calibration file', '.blurry-calibration.json')
  .action(async (directory, options) => {
    const spinner = ora('Initializing...').start();

    // Load calibration stats if requested
    let calibrationStats = null;
    if (options.useCalibration && options.algorithm === 'composite') {
      const calibPath = path.resolve(options.calibrationFile);
      try {
        await fs.access(calibPath);
        const calibration = new Calibration();
        calibrationStats = await calibration.loadStats(calibPath);
        spinner.info(chalk.blue(`Loaded calibration from: ${calibPath}`));
        spinner.start('Initializing...');
      } catch (error) {
        spinner.fail(chalk.red(`Calibration file not found: ${calibPath}`));
        console.log(chalk.yellow('\nRun calibration first:'));
        console.log(chalk.cyan('  npm run calibrate /path/to/photos\n'));
        process.exit(1);
      }
    }

    try {
      // Resolve directory path
      const dirPath = path.resolve(directory);

      // Initialize scanner
      const scanner = new FileScanner();
      spinner.text = 'Scanning for RAW files...';

      const files = await scanner.scan(dirPath, {
        recursive: options.recursive,
        format: options.format
      });

      if (files.length === 0) {
        spinner.fail(chalk.yellow('No RAW files found'));
        process.exit(0);
      }

      spinner.succeed(chalk.green(`Found ${files.length} RAW file(s)`));

      // Initialize detector
      const detector = new BlurDetector({
        threshold: options.threshold !== undefined ? parseFloat(options.threshold) : undefined,
        algorithm: options.algorithm,
        calibrationStats: calibrationStats,
        strategy: options.strategy,
        patchSize: parseInt(options.patchSize, 10)
      });

      // Process files
      const results = [];
      const processSpinner = ora('Processing files...').start();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        processSpinner.text = `Processing ${i + 1}/${files.length}: ${path.basename(file)}`;

        const result = await detector.analyze(file);
        results.push(result);
      }

      processSpinner.succeed(chalk.green(`Processed ${files.length} file(s)`));

      // Clean up
      await detector.close();

      // Generate reports
      if (options.output) {
        const jsonReporter = new JsonReporter();
        await jsonReporter.generate(results, options.output);
        console.log(chalk.green(`\nResults saved to: ${options.output}`));
      }

      // Console output
      if (!options.quiet) {
        const consoleReporter = new ConsoleReporter();
        consoleReporter.generate(results, {
          verbose: options.verbose,
          showStats: options.showStats,
          showAlgorithms: options.showAlgorithms,
          quiet: options.quiet
        });
      } else {
        // Quiet mode: only show summary
        const summary = {
          total: results.length,
          blurry: results.filter(r => r.isBlurry && !r.error).length,
          sharp: results.filter(r => !r.isBlurry && !r.error).length,
          errors: results.filter(r => r.error).length
        };
        console.log(`✓ ${summary.total} files: ${summary.blurry} blurry, ${summary.sharp} sharp${summary.errors > 0 ? `, ${summary.errors} errors` : ''}`);
      }

      // Handle file operations (copy/move/rename)
      if (options.copyTo || options.moveTo || options.rename) {
        const targetDir = options.copyTo || options.moveTo || '';
        const isMove = !!options.moveTo;
        const isRename = !!options.rename;
        const isDryRun = options.dryRun;

        if (!options.quiet) {
          console.log(); // Empty line
        }

        const fileOps = new FileOperations();
        let spinnerText;

        if (isRename) {
          spinnerText = isDryRun
            ? 'Simulating rename operation...'
            : 'Renaming blurry files...';
        } else {
          spinnerText = isDryRun
            ? `Simulating ${isMove ? 'move' : 'copy'} operation...`
            : `${isMove ? 'Moving' : 'Copying'} blurry files to ${targetDir}...`;
        }

        const opSpinner = options.quiet ? null : ora(spinnerText).start();

        try {
          const opResult = await fileOps.processBlurryFiles(results, targetDir, {
            move: isMove,
            rename: isRename,
            dryRun: isDryRun
          });

          if (opResult.total === 0) {
            if (opSpinner) {
              opSpinner.info(chalk.blue('No blurry files to process'));
            } else if (options.quiet) {
              console.log('No blurry files to process');
            }
          } else {
            let successMessage, quietMessage;

            if (isRename) {
              successMessage = isDryRun
                ? `Dry run: Would rename ${opResult.total} file(s)`
                : `Successfully renamed ${opResult.successful}/${opResult.total} file(s)`;
              quietMessage = `Renamed ${opResult.successful}/${opResult.total} file(s)`;
            } else {
              successMessage = isDryRun
                ? `Dry run: Would ${isMove ? 'move' : 'copy'} ${opResult.total} file(s)`
                : `Successfully ${isMove ? 'moved' : 'copied'} ${opResult.successful}/${opResult.total} file(s)`;
              quietMessage = `${isMove ? 'Moved' : 'Copied'} ${opResult.successful}/${opResult.total} file(s) to ${targetDir}`;
            }

            if (opSpinner) {
              opSpinner.succeed(chalk.green(successMessage));
            } else if (options.quiet) {
              console.log(`✓ ${quietMessage}`);
            }

            if (opResult.failed > 0 && !options.quiet) {
              console.log(chalk.yellow(`Failed: ${opResult.failed} file(s)`));
            }

            if ((options.verbose || isDryRun) && !options.quiet) {
              console.log();
              console.log(chalk.bold('File Operations:'));
              console.log(chalk.gray('─'.repeat(50)));
              for (const op of opResult.operations) {
                const statusIcon = op.status === 'success' ? chalk.green('✓') :
                                 op.status === 'failed' ? chalk.red('✗') :
                                 chalk.blue('○');
                const actionText = isDryRun ? `[DRY RUN] ${op.action}` : op.action;
                console.log(`${statusIcon} ${actionText}: ${path.basename(op.source)} (score: ${op.blurScore.toFixed(2)})`);
                if (op.status === 'failed' && op.error) {
                  console.log(chalk.red(`  Error: ${op.error}`));
                }
              }
            }
          }
        } catch (opError) {
          if (opSpinner) {
            opSpinner.fail(chalk.red(`Operation failed: ${opError.message}`));
          } else {
            console.error(chalk.red(`✗ Operation failed: ${opError.message}`));
          }
        }
      }

    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
      if (options.verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  });

program.parse();
