/**
 * Base Algorithm Class
 *
 * Abstract base class that defines the interface for edge detection algorithms.
 * All algorithms follow a standard pipeline structure.
 */

export class BaseAlgorithm {
    /**
     * @param {string} name - Algorithm display name
     * @param {Object} defaultSettings - Default parameter values
     */
    constructor(name, defaultSettings) {
        this.name = name;
        this.defaultSettings = defaultSettings;
    }

    /**
     * Main processing method - must be implemented by subclasses
     *
     * Image Processing Pipeline:
     * 1. Preprocessing (contrast enhancement, etc.)
     * 2. Grayscale conversion
     * 3. Blur/smoothing
     * 4. Edge detection (algorithm-specific)
     * 5. Morphological operations
     * 6. Post-processing (line thickness, etc.)
     *
     * @param {ImageData} imageData - Source image data
     * @param {Object} settings - Processing parameters
     * @returns {ImageData} Processed edge-detected image
     */
    process(imageData, settings) {
        throw new Error('process() must be implemented by subclass');
    }

    /**
     * Gets default settings for this algorithm
     * @returns {Object} Default settings object
     */
    getDefaultSettings() {
        return { ...this.defaultSettings };
    }

    /**
     * Gets algorithm name
     * @returns {string} Algorithm name
     */
    getName() {
        return this.name;
    }
}
