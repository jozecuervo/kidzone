/**
 * Threshold + Boundary Detection Algorithm
 *
 * Combines automatic thresholding (Otsu's method) with boundary detection.
 * Good for high-contrast images where clear regions exist.
 *
 * Pipeline:
 * 1. Grayscale conversion
 * 2. Gaussian blur
 * 3. Otsu's automatic thresholding (or manual)
 * 4. Binary segmentation
 * 5. Morphological operations on regions
 * 6. Boundary detection between regions
 */

import { BaseAlgorithm } from './BaseAlgorithm.js';
import * as ImageUtils from '../utils/imageProcessing.js';

export class ThresholdAlgorithm extends BaseAlgorithm {
    constructor() {
        super('Threshold + Boundary', {
            blur: 1,
            useOtsu: true,
            edgeThreshold: 50,
            morphOpen: 2,
            morphClose: 2,
            lineThickness: 2,
            useContrast: true
        });
    }

    process(imageData, settings) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Step 1: Contrast Enhancement
        if (settings.useContrast) {
            ImageUtils.enhanceContrast(data);
        }

        // Step 2: Convert to Grayscale
        const grayscale = ImageUtils.convertToGrayscale(data, width, height);

        // Step 3: Apply Gaussian Blur
        const blurAmount = parseFloat(settings.blur);
        if (blurAmount > 0) {
            ImageUtils.applyGaussianBlur(grayscale, width, height, blurAmount);
        }

        // Step 4: Threshold (Otsu's or manual)
        const threshold = settings.useOtsu ?
            ImageUtils.calculateOtsuThreshold(grayscale) :
            parseInt(settings.edgeThreshold);

        const binaryData = new Uint8ClampedArray(width * height);
        for (let i = 0; i < grayscale.length; i++) {
            binaryData[i] = grayscale[i] < threshold ? 0 : 255;
        }

        // Step 5: Morphological Opening (remove noise from regions)
        ImageUtils.morphologicalOpen(binaryData, width, height, settings.morphOpen);

        // Step 6: Morphological Closing (fill gaps in regions)
        ImageUtils.morphologicalClose(binaryData, width, height, settings.morphClose);

        // Step 7: Detect Boundaries between regions
        const edges = this.detectBoundaries(binaryData, width, height);

        // Step 8: Apply Line Thickness
        ImageUtils.applyLineThickness(edges, width, height, settings.lineThickness);

        // Step 9: Convert to ImageData
        return ImageUtils.toImageData(edges, width, height);
    }

    detectBoundaries(binaryData, width, height) {
        const edgeData = new Uint8ClampedArray(width * height);
        edgeData.fill(255); // Start with all white

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const current = binaryData[idx];

                // Check if any neighbor has a different value
                let hasDifferentNeighbor = false;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nidx = (y + dy) * width + (x + dx);
                        if (binaryData[nidx] !== current) {
                            hasDifferentNeighbor = true;
                            break;
                        }
                    }
                    if (hasDifferentNeighbor) break;
                }

                // Mark boundaries as black
                if (hasDifferentNeighbor) {
                    edgeData[idx] = 0;
                }
            }
        }

        return edgeData;
    }
}
