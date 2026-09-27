# Photo by Numbers

A web application that transforms photos into line drawings that you can color in, similar to paint-by-numbers books.

## Features

- **Webcam Capture**: Take a photo directly from your webcam
- **File Upload**: Upload any image from your device
- **Edge Detection**: Converts photos to line drawings using Sobel edge detection
- **Adjustable Settings**:
  - Edge Detection Sensitivity: Control how strong edges need to be
  - Blur/Smoothing: Reduce noise for cleaner lines
- **Interactive Coloring**: Color in your line drawing with:
  - Custom color picker
  - Preset color palette
  - Drawing with mouse or touch
- **Download**: Save your colored masterpiece

## Quick Start

```bash
# Install Node.js (if not already installed)
# Then run:

npm start
```

The app will be available at **http://localhost:8000**

## How to Use

1. **Start the server** using `npm start`
2. **Open** http://localhost:8000 in your web browser
3. **Choose** either:
   - Click "Use Webcam" to take a photo
   - Click "Upload Photo" to select an image file
4. **Select** an edge detection algorithm (Canny recommended)
5. **Adjust** the settings in real-time as you see fit
6. **Convert** to line drawing (auto-converts as you adjust sliders)
7. **Color** your drawing using the color picker and fill/draw tools
8. **Download** your finished artwork

## Technical Details

- Pure HTML, CSS, and JavaScript (no external dependencies)
- ES6 modules for clean, modular architecture
- Uses Canvas API for image processing
- Multiple edge detection algorithms:
  - **Canny**: Industry-standard with gradient calculation, non-maximum suppression, and hysteresis
  - **Sobel**: Classic gradient-based detection
  - **Laplacian**: Second-derivative based detection
  - **Threshold + Boundary**: Otsu's thresholding with boundary detection
- Advanced image processing pipeline:
  - Contrast enhancement
  - Gaussian blur
  - Morphological operations (opening/closing)
  - Automatic threshold calculation (Otsu's method)
- Responsive design for mobile and desktop

## Accessibility note

Image selection, processing controls, modes, and preset colors are keyboard accessible. The canvas coloring surface still requires pointer or touch input; a keyboard coloring alternative is a planned improvement.

## Project Structure

```
photo-by-numbers/
├── server.js               # Node.js HTTP server (zero dependencies)
├── package.json            # NPM configuration
├── README.md               # This file
├── ARCHITECTURE.md         # Technical documentation
└── src/                    # Application source code
    ├── index.html          # Main HTML file
    ├── style.css           # Styling
    ├── app.js              # Main application (ES6 module)
    ├── algorithms/         # Edge detection algorithms
    │   ├── BaseAlgorithm.js    # Abstract base class
    │   ├── AlgorithmRegistry.js # Algorithm management
    │   ├── CannyAlgorithm.js   # Canny edge detection
    │   ├── SobelAlgorithm.js   # Sobel edge detection
    │   ├── LaplacianAlgorithm.js # Laplacian edge detection
    │   └── ThresholdAlgorithm.js # Threshold + boundary detection
    └── utils/              # Shared utilities
        └── imageProcessing.js  # Image processing operations
```

## Adding New Algorithms

The modular architecture makes it easy to add new edge detection algorithms:

1. Create a new class extending `BaseAlgorithm` in `algorithms/`
2. Implement the `process(imageData, settings)` method
3. Define default settings in the constructor
4. Register the algorithm in `AlgorithmRegistry.js`
5. Add option to the `<select>` in `index.html`

Example:
```javascript
import { BaseAlgorithm } from './BaseAlgorithm.js';
import * as ImageUtils from '../utils/imageProcessing.js';

export class MyAlgorithm extends BaseAlgorithm {
    constructor() {
        super('My Algorithm', {
            // default settings
        });
    }

    process(imageData, settings) {
        // Your algorithm implementation
        // Return processed ImageData
    }
}
```

## Browser Requirements

- Modern browser with support for:
  - getUserMedia API (for webcam)
  - Canvas API
  - ES6 JavaScript

## Development

### Starting the Server

```bash
npm start
```

The server will:
- Start on port 8000 (or PORT environment variable)
- Serve all static files with proper MIME types
- Enable webcam access (requires HTTPS in production)
- Log all requests to console

### Server Features

- **Zero dependencies**: Uses only Node.js built-in modules
- **Security**: Prevents directory traversal attacks
- **MIME types**: Properly serves all file types (HTML, CSS, JS, images, fonts)
- **ES6 modules**: Full support for modern JavaScript modules
- **Graceful shutdown**: Handles Ctrl+C cleanly

### Changing the Port

```bash
PORT=3000 npm start
```
