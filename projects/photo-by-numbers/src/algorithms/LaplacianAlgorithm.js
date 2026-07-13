/**
 * Laplacian Edge Detection Algorithm
 *
 * Second-derivative based edge detection.
 * Detects zero-crossings in the second derivative of the image.
 * Can produce sharper edges but may be more sensitive to noise.
 *
 * Pipeline:
 * 1. Grayscale conversion
 * 2. Gaussian blur (important for reducing noise)
 * 3. Laplacian operator application
 * 4. Threshold-based edge selection
 * 5. Morphological operations for cleanup
 */

import { BaseAlgorithm } from './BaseAlgorithm.js';
import * as ImageUtils from '../utils/imageProcessing.js';

export class LaplacianAlgorithm extends BaseAlgorithm {
    constructor() {
        super('Laplacian', {
            blur: 2,
            edgeThreshold: 30,
            morphOpen: 2,
            morphClose: 3,
            lineThickness: 1,
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

        // Step 3: Apply Gaussian Blur (critical for Laplacian)
        const blurAmount = parseFloat(settings.blur);
        if (blurAmount > 0) {
            ImageUtils.applyGaussianBlur(grayscale, width, height, blurAmount);
        }

        // Step 4: Apply Laplacian Operator
        const edges = this.applyLaplacian(grayscale, width, height, settings.edgeThreshold);

        // Step 5: Morphological Opening (remove noise)
        ImageUtils.morphologicalOpen(edges, width, height, settings.morphOpen);

        // Step 6: Morphological Closing (fill gaps)
        ImageUtils.morphologicalClose(edges, width, height, settings.morphClose);

        // Step 7: Apply Line Thickness
        ImageUtils.applyLineThickness(edges, width, height, settings.lineThickness);

        // Step 8: Convert to ImageData
        return ImageUtils.toImageData(edges, width, height);
    }

    applyLaplacian(grayscale, width, height, threshold) {
        const laplacianData = new Uint8ClampedArray(width * height);
        laplacianData.fill(255);

        // Laplacian kernel (detects second derivatives)
        const laplacian = [
            [0, 1, 0],
            [1, -4, 1],
            [0, 1, 0]
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;

                // Convolve with Laplacian kernel
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = (y + ky) * width + (x + kx);
                        const pixel = grayscale[idx];
                        sum += pixel * laplacian[ky + 1][kx + 1];
                    }
                }

                const idx = y * width + x;

                // Threshold on absolute value (detect zero crossings)
                laplacianData[idx] = Math.abs(sum) > threshold ? 0 : 255;
            }
        }

        return laplacianData;
    }
}
