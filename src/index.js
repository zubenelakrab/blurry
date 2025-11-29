import { BlurDetector } from './detector/index.js';
import { FileScanner } from './scanner/file-scanner.js';

export { BlurDetector, FileScanner };

export async function analyzeDirectory(dirPath, options = {}) {
  const scanner = new FileScanner();
  const detector = new BlurDetector(options);

  const files = await scanner.scan(dirPath, options);
  const results = [];

  for (const file of files) {
    const result = await detector.analyze(file);
    results.push(result);
  }

  return results;
}
