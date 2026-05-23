/**
 * Image Processing Utilities
 *
 * This module contains common image processing operations used across
 * different edge detection algorithms in the pipeline.
 */

/**
 * Applies contrast enhancement to image data
 * Multiplies each pixel by 1.05 and clips to valid range
 *
 * @param {Uint8ClampedArray} data - RGBA image data
 */
export function enhanceContrast(data) {
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.05);
        data[i + 1] = Math.min(255, data[i + 1] * 1.05);
        data[i + 2] = Math.min(255, data[i + 2] * 1.05);
    }
}

/**
 * Converts RGB image data to grayscale using weighted luminance method
 *
 * Uses the standard ITU-R BT.601 luma coefficients which account for
 * human eye sensitivity: green appears brightest, red medium, blue darkest.
 * This produces more perceptually accurate grayscale than simple averaging.
 *
 * Formula: Y = 0.299R + 0.587G + 0.114B
 *
 * @param {Uint8ClampedArray} data - RGBA image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Uint8ClampedArray} Grayscale pixel values
 */
export function convertToGrayscale(data, width, height) {
    const grayscale = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
        // Weighted method: accounts for human eye perception
        const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayscale[i / 4] = luminance;
    }
    return grayscale;
}

/**
 * Creates a Gaussian kernel for blur operations
 *
 * @param {number} radius - Blur radius
 * @returns {number[][]} 2D Gaussian kernel
 */
export function createGaussianKernel(radius) {
    const size = Math.ceil(radius) * 2 + 1;
    const kernel = [];
    const sigma = radius / 2;
    const twoSigmaSquare = 2 * sigma * sigma;
    const center = Math.floor(size / 2);

    for (let y = 0; y < size; y++) {
        kernel[y] = [];
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            kernel[y][x] = Math.exp(-(dx * dx + dy * dy) / twoSigmaSquare);
        }
    }

    return kernel;
}

/**
 * Applies Gaussian blur to grayscale image data
 *
 * @param {Uint8ClampedArray} data - Grayscale pixel values
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} radius - Blur radius
 */
export function applyGaussianBlur(data, width, height, radius) {
    const kernel = createGaussianKernel(radius);
    const size = kernel.length;
    const half = Math.floor(size / 2);
    const temp = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let weightSum = 0;

            for (let ky = 0; ky < size; ky++) {
                for (let kx = 0; kx < size; kx++) {
                    const px = Math.min(Math.max(x + kx - half, 0), width - 1);
                    const py = Math.min(Math.max(y + ky - half, 0), height - 1);
                    const weight = kernel[ky][kx];
                    sum += data[py * width + px] * weight;
                    weightSum += weight;
                }
            }

            temp[y * width + x] = sum / weightSum;
        }
    }

    for (let i = 0; i < data.length; i++) {
        data[i] = temp[i];
    }
}

/**
 * Applies sharpening filter to grayscale image data
 *
 * Uses a 3x3 sharpening kernel to enhance edges and details:
 *  [ 0, -1,  0]
 *  [-1,  5, -1]
 *  [ 0, -1,  0]
 *
 * This emphasizes high-frequency details and makes edges more prominent.
 *
 * @param {Uint8ClampedArray} data - Grayscale pixel values
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} amount - Sharpening amount (0-1), where 1 is full sharpening
 */
export function applySharpen(data, width, height, amount = 1.0) {
    // Sharpening kernel
    const kernel = [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ];

    const temp = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;

            for (let ky = 0; ky < 3; ky++) {
                for (let kx = 0; kx < 3; kx++) {
                    const px = Math.min(Math.max(x + kx - 1, 0), width - 1);
                    const py = Math.min(Math.max(y + ky - 1, 0), height - 1);
                    sum += data[py * width + px] * kernel[ky][kx];
                }
            }

            // Blend between original and sharpened based on amount
            const original = data[y * width + x];
            temp[y * width + x] = original + (sum - original) * amount;
        }
    }

    for (let i = 0; i < data.length; i++) {
        data[i] = Math.min(255, Math.max(0, temp[i]));
    }
}

/**
 * Calculates optimal threshold using Otsu's method
 * Maximizes inter-class variance for binary segmentation
 *
 * @param {Uint8ClampedArray} grayscale - Grayscale pixel values
 * @returns {number} Optimal threshold value (0-255)
 */
export function calculateOtsuThreshold(grayscale) {
    // Calculate histogram
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < grayscale.length; i++) {
        histogram[Math.floor(grayscale[i])]++;
    }

    // Total number of pixels
    const total = grayscale.length;

    let sum = 0;
    for (let i = 0; i < 256; i++) {
        sum += i * histogram[i];
    }

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 0;

    for (let i = 0; i < 256; i++) {
        wB += histogram[i];
        if (wB === 0) continue;

        wF = total - wB;
        if (wF === 0) break;

        sumB += i * histogram[i];

        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;

        const variance = wB * wF * (mB - mF) * (mB - mF);

        if (variance > maxVariance) {
            maxVariance = variance;
            threshold = i;
        }
    }

    return threshold;
}

/**
 * Morphological dilation operation
 * Expands white regions (or shrinks black regions)
 *
 * @param {Uint8ClampedArray} data - Binary image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 */
export function dilate(data, width, height) {
    const temp = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;

            if (data[idx] === 0) {
                temp[idx] = 0;
                continue;
            }

            let hasBlackNeighbor = false;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nidx = ny * width + nx;
                        if (data[nidx] === 0) {
                            hasBlackNeighbor = true;
                            break;
                        }
                    }
                }
                if (hasBlackNeighbor) break;
            }

            temp[idx] = hasBlackNeighbor ? 0 : 255;
        }
    }

    for (let i = 0; i < data.length; i++) {
        data[i] = temp[i];
    }
}

/**
 * Morphological erosion operation
 * Shrinks white regions (or expands black regions)
 *
 * @param {Uint8ClampedArray} data - Binary image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 */
export function erode(data, width, height) {
    const temp = new Uint8ClampedArray(data.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;

            if (data[idx] === 255) {
                temp[idx] = 255;
                continue;
            }

            let hasWhiteNeighbor = false;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nidx = ny * width + nx;
                        if (data[nidx] === 255) {
                            hasWhiteNeighbor = true;
                            break;
                        }
                    }
                }
                if (hasWhiteNeighbor) break;
            }

            temp[idx] = hasWhiteNeighbor ? 255 : 0;
        }
    }

    for (let i = 0; i < data.length; i++) {
        data[i] = temp[i];
    }
}

/**
 * Applies morphological opening (erosion then dilation)
 * Removes small noise particles
 *
 * @param {Uint8ClampedArray} data - Binary image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} iterations - Number of opening iterations
 */
export function morphologicalOpen(data, width, height, iterations) {
    for (let i = 0; i < iterations; i++) {
        erode(data, width, height);
    }
    for (let i = 0; i < iterations; i++) {
        dilate(data, width, height);
    }
}

/**
 * Applies morphological closing (dilation then erosion)
 * Fills small gaps in regions
 *
 * @param {Uint8ClampedArray} data - Binary image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} iterations - Number of closing iterations
 */
export function morphologicalClose(data, width, height, iterations) {
    for (let i = 0; i < iterations; i++) {
        dilate(data, width, height);
    }
    for (let i = 0; i < iterations; i++) {
        erode(data, width, height);
    }
}

/**
 * Applies line thickness by repeated dilation
 *
 * @param {Uint8ClampedArray} data - Edge image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} thickness - Desired line thickness (1-5)
 */
export function applyLineThickness(data, width, height, thickness) {
    for (let i = 0; i < thickness - 1; i++) {
        dilate(data, width, height);
    }
}

/**
 * Converts grayscale data to ImageData for canvas rendering
 *
 * @param {Uint8ClampedArray} data - Grayscale or binary pixel values
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {ImageData} Canvas-ready ImageData object
 */
export function toImageData(data, width, height) {
    const outputData = new ImageData(width, height);
    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        outputData.data[i * 4] = value;
        outputData.data[i * 4 + 1] = value;
        outputData.data[i * 4 + 2] = value;
        outputData.data[i * 4 + 3] = 255;
    }
    return outputData;
}
