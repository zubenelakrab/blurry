# Blurry Filter

**Intelligent blur detection for RAW camera files.** Perfect for wildlife and aviation photographers who need to quickly filter out-of-focus shots from burst sequences.

## Features

- **Multiple blur detection algorithms** - Laplacian, Gradient, Tenengrad, Variance, and Composite
- **Patch-based analysis** - Detects small sharp subjects in large blurry backgrounds  
- **Smart aggregation strategies** - 11+ strategies for different shooting scenarios
- **Dataset-driven calibration** - Learns from your own photos for optimal accuracy
- **Batch processing** - No file limits, process thousands of RAW files
- **Multiple file operations** - Copy, move, or rename blurry files
- **Comprehensive format support** - NEF, CR2, CR3, ARW, DNG, RAF, ORF, RW2, PEF, SRW, 3FR, FFF, ERF, MRW, NRW, RAW

## Installation

```bash
npm install
```

Or install globally:

```bash
npm install -g @zubenelakrab/blurry
```

## Quick Start

### 1. Calibrate on your photos

```bash
# For patch-based detection (recommended for wildlife/aviation)
npm run calibrate /path/to/photos -- --patch-mode --output .blurry-patch-calibration.json

# For general use
npm run calibrate /path/to/photos
```

### 2. Detect and filter blurry files

```bash
# Wildlife/aviation photography (small subjects)
npm start /path/to/photos -- \
  --algorithm patch-based \
  --strategy peak-focus \
  --use-calibration \
  --calibration-file .blurry-patch-calibration.json \
  --copy-to ./blurry

# General photography
npm start /path/to/photos -- \
  --algorithm composite \
  --use-calibration \
  --copy-to ./blurry
```

## Command Line Options

```
Usage: blurry [directory] [options]

Arguments:
  directory                      Directory to scan (or single file path)

Input/Output:
  -r, --recursive                Scan subdirectories
  -f, --format <format>          Only scan specific format (nef, cr2, etc.)
  -o, --output <file>            Save JSON results

Algorithm:
  -a, --algorithm <type>         Algorithm: composite, patch-based, laplacian, 
                                 gradient, tenengrad, variance (default: composite)
  --strategy <type>              Patch-based strategy: max-focus, peak-focus,
                                 subject-focus-*, center-weighted, etc.
  --patch-size <number>          Grid size (default: 8)
  -t, --threshold <number>       Custom threshold (lower = more strict)

Calibration:
  --use-calibration              Enable calibration
  --calibration-file <file>      Path to calibration file

File Operations:
  --copy-to <directory>          Copy blurry files to directory
  --move-to <directory>          Move blurry files to directory
  --rename                       Add "_blurry" suffix to files in-place
  --dry-run                      Simulate operations without changes

Display:
  -v, --verbose                  Show detailed output for each file
  -q, --quiet                    Minimal output (summary only)
  --show-stats                   Show score distribution statistics
  --show-algorithms              Show individual algorithm scores (composite only)
```

## Algorithms

### Composite (Recommended for general use)

Combines 4 blur detection algorithms with weighted averaging:
- Laplacian - Edge detection variance
- Gradient - Sobel gradient magnitude  
- Tenengrad - Sobel squared (edge-sensitive)
- Variance - Pixel intensity variance

```bash
npm start /path/to/photos -- --algorithm composite --use-calibration
```

### Patch-Based (Recommended for small subjects)

Divides images into 8×8 grid (64 patches) and analyzes each separately. Perfect for wildlife and aviation photography where sharp subjects are small.

```bash
npm start /path/to/photos -- \
  --algorithm patch-based \
  --strategy peak-focus \
  --use-calibration \
  --calibration-file .blurry-patch-calibration.json
```

## Patch-Based Strategies

### Peak Quality Detection

- **peak-focus** ⭐ *Recommended for burst sequences*
  - Uses average of top 3 sharpest patches (raw Tenengrad scores)
  - Best for: Ranking burst shots, comparing similar images
  - Distinguishes subtle quality differences
  - Auto threshold: 70

### Single Patch Detection

- **max-focus** (default)
  - Uses single sharpest patch
  - Best for: Small subjects anywhere in frame
  - Threshold: 25-30

### Subject-Focus Variants (Center-Biased)

All use Gaussian position weighting - center patches score higher:

- **subject-focus-aggressive** - Top 8%, minimal center bias
- **subject-focus** - Top 12%, mild center bias
- **subject-focus-conservative** - Top 18%, moderate center bias
- **subject-focus-relaxed** - Top 28%, strong center bias
- **subject-focus-strict** - Top 38%, very strong center bias  
- **subject-focus-very-strict** - Top 40%, extreme center bias

### Other Strategies

- **center-weighted** - All patches with Gaussian weighting
- **top-25-percentile** - 75th percentile of all patches
- **median** - Median of all patches
- **average** - Average of all patches

## Usage Examples

### Wildlife/Aviation Photography

```bash
# Step 1: Calibrate on representative photos (500+ images recommended)
npm run calibrate ~/Photos/Wildlife2024 -- \
  --patch-mode \
  --output .blurry-patch-calibration.json

# Step 2: Test settings on small batch
npm start ~/Photos/TestBatch -- \
  --algorithm patch-based \
  --strategy peak-focus \
  --use-calibration \
  --calibration-file .blurry-patch-calibration.json \
  --show-stats \
  --dry-run

# Step 3: Process all photos
npm start ~/Photos/AllShots -- \
  --algorithm patch-based \
  --strategy peak-focus \
  --use-calibration \
  --calibration-file .blurry-patch-calibration.json \
  --copy-to ~/Photos/Blurry \
  -o results.json
```

### General Photography

```bash
# Calibrate and process
npm run calibrate ~/Photos/Samples
npm start ~/Photos/EventShoot -- \
  --algorithm composite \
  --use-calibration \
  --threshold 30 \
  --move-to ~/Photos/Blurry
```

### Rename Blurry Files In-Place

```bash
npm start ~/Photos/Shoot -- \
  --algorithm patch-based \
  --strategy peak-focus \
  --use-calibration \
  --rename
```

### Single File Analysis

```bash
npm start ~/Photos/IMG_1234.NEF -- \
  --algorithm patch-based \
  --strategy peak-focus \
  --use-calibration \
  --verbose
```

## Calibration

Calibration analyzes a representative sample of your photos to learn optimal thresholds.

### Full-Image Calibration

For use with `--algorithm composite`:

```bash
npm run calibrate /path/to/representative/photos
# Creates: .blurry-calibration.json
```

### Patch-Level Calibration

For use with `--algorithm patch-based`:

```bash
npm run calibrate /path/to/representative/photos -- \
  --patch-mode \
  --output .blurry-patch-calibration.json
```

**Recommendations:**
- Use 500+ images for calibration
- Include mix of sharp and blurry shots
- Use photos from same camera/lens if possible
- Re-calibrate when switching equipment

## Strategy Selection Guide

| Scenario | Algorithm | Strategy | Threshold |
|----------|-----------|----------|-----------|
| Wildlife (birds, animals) | patch-based | peak-focus | 70 |
| Aviation photography | patch-based | peak-focus | 70 |
| Sports action shots | patch-based | subject-focus-aggressive | 25-30 |
| Portrait photography | composite | — | 30 |
| Landscape photography | composite | — | 30 |
| Macro photography | patch-based | center-weighted | 25-30 |
| General purpose | composite | — | 30 |

## Output Format

### Console Output

```
Analysis Summary:
──────────────────────────────────────────────────
Total files:        538
Blurry files:       37
Sharp files:        501
Avg processing:     228ms
──────────────────────────────────────────────────

Score Distribution:
──────────────────────────────────────────────────
50-100        498 ( 92.6%) ███████████████████████
100-200        40 (  7.4%) ████
──────────────────────────────────────────────────
```

### JSON Output

```json
{
  "summary": {
    "total": 538,
    "blurry": 37,
    "sharp": 501,
    "avgProcessingTime": 228
  },
  "results": [
    {
      "file": "/path/to/photo.NEF",
      "fileName": "photo.NEF",
      "blurScore": 94.12,
      "isBlurry": false,
      "threshold": 70,
      "algorithm": "patch-based",
      "scores": {
        "maxFocus": 100,
        "peakFocus": 94.12,
        "avgFocus": 12.43
      }
    }
  ]
}
```

## How It Works

### Composite Algorithm

1. Extracts preview JPEG from RAW file
2. Applies 4 blur detection algorithms
3. Normalizes scores using calibration percentiles
4. Combines with weighted average
5. Compares to threshold

### Patch-Based Algorithm

1. Extracts preview JPEG from RAW file
2. Divides into 8×8 grid (64 patches)
3. Analyzes each patch with composite algorithm
4. Applies aggregation strategy
5. Optional Gaussian position weighting
6. Compares to threshold

### Peak-Focus Strategy

1. Sorts all 64 patches by composite score
2. Takes top 3 sharpest patches
3. Averages their raw Tenengrad values
4. Applies logarithmic normalization
5. Result: Distinguishes subtle quality differences

## Performance

- Processing speed: ~200-400ms per RAW file
- Memory usage: Efficient streaming
- No file limits: Process entire photo libraries
- Patch-based: 64 patches analyzed per image

## License

MIT

## Author

Created for wildlife and aviation photographers who shoot thousands of burst sequences.

---

**Happy shooting! 📸**
