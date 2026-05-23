/**
 * Photo by Numbers - Main Application
 * Phase-based UI: Image Processing → Coloring Tool
 */

import { AlgorithmRegistry } from './algorithms/AlgorithmRegistry.js';

class PhotoByNumbers {
    constructor() {
        // State
        this.stream = null;
        this.currentImage = null;
        this.currentColor = '#000000';
        this.isDrawing = false;
        this.fillMode = true;
        this.currentPhase = 'processing';
        this.currentStep = 'input';

        // Initialize algorithm registry
        this.algorithmRegistry = new AlgorithmRegistry();

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        // Phase elements
        this.phaseProcessing = document.getElementById('phase-processing');
        this.phaseColoring = document.getElementById('phase-coloring');
        this.phaseIndicators = document.querySelectorAll('.phase-step');

        // Step elements
        this.stepInput = document.getElementById('step-input');
        this.stepConfigure = document.getElementById('step-configure');

        // Webcam controls
        this.webcamBtn = document.getElementById('webcamBtn');
        this.fileUpload = document.getElementById('fileUpload');
        this.webcamSection = document.getElementById('webcamSection');
        this.webcam = document.getElementById('webcam');
        this.captureBtn = document.getElementById('captureBtn');
        this.closeWebcamBtn = document.getElementById('closeWebcamBtn');

        // Canvas elements
        this.originalCanvas = document.getElementById('originalCanvas');
        this.processedCanvas = document.getElementById('processedCanvas');
        this.originalCtx = this.originalCanvas.getContext('2d');
        this.processedCtx = this.processedCanvas.getContext('2d');

        // Algorithm controls
        this.algorithm = document.getElementById('algorithm');
        this.useOtsu = document.getElementById('useOtsu');
        this.manualThresholdGroup = document.getElementById('manualThresholdGroup');
        this.edgeThreshold = document.getElementById('edgeThreshold');
        this.thresholdValue = document.getElementById('thresholdValue');
        this.cannyLowGroup = document.getElementById('cannyLowGroup');
        this.cannyLow = document.getElementById('cannyLow');
        this.cannyLowValue = document.getElementById('cannyLowValue');
        this.cannyHighGroup = document.getElementById('cannyHighGroup');
        this.cannyHigh = document.getElementById('cannyHigh');
        this.cannyHighValue = document.getElementById('cannyHighValue');
        this.blur = document.getElementById('blur');
        this.blurValue = document.getElementById('blurValue');
        this.useContrast = document.getElementById('useContrast');
        this.morphOpen = document.getElementById('morphOpen');
        this.morphOpenValue = document.getElementById('morphOpenValue');
        this.morphClose = document.getElementById('morphClose');
        this.morphCloseValue = document.getElementById('morphCloseValue');
        this.lineThickness = document.getElementById('lineThickness');
        this.lineThicknessValue = document.getElementById('lineThicknessValue');

        // Navigation buttons
        this.backToInputBtn = document.getElementById('backToInputBtn');
        this.processBtn = document.getElementById('processBtn');
        this.proceedToColoringBtn = document.getElementById('proceedToColoringBtn');
        this.backToProcessingBtn = document.getElementById('backToProcessingBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.startOverBtn = document.getElementById('startOverBtn');

        // Coloring controls
        this.coloringCanvas = document.getElementById('coloringCanvas');
        this.coloringCtx = this.coloringCanvas.getContext('2d');
        this.colorPicker = document.getElementById('colorPicker');
        this.fillModeBtn = document.getElementById('fillModeBtn');
        this.drawModeBtn = document.getElementById('drawModeBtn');

        // Initialize UI state
        this.manualThresholdGroup.style.display = 'none';
        this.cannyLowGroup.style.display = 'none';
        this.cannyHighGroup.style.display = 'none';
    }

    initEventListeners() {
        // Webcam events
        this.webcamBtn.addEventListener('click', () => this.startWebcam());
        this.fileUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        this.captureBtn.addEventListener('click', () => this.capturePhoto());
        this.closeWebcamBtn.addEventListener('click', () => this.stopWebcam());

        // Navigation
        this.backToInputBtn.addEventListener('click', () => this.goToStep('input'));
        this.proceedToColoringBtn.addEventListener('click', () => this.goToPhase('coloring'));
        this.backToProcessingBtn.addEventListener('click', () => this.goToPhase('processing'));
        this.startOverBtn.addEventListener('click', () => this.reset());

        // Algorithm selection
        this.algorithm.addEventListener('click', (e) => {
            this.updateControlsVisibility();
            if (this.processedCanvas.width > 0) {
                this.processImage();
            }
        });

        // Processing controls (auto-update on change)
        this.useOtsu.addEventListener('change', (e) => {
            this.manualThresholdGroup.style.display = e.target.checked ? 'none' : 'flex';
            if (this.processedCanvas.width > 0) {
                this.processImage();
            }
        });
        this.useContrast.addEventListener('change', (e) => {
            if (this.processedCanvas.width > 0) {
                this.processImage();
            }
        });

        // Slider events with real-time updates
        this.addSliderListener(this.edgeThreshold, this.thresholdValue);
        this.addSliderListener(this.blur, this.blurValue);
        this.addSliderListener(this.morphOpen, this.morphOpenValue);
        this.addSliderListener(this.morphClose, this.morphCloseValue);
        this.addSliderListener(this.lineThickness, this.lineThicknessValue);
        this.addSliderListener(this.cannyLow, this.cannyLowValue);
        this.addSliderListener(this.cannyHigh, this.cannyHighValue);

        // Action buttons
        this.processBtn.addEventListener('click', () => this.processImage());
        this.downloadBtn.addEventListener('click', () => this.downloadImage());

        // Coloring events
        this.colorPicker.addEventListener('change', (e) => {
            this.currentColor = e.target.value;
        });

        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentColor = e.target.dataset.color;
                this.colorPicker.value = this.currentColor;
            });
        });

        this.fillModeBtn.addEventListener('click', () => this.setMode('fill'));
        this.drawModeBtn.addEventListener('click', () => this.setMode('draw'));

        // Canvas drawing events
        this.coloringCanvas.addEventListener('mousedown', (e) => this.handleCanvasInteraction(e));
        this.coloringCanvas.addEventListener('mousemove', (e) => this.draw(e));
        this.coloringCanvas.addEventListener('mouseup', () => this.stopDrawing());
        this.coloringCanvas.addEventListener('mouseout', () => this.stopDrawing());

        this.coloringCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleCanvasInteraction(e.touches[0]);
        });
        this.coloringCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.coloringCanvas.addEventListener('touchend', () => this.stopDrawing());
    }

    // ==================== PHASE & STEP NAVIGATION ====================

    goToPhase(phase) {
        this.currentPhase = phase;

        // Update phase containers
        this.phaseProcessing.classList.toggle('active', phase === 'processing');
        this.phaseColoring.classList.toggle('active', phase === 'coloring');

        // Update phase indicators
        this.phaseIndicators.forEach(indicator => {
            const indicatorPhase = indicator.dataset.phase;
            if (indicatorPhase === 'input' && phase === 'processing') {
                indicator.classList.add('active');
            } else if (indicatorPhase === 'coloring' && phase === 'coloring') {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });

        // Initialize coloring canvas when entering coloring phase
        if (phase === 'coloring') {
            this.initializeColoringCanvas();
        }
    }

    goToStep(step) {
        this.currentStep = step;

        // Update step visibility
        this.stepInput.classList.toggle('active', step === 'input');
        this.stepConfigure.classList.toggle('active', step === 'configure');
    }

    // ==================== WEBCAM ====================

    async startWebcam() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 }
            });
            this.webcam.srcObject = this.stream;
            this.webcamSection.classList.remove('hidden');
        } catch (error) {
            alert('Unable to access webcam: ' + error.message);
        }
    }

    stopWebcam() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.webcam.srcObject = null;
            this.webcamSection.classList.add('hidden');
        }
    }

    capturePhoto() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.webcam.videoWidth;
        tempCanvas.height = this.webcam.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.webcam, 0, 0);

        tempCanvas.toBlob((blob) => {
            const img = new Image();
            img.onload = () => {
                this.loadImage(img);
                this.stopWebcam();
            };
            img.src = URL.createObjectURL(blob);
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => this.loadImage(img);
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    loadImage(img) {
        this.currentImage = img;

        const maxWidth = 800;
        const maxHeight = 600;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
        }

        this.originalCanvas.width = width;
        this.originalCanvas.height = height;
        this.processedCanvas.width = width;
        this.processedCanvas.height = height;

        this.originalCtx.drawImage(img, 0, 0, width, height);

        // Move to configure step
        this.goToStep('configure');

        // Auto-process
        this.processImage();
    }

    // ==================== IMAGE PROCESSING ====================

    addSliderListener(slider, valueDisplay) {
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
            if (this.processedCanvas.width > 0) {
                this.processImage();
            }
        });
    }

    updateControlsVisibility() {
        const algoId = this.algorithm.value;
        const algorithm = this.algorithmRegistry.get(algoId);
        const preset = algorithm.getDefaultSettings();

        // Apply preset values
        if (preset.blur !== undefined) {
            this.blur.value = preset.blur;
            this.blurValue.textContent = preset.blur;
        }
        if (preset.cannyLow !== undefined) {
            this.cannyLow.value = preset.cannyLow;
            this.cannyLowValue.textContent = preset.cannyLow;
        }
        if (preset.cannyHigh !== undefined) {
            this.cannyHigh.value = preset.cannyHigh;
            this.cannyHighValue.textContent = preset.cannyHigh;
        }
        if (preset.edgeThreshold !== undefined) {
            this.edgeThreshold.value = preset.edgeThreshold;
            this.thresholdValue.textContent = preset.edgeThreshold;
        }
        if (preset.morphOpen !== undefined) {
            this.morphOpen.value = preset.morphOpen;
            this.morphOpenValue.textContent = preset.morphOpen;
        }
        if (preset.morphClose !== undefined) {
            this.morphClose.value = preset.morphClose;
            this.morphCloseValue.textContent = preset.morphClose;
        }
        if (preset.lineThickness !== undefined) {
            this.lineThickness.value = preset.lineThickness;
            this.lineThicknessValue.textContent = preset.lineThickness;
        }
        if (preset.useContrast !== undefined) {
            this.useContrast.checked = preset.useContrast;
        }
        if (preset.useOtsu !== undefined) {
            this.useOtsu.checked = preset.useOtsu;
        }

        // Show/hide controls based on algorithm
        if (algoId === 'canny') {
            this.cannyLowGroup.style.display = 'flex';
            this.cannyHighGroup.style.display = 'flex';
            this.useOtsu.parentElement.style.display = 'none';
            this.manualThresholdGroup.style.display = 'none';
        } else if (algoId === 'threshold') {
            this.cannyLowGroup.style.display = 'none';
            this.cannyHighGroup.style.display = 'none';
            this.useOtsu.parentElement.style.display = 'block';
            this.manualThresholdGroup.style.display = this.useOtsu.checked ? 'none' : 'flex';
        } else {
            this.cannyLowGroup.style.display = 'none';
            this.cannyHighGroup.style.display = 'none';
            this.useOtsu.parentElement.style.display = 'none';
            this.manualThresholdGroup.style.display = 'flex';
        }
    }

    processImage() {
        const width = this.originalCanvas.width;
        const height = this.originalCanvas.height;

        const imageData = this.originalCtx.getImageData(0, 0, width, height);

        const algoId = this.algorithm.value;
        const algorithm = this.algorithmRegistry.get(algoId);

        const settings = {
            blur: parseFloat(this.blur.value),
            edgeThreshold: parseInt(this.edgeThreshold.value),
            cannyLow: parseInt(this.cannyLow.value),
            cannyHigh: parseInt(this.cannyHigh.value),
            morphOpen: parseInt(this.morphOpen.value),
            morphClose: parseInt(this.morphClose.value),
            lineThickness: parseInt(this.lineThickness.value),
            useContrast: this.useContrast.checked,
            useOtsu: this.useOtsu.checked
        };

        const edges = algorithm.process(imageData, settings);
        this.processedCtx.putImageData(edges, 0, 0);
    }

    // ==================== COLORING ====================

    initializeColoringCanvas() {
        const width = this.processedCanvas.width;
        const height = this.processedCanvas.height;

        this.coloringCanvas.width = width;
        this.coloringCanvas.height = height;
        this.coloringCtx.fillStyle = 'white';
        this.coloringCtx.fillRect(0, 0, width, height);
        this.coloringCtx.drawImage(this.processedCanvas, 0, 0);

        this.setMode('fill');
    }

    setMode(mode) {
        this.fillMode = mode === 'fill';
        this.fillModeBtn.classList.toggle('active', this.fillMode);
        this.drawModeBtn.classList.toggle('active', !this.fillMode);
        this.coloringCanvas.style.cursor = this.fillMode ? 'pointer' : 'crosshair';
    }

    handleCanvasInteraction(e) {
        const rect = this.coloringCanvas.getBoundingClientRect();
        const scaleX = this.coloringCanvas.width / rect.width;
        const scaleY = this.coloringCanvas.height / rect.height;
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        if (this.fillMode) {
            this.floodFill(x, y);
        } else {
            this.startDrawing(e);
        }
    }

    floodFill(startX, startY) {
        const imageData = this.coloringCtx.getImageData(0, 0, this.coloringCanvas.width, this.coloringCanvas.height);
        const data = imageData.data;
        const width = this.coloringCanvas.width;
        const height = this.coloringCanvas.height;

        const startPos = (startY * width + startX) * 4;
        const startR = data[startPos];
        const startG = data[startPos + 1];
        const startB = data[startPos + 2];

        const fillColor = this.hexToRgb(this.currentColor);

        if (startR === fillColor.r && startG === fillColor.g && startB === fillColor.b) {
            return;
        }

        const stack = [[startX, startY]];
        const visited = new Set();

        while (stack.length > 0) {
            const [x, y] = stack.pop();

            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const pos = (y * width + x) * 4;
            const r = data[pos];
            const g = data[pos + 1];
            const b = data[pos + 2];

            if (Math.abs(r - startR) > 10 || Math.abs(g - startG) > 10 || Math.abs(b - startB) > 10) {
                continue;
            }

            data[pos] = fillColor.r;
            data[pos + 1] = fillColor.g;
            data[pos + 2] = fillColor.b;
            data[pos + 3] = 255;

            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }

        this.coloringCtx.putImageData(imageData, 0, 0);
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    startDrawing(e) {
        this.isDrawing = true;
        this.draw(e);
    }

    stopDrawing() {
        this.isDrawing = false;
        this.coloringCtx.beginPath();
    }

    draw(e) {
        if (!this.isDrawing) return;

        const rect = this.coloringCanvas.getBoundingClientRect();
        const scaleX = this.coloringCanvas.width / rect.width;
        const scaleY = this.coloringCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        this.coloringCtx.lineWidth = 3;
        this.coloringCtx.lineCap = 'round';
        this.coloringCtx.strokeStyle = this.currentColor;

        this.coloringCtx.lineTo(x, y);
        this.coloringCtx.stroke();
        this.coloringCtx.beginPath();
        this.coloringCtx.moveTo(x, y);
    }

    downloadImage() {
        const link = document.createElement('a');
        link.download = 'colored-drawing.png';
        link.href = this.coloringCanvas.toDataURL();
        link.click();
    }

    reset() {
        this.goToPhase('processing');
        this.goToStep('input');
        this.currentImage = null;
        this.fileUpload.value = '';
        this.stopWebcam();

        // Clear canvases
        this.originalCtx.clearRect(0, 0, this.originalCanvas.width, this.originalCanvas.height);
        this.processedCtx.clearRect(0, 0, this.processedCanvas.width, this.processedCanvas.height);
        this.coloringCtx.clearRect(0, 0, this.coloringCanvas.width, this.coloringCanvas.height);
    }
}

// Initialize app when DOM is ready
const app = new PhotoByNumbers();
