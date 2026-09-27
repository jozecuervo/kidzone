/**
 * Sobel Edge Detection Algorithm
 *
 * Classic gradient-based edge detection using Sobel operators.
 * Fast and simple, good for basic edge detection.
 *
 * Pipeline:
 * 1. Grayscale conversion
 * 2. Gaussian blur
 * 3. Sobel gradient calculation
 * 4. Threshold-based edge selection
 * 5. Morphological operations for cleanup
 */

import { BaseAlgorithm } from './BaseAlgorithm.js';
import * as ImageUtils from '../utils/imageProcessing.js';

export class SobelAlgorithm extends BaseAlgorithm {
    constructor() {
        super('Sobel', {
            blur: 1,
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

        // Step 4: Apply Sobel Operator
        const edges = this.applySobel(grayscale, width, height, settings.edgeThreshold);

        // Step 5: Morphological Opening (remove noise)
        ImageUtils.morphologicalOpen(edges, width, height, settings.morphOpen);

        // Step 6: Morphological Closing (fill gaps)
        ImageUtils.morphologicalClose(edges, width, height, settings.morphClose);

        // Step 7: Apply Line Thickness
        ImageUtils.applyLineThickness(edges, width, height, settings.lineThickness);

        // Step 8: Convert to ImageData
        return ImageUtils.toImageData(edges, width, height);
    }

    /**
     * Applies Sobel edge detection to grayscale image
     *
     * The Sobel operator uses two 3×3 convolution kernels to compute
     * gradient approximations in the horizontal (Gx) and vertical (Gy) directions.
     *
     * Sobel Kernels:
     *    Gx (horizontal):        Gy (vertical):
     *    [-1  0  +1]            [-1 -2 -1]
     *    [-2  0  +2]            [ 0  0  0]
     *    [-1  0  +1]            [+1 +2 +1]
     *
     * For each pixel, the gradient magnitude is calculated as:
     *    G = √(Gx² + Gy²)
     *
     * The gradient direction (not used here) would be:
     *    θ = atan2(Gy, Gx)
     *
     * Pixels with gradient magnitude above the threshold are marked as edges.
     *
     * @param {Uint8ClampedArray} grayscale - Grayscale image data
     * @param {number} width - Image width
     * @param {number} height - Image height
     * @param {number} threshold - Minimum gradient magnitude for edge detection
     * @returns {Uint8ClampedArray} Binary edge map (0=edge, 255=non-edge)
     */
    applySobel(grayscale, width, height, threshold) {
        const sobelData = new Uint8ClampedArray(width * height);
        sobelData.fill(255);

        // Sobel kernels for gradient approximation
        const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];  // Gx: horizontal changes
        const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];  // Gy: vertical changes

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0, gy = 0;

                // Convolve with Sobel kernels to compute gradients
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = (y + ky) * width + (x + kx);
                        const pixel = grayscale[idx];
                        gx += pixel * sobelX[ky + 1][kx + 1];  // Horizontal gradient
                        gy += pixel * sobelY[ky + 1][kx + 1];  // Vertical gradient
                    }
                }

                // Calculate gradient magnitude: G = √(Gx² + Gy²)
                const magnitude = Math.sqrt(gx * gx + gy * gy);
                const idx = y * width + x;

                // Threshold: strong gradients are edges (black), weak are not (white)
                sobelData[idx] = magnitude > threshold ? 0 : 255;
            }
        }

        return sobelData;
    }
}
