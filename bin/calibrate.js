#!/usr/bin/env node

import { Command } from 'commander';
import { BlurDetector } from '../src/detector/index.js';
import { FileScanner } from '../src/scanner/file-scanner.js';
import { Calibration } from '../src/utils/calibration.js';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';

const program = new Command();

program
  .name('blurry-calibrate')
  .description('Calibrate blur detection using your dataset to compute normalization statistics')
  .version('0.1.0')
  .argument('[directory]', 'Directory to analyze for calibration', '.')
  .option('-r, --recursive', 'Scan directories recursively', false)
  .option('-f, --format <format>', 'Only scan specific RAW format (e.g., nef, cr2)')
  .option('-o, --output <file>', 'Output calibration stats to file', '.blurry-calibration.json')
  .option('--min-samples <number>', 'Minimum number of samples required', '50')
  .option('--patch-mode', 'Collect stats from patches instead of full images (for patch-based algorithm)', false)
  .option('--patch-size <number>', 'Patch grid size for patch-mode calibration', '8')
  .action(async (directory, options) => {
    const spinner = ora('Initializing calibration...').start();

    try {
      // Resolve directory path
      const dirPath = path.resolve(directory);
      const outputPath = path.resolve(options.output);
      const minSamples = parseInt(options.minSamples, 10);

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

      if (files.length < minSamples) {
        spinner.warn(chalk.yellow(`Found only ${files.length} files. Recommended: at least ${minSamples} for reliable calibration.`));
        console.log(chalk.gray('Continuing anyway...'));
      }

      spinner.succeed(chalk.green(`Found ${files.length} RAW file(s)`));

      // Initialize detector WITHOUT calibration (use hand-tuned)
      const algorithmType = options.patchMode ? 'patch-based' : 'composite';
      console.log(chalk.blue(`\nComputing raw ${options.patchMode ? 'patch-level' : 'full-image'} scores...`));

      const detector = new BlurDetector({
        algorithm: algorithmType,
        patchSize: options.patchMode ? parseInt(options.patchSize, 10) : undefined
      });

      // Process all files to get raw scores
      const results = [];
      const processSpinner = ora('Processing files...').start();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        processSpinner.text = `Processing ${i + 1}/${files.length}: ${path.basename(file)}`;

        const result = await detector.analyze(file);
        results.push(result);
      }

      processSpinner.succeed(chalk.green(`Processed ${files.length} file(s)`));

      // Clean up detector
      await detector.close();

      // Compute calibration statistics
      const calibrationSpinner = ora('Computing calibration statistics...').start();
      const calibration = new Calibration();

      try {
        const stats = calibration.computeStats(results, options.patchMode);
        calibrationSpinner.succeed(chalk.green('Calibration complete'));

        // Print statistics
        calibration.printStats(stats);

        // Save to file
        await calibration.saveStats(outputPath, stats);
        console.log(chalk.green(`\n✓ Calibration statistics saved to: ${chalk.bold(outputPath)}`));

        // Usage instructions
        console.log(chalk.blue('\nUsage:'));
        console.log(chalk.gray('─'.repeat(70)));
        console.log(`To use calibrated normalization, run:`);
        console.log(chalk.cyan(`  npm start /path/to/photos -- --use-calibration`));
        console.log();
        console.log(`The tool will automatically load calibration from:`);
        console.log(chalk.gray(`  ${outputPath}`));
        console.log(chalk.gray('─'.repeat(70)));

      } catch (calibError) {
        calibrationSpinner.fail(chalk.red(`Calibration failed: ${calibError.message}`));
        process.exit(1);
      }

    } catch (error) {
      spinner.fail(chalk.red('Error: ' + error.message));
      console.error(error);
      process.exit(1);
    }
  });

program.parse();
