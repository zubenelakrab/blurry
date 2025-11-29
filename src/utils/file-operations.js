import fs from 'fs/promises';
import path from 'path';

export class FileOperations {
  async copyFile(sourcePath, destPath) {
    try {
      await fs.copyFile(sourcePath, destPath);
      return { success: true, destPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async moveFile(sourcePath, destPath) {
    try {
      await fs.rename(sourcePath, destPath);
      return { success: true, destPath };
    } catch (error) {
      // If rename fails (e.g., different filesystem), try copy then delete
      try {
        await fs.copyFile(sourcePath, destPath);
        await fs.unlink(sourcePath);
        return { success: true, destPath };
      } catch (fallbackError) {
        return { success: false, error: fallbackError.message };
      }
    }
  }

  async renameFileWithSuffix(sourcePath, suffix = 'blurry') {
    try {
      const dir = path.dirname(sourcePath);
      const ext = path.extname(sourcePath);
      const basename = path.basename(sourcePath, ext);
      const newPath = path.join(dir, `${basename}_${suffix}${ext}`);

      await fs.rename(sourcePath, newPath);
      return { success: true, destPath: newPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true, dirPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async directoryExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async processBlurryFiles(results, outputDir, options = {}) {
    const { move = false, rename = false, dryRun = false, suffix = 'blurry' } = options;
    const blurryFiles = results.filter(r => r.isBlurry && !r.error);

    if (blurryFiles.length === 0) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        operations: []
      };
    }

    // Ensure output directory exists (unless dry run or rename mode)
    if (!dryRun && !rename) {
      const dirResult = await this.ensureDirectory(outputDir);
      if (!dirResult.success) {
        throw new Error(`Failed to create directory ${outputDir}: ${dirResult.error}`);
      }
    }

    const operations = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    for (const result of blurryFiles) {
      const fileName = path.basename(result.file);
      let destPath;
      let action;

      if (rename) {
        // Rename in place with suffix
        const dir = path.dirname(result.file);
        const ext = path.extname(fileName);
        const basename = path.basename(fileName, ext);
        destPath = path.join(dir, `${basename}_${suffix}${ext}`);
        action = 'rename';
      } else {
        // Copy or move to output directory
        destPath = path.join(outputDir, fileName);
        action = move ? 'move' : 'copy';
      }

      if (dryRun) {
        operations.push({
          source: result.file,
          destination: destPath,
          action: action,
          status: 'dry-run',
          blurScore: result.blurScore
        });
        skipped++;
      } else {
        let opResult;

        if (rename) {
          opResult = await this.renameFileWithSuffix(result.file, suffix);
        } else {
          opResult = move
            ? await this.moveFile(result.file, destPath)
            : await this.copyFile(result.file, destPath);
        }

        if (opResult.success) {
          successful++;
          operations.push({
            source: result.file,
            destination: opResult.destPath,
            action: action,
            status: 'success',
            blurScore: result.blurScore
          });
        } else {
          failed++;
          operations.push({
            source: result.file,
            destination: destPath,
            action: action,
            status: 'failed',
            error: opResult.error,
            blurScore: result.blurScore
          });
        }
      }
    }

    return {
      total: blurryFiles.length,
      successful,
      failed,
      skipped,
      operations
    };
  }
}
