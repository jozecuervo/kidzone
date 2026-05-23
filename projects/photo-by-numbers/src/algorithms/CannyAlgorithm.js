/**
 * Canny Edge Detection Algorithm
 *
 * Industry-standard edge detection using:
 * 1. Gaussian blur
 * 2. Gradient calculation (Sobel)
 * 3. Non-maximum suppression
 * 4. Double thresholding
 * 5. Edge tracking by hysteresis
 *
 * Produces thin, clean, well-connected edges.
 */

import { BaseAlgorithm } from './BaseAlgorithm.js';
import * as ImageUtils from '../utils/imageProcessing.js';

export class CannyAlgorithm extends BaseAlgorithm {
    constructor() {
        super('Canny', {
            blur: 1.5,
            cannyLow: 50,
            cannyHigh: 150,
            morphOpen: 1,
            morphClose: 1,
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

        // Step 3: Apply Gaussian Blur
        const blurAmount = Math.max(1, parseFloat(settings.blur));
        ImageUtils.applyGaussianBlur(grayscale, width, height, blurAmount);

        // Step 4: Compute Gradients (Sobel operators)
        const { gradients, directions } = this.computeGradients(grayscale, width, height);

        // Step 5: Non-Maximum Suppression
        const suppressed = this.nonMaximumSuppression(gradients, directions, width, height);

        // Step 6: Double Thresholding
        const edges = this.doubleThreshold(suppressed, settings.cannyLow, settings.cannyHigh);

        // Step 7: Edge Tracking by Hysteresis
        this.hysteresisTracking(edges, width, height);

        // Step 8: Apply Line Thickness
        ImageUtils.applyLineThickness(edges, width, height, settings.lineThickness);

        // Step 9: Convert to ImageData
        return ImageUtils.toImageData(edges, width, height);
    }

    computeGradients(grayscale, width, height) {
        const gradients = new Float32Array(width * height);
        const directions = new Float32Array(width * height);

        const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0, gy = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = (y + ky) * width + (x + kx);
                        const pixel = grayscale[idx];
                        gx += pixel * sobelX[ky + 1][kx + 1];
                        gy += pixel * sobelY[ky + 1][kx + 1];
                    }
                }
                const idx = y * width + x;
                gradients[idx] = Math.sqrt(gx * gx + gy * gy);
                directions[idx] = Math.atan2(gy, gx);
            }
        }

        return { gradients, directions };
    }

    nonMaximumSuppression(gradients, directions, width, height) {
        const suppressed = new Uint8ClampedArray(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const angle = directions[idx] * 180 / Math.PI;
                const normalizedAngle = ((angle % 180) + 180) % 180;

                let neighbor1, neighbor2;
                if ((normalizedAngle >= 0 && normalizedAngle < 22.5) || (normalizedAngle >= 157.5 && normalizedAngle < 180)) {
                    neighbor1 = gradients[y * width + (x + 1)];
                    neighbor2 = gradients[y * width + (x - 1)];
                } else if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) {
                    neighbor1 = gradients[(y + 1) * width + (x - 1)];
                    neighbor2 = gradients[(y - 1) * width + (x + 1)];
                } else if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) {
                    neighbor1 = gradients[(y + 1) * width + x];
                    neighbor2 = gradients[(y - 1) * width + x];
                } else {
                    neighbor1 = gradients[(y + 1) * width + (x + 1)];
                    neighbor2 = gradients[(y - 1) * width + (x - 1)];
                }

                if (gradients[idx] >= neighbor1 && gradients[idx] >= neighbor2) {
                    suppressed[idx] = gradients[idx];
                }
            }
        }

        return suppressed;
    }

    doubleThreshold(suppressed, lowThreshold, highThreshold) {
        const edges = new Uint8ClampedArray(suppressed.length);

        for (let i = 0; i < suppressed.length; i++) {
            if (suppressed[i] >= highThreshold) {
                edges[i] = 0; // Strong edge (black)
            } else if (suppressed[i] >= lowThreshold) {
                edges[i] = 128; // Weak edge (gray)
            } else {
                edges[i] = 255; // Not an edge (white)
            }
        }

        return edges;
    }

    hysteresisTracking(edges, width, height) {
        const stack = [];

        // Find all strong edges
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                if (edges[idx] === 0) {
                    stack.push([x, y]);
                }
            }
        }

        // Track connected weak edges
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nidx = ny * width + nx;
                        if (edges[nidx] === 128) {
                            edges[nidx] = 0; // Promote weak to strong
                            stack.push([nx, ny]);
                        }
                    }
                }
            }
        }

        // Remove remaining weak edges
        for (let i = 0; i < edges.length; i++) {
            if (edges[i] === 128) edges[i] = 255;
        }
    }
}
