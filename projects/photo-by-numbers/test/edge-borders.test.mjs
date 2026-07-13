import assert from 'node:assert/strict';
import test from 'node:test';

import { LaplacianAlgorithm } from '../src/algorithms/LaplacianAlgorithm.js';
import { SobelAlgorithm } from '../src/algorithms/SobelAlgorithm.js';

const width = 5;
const height = 4;
const grayscale = new Uint8ClampedArray(width * height).fill(100);

function assertWhiteBorder(edgeMap) {
    for (let x = 0; x < width; x++) {
        assert.equal(edgeMap[x], 255);
        assert.equal(edgeMap[(height - 1) * width + x], 255);
    }

    for (let y = 0; y < height; y++) {
        assert.equal(edgeMap[y * width], 255);
        assert.equal(edgeMap[y * width + width - 1], 255);
    }
}

test('Sobel leaves skipped border pixels white', () => {
    assertWhiteBorder(new SobelAlgorithm().applySobel(grayscale, width, height, 50));
});

test('Laplacian leaves skipped border pixels white', () => {
    assertWhiteBorder(new LaplacianAlgorithm().applyLaplacian(grayscale, width, height, 30));
});
