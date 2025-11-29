import { glob } from 'glob';
import path from 'path';

export class FileScanner {
  constructor() {
    // Supported RAW formats
    this.supportedFormats = [
      'nef',  // Nikon
      'cr2', 'cr3',  // Canon
      'arw',  // Sony
      'dng',  // Adobe/Generic
      'raf',  // Fujifilm
      'orf',  // Olympus
      'rw2',  // Panasonic
      'pef',  // Pentax
      'srw',  // Samsung
      '3fr',  // Hasselblad
      'fff',  // Hasselblad
      'erf',  // Epson
      'mrw',  // Minolta
      'nrw',  // Nikon
      'raw'   // Generic
    ];
  }

  async scan(dirPath, options = {}) {
    const {
      recursive = false,
      format = null
    } = options;

    // Check if dirPath is a file (single file analysis)
    const fs = await import('fs/promises');
    try {
      const stats = await fs.stat(dirPath);
      if (stats.isFile()) {
        // Single file analysis
        if (this.isSupported(dirPath)) {
          return [path.resolve(dirPath)];
        } else {
          throw new Error(`Unsupported file format: ${path.extname(dirPath)}`);
        }
      }
    } catch (error) {
      // If stat fails, assume it's a directory (will be caught later if invalid)
    }

    // Directory scanning (existing logic)
    // Determine which formats to scan
    const formats = format ? [format.toLowerCase()] : this.supportedFormats;

    // Build glob pattern
    const patterns = formats.map(fmt => {
      if (recursive) {
        return path.join(dirPath, '**', `*.${fmt}`);
      }
      return path.join(dirPath, `*.${fmt}`);
    });

    // Scan for files
    const files = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        nocase: true,
        absolute: true
      });
      files.push(...matches);
    }

    // Remove duplicates (case-insensitive matching might catch same file)
    const uniqueFiles = [...new Set(files)];

    return uniqueFiles.sort();
  }

  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    return this.supportedFormats.includes(ext);
  }
}
