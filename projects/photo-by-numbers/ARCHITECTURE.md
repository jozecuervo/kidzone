# Photo by Numbers - Architecture Documentation

## Image Processing Pipeline

All algorithms follow a standardized pipeline with algorithm-specific variations:

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT: ImageData                         │
│                 (RGB image from canvas)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Preprocessing                                      │
│  ├─ Contrast Enhancement (optional, 1.05x multiplier)       │
│  └─ Convert RGB to Grayscale (average method)               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Noise Reduction                                    │
│  └─ Gaussian Blur (configurable radius 0-5)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Edge Detection (Algorithm-Specific)                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ CANNY ALGORITHM                                      │   │
│  │ 1. Compute gradients (Sobel X and Y)                │   │
│  │ 2. Calculate gradient magnitude and direction       │   │
│  │ 3. Non-maximum suppression                          │   │
│  │ 4. Double thresholding (low/high)                   │   │
│  │ 5. Edge tracking by hysteresis                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ SOBEL ALGORITHM                                      │   │
│  │ 1. Apply Sobel X kernel [-1,0,1; -2,0,2; -1,0,1]    │   │
│  │ 2. Apply Sobel Y kernel [-1,-2,-1; 0,0,0; 1,2,1]    │   │
│  │ 3. Calculate gradient magnitude sqrt(gx² + gy²)     │   │
│  │ 4. Threshold edges (magnitude > threshold)          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ LAPLACIAN ALGORITHM                                  │   │
│  │ 1. Apply Laplacian kernel [0,1,0; 1,-4,1; 0,1,0]    │   │
│  │ 2. Detect zero crossings (second derivative)        │   │
│  │ 3. Threshold on absolute value                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ THRESHOLD + BOUNDARY ALGORITHM                       │   │
│  │ 1. Calculate threshold (Otsu's method or manual)    │   │
│  │ 2. Binary segmentation (pixels < threshold = black) │   │
│  │ 3. Detect boundaries between regions                │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Morphological Operations                           │
│  ├─ Opening (Erosion → Dilation): Remove noise              │
│  └─ Closing (Dilation → Erosion): Fill gaps                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Post-Processing                                    │
│  └─ Apply Line Thickness (repeated dilation)                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 6: Output Conversion                                  │
│  └─ Convert grayscale to RGBA ImageData                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   OUTPUT: ImageData                         │
│              (Black edges on white background)              │
└─────────────────────────────────────────────────────────────┘
```

## Module Structure

### Core Application (`app.js`)
- Main application class `PhotoByNumbers`
- Manages UI state and user interactions
- Coordinates between algorithms and canvas operations
- Handles webcam, file upload, and coloring features

### Algorithm System (`algorithms/`)

#### Base Architecture
```
BaseAlgorithm (abstract)
    │
    ├── CannyAlgorithm
    ├── SobelAlgorithm
    ├── LaplacianAlgorithm
    └── ThresholdAlgorithm

AlgorithmRegistry
    ├── Manages algorithm instances
    ├── Provides lookup by ID
    └── Enables runtime algorithm swapping
```

#### Algorithm Interface
Every algorithm must implement:
```javascript
class MyAlgorithm extends BaseAlgorithm {
    constructor() {
        super('Algorithm Name', defaultSettings);
    }

    // Main processing method
    process(imageData, settings) {
        // 1. Preprocess
        // 2. Apply algorithm-specific edge detection
        // 3. Post-process
        // Return ImageData
    }
}
```

### Utilities (`utils/imageProcessing.js`)

Shared image processing operations:
- `enhanceContrast()` - Multiply pixel values by 1.05
- `convertToGrayscale()` - RGB → Grayscale conversion
- `applyGaussianBlur()` - Gaussian convolution
- `calculateOtsuThreshold()` - Automatic threshold calculation
- `dilate()` / `erode()` - Morphological operations
- `morphologicalOpen()` / `morphologicalClose()` - Combined operations
- `applyLineThickness()` - Edge thickening
- `toImageData()` - Convert to canvas-ready format

## Algorithm Comparison

| Algorithm | Speed | Quality | Best For |
|-----------|-------|---------|----------|
| **Canny** | Medium | Excellent | General purpose, thin clean edges |
| **Sobel** | Fast | Good | Quick processing, simple edges |
| **Laplacian** | Fast | Good | Sharp features, fine details |
| **Threshold** | Medium | Good | High-contrast images, regions |

## Default Settings by Algorithm

### Canny
```javascript
{
    blur: 1.5,
    cannyLow: 50,
    cannyHigh: 150,
    morphOpen: 1,
    morphClose: 1,
    lineThickness: 1,
    useContrast: true
}
```

### Sobel
```javascript
{
    blur: 1,
    edgeThreshold: 50,
    morphOpen: 2,
    morphClose: 2,
    lineThickness: 2,
    useContrast: true
}
```

### Laplacian
```javascript
{
    blur: 2,
    edgeThreshold: 30,
    morphOpen: 2,
    morphClose: 3,
    lineThickness: 1,
    useContrast: true
}
```

### Threshold
```javascript
{
    blur: 1,
    useOtsu: true,
    edgeThreshold: 50,
    morphOpen: 2,
    morphClose: 2,
    lineThickness: 2,
    useContrast: true
}
```

## Extending the System

### Adding a New Algorithm

1. **Create algorithm file**: `algorithms/MyAlgorithm.js`
```javascript
import { BaseAlgorithm } from './BaseAlgorithm.js';
import * as ImageUtils from '../utils/imageProcessing.js';

export class MyAlgorithm extends BaseAlgorithm {
    constructor() {
        super('My Algorithm', {
            // Define default settings
        });
    }

    process(imageData, settings) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Preprocessing
        if (settings.useContrast) {
            ImageUtils.enhanceContrast(data);
        }

        const grayscale = ImageUtils.convertToGrayscale(data, width, height);

        // Your algorithm logic here

        return ImageUtils.toImageData(result, width, height);
    }
}
```

2. **Register in AlgorithmRegistry**: `algorithms/AlgorithmRegistry.js`
```javascript
import { MyAlgorithm } from './MyAlgorithm.js';

registerDefaultAlgorithms() {
    // ... existing algorithms
    this.register('myalgo', new MyAlgorithm());
}
```

3. **Add UI option**: `index.html`
```html
<select id="algorithm">
    <!-- existing options -->
    <option value="myalgo">My Algorithm</option>
</select>
```

### Adding New Image Processing Utilities

Add to `utils/imageProcessing.js`:
```javascript
export function myUtility(data, width, height, params) {
    // Implementation
}
```

Import in algorithm:
```javascript
import * as ImageUtils from '../utils/imageProcessing.js';

// Use in algorithm
ImageUtils.myUtility(data, width, height, params);
```
