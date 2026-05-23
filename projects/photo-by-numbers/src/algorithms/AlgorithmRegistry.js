/**
 * Algorithm Registry
 *
 * Central registry for all edge detection algorithms.
 * Provides easy access to algorithms by name and manages algorithm lifecycle.
 */

import { CannyAlgorithm } from './CannyAlgorithm.js';
import { SobelAlgorithm } from './SobelAlgorithm.js';
import { LaplacianAlgorithm } from './LaplacianAlgorithm.js';
import { ThresholdAlgorithm } from './ThresholdAlgorithm.js';

export class AlgorithmRegistry {
    constructor() {
        this.algorithms = new Map();
        this.registerDefaultAlgorithms();
    }

    /**
     * Registers all default algorithms
     */
    registerDefaultAlgorithms() {
        this.register('canny', new CannyAlgorithm());
        this.register('sobel', new SobelAlgorithm());
        this.register('laplacian', new LaplacianAlgorithm());
        this.register('threshold', new ThresholdAlgorithm());
    }

    /**
     * Registers a new algorithm
     * @param {string} id - Unique algorithm identifier
     * @param {BaseAlgorithm} algorithm - Algorithm instance
     */
    register(id, algorithm) {
        this.algorithms.set(id, algorithm);
    }

    /**
     * Gets an algorithm by ID
     * @param {string} id - Algorithm identifier
     * @returns {BaseAlgorithm} Algorithm instance
     */
    get(id) {
        const algorithm = this.algorithms.get(id);
        if (!algorithm) {
            throw new Error(`Algorithm '${id}' not found`);
        }
        return algorithm;
    }

    /**
     * Gets all registered algorithm IDs
     * @returns {string[]} Array of algorithm IDs
     */
    getIds() {
        return Array.from(this.algorithms.keys());
    }

    /**
     * Gets all registered algorithms
     * @returns {Map<string, BaseAlgorithm>} Map of algorithms
     */
    getAll() {
        return this.algorithms;
    }

    /**
     * Checks if an algorithm exists
     * @param {string} id - Algorithm identifier
     * @returns {boolean} True if algorithm exists
     */
    has(id) {
        return this.algorithms.has(id);
    }
}
