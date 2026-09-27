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
        this.currentColor = '#2F80ED';
        this.isDrawing = false;
        this.fillMode = true;
        this.currentPhase = 'processing';
        this.currentStep = 'input';
        this.lineArtData = null;
        this.activeObjectUrl = null;
        this.processingFrame = null;
        this.cameraRequestId = 0;
        this.imageLoadId = 0;

        // Initialize algorithm registry
        this.algorithmRegistry = new AlgorithmRegistry();

        this.initElements();
        this.initEventListeners();
        this.setStatus('Choose a photo, use the camera, or try the sample.');
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
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileUpload = document.getElementById('fileUpload');
        this.sampleBtn = document.getElementById('sampleBtn');
        this.webcamSection = document.getElementById('webcamSection');
        this.webcam = document.getElementById('webcam');
        this.captureBtn = document.getElementById('captureBtn');
        this.closeWebcamBtn = document.getElementById('closeWebcamBtn');
        this.appStatus = document.getElementById('appStatus');

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
        this.uploadBtn.addEventListener('click', () => this.fileUpload.click());
        this.fileUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        this.sampleBtn.addEventListener('click', () => this.loadSampleImage());
        this.captureBtn.addEventListener('click', () => this.capturePhoto());
        this.closeWebcamBtn.addEventListener('click', () => this.stopWebcam());

        // Navigation
        this.backToInputBtn.addEventListener('click', () => this.goToStep('input'));
        this.proceedToColoringBtn.addEventListener('click', () => this.goToPhase('coloring'));
        this.backToProcessingBtn.addEventListener('click', () => this.goToPhase('processing'));
        this.startOverBtn.addEventListener('click', () => this.reset());

        // Algorithm selection
        this.algorithm.addEventListener('change', () => {
            this.updateControlsVisibility();
            if (this.processedCanvas.width > 0) {
                this.scheduleProcessing();
            }
        });

        // Processing controls (auto-update on change)
        this.useOtsu.addEventListener('change', (e) => {
            this.manualThresholdGroup.style.display = e.target.checked ? 'none' : 'flex';
            if (this.processedCanvas.width > 0) {
                this.scheduleProcessing();
            }
        });
        this.useContrast.addEventListener('change', (e) => {
            if (this.processedCanvas.width > 0) {
                this.scheduleProcessing();
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
                document.querySelectorAll('.color-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                e.target.classList.add('active');
                e.target.setAttribute('aria-pressed', 'true');
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

        window.addEventListener('pagehide', () => this.cleanupResources());
    }

    // ==================== PHASE & STEP NAVIGATION ====================

    goToPhase(phase) {
        if (phase === 'coloring' && (!this.processedCanvas.width || !this.processedCanvas.height)) {
            this.goToStep('input');
            phase = 'processing';
        }

        this.currentPhase = phase;

        // Update phase containers
        this.phaseProcessing.classList.toggle('active', phase === 'processing');
        this.phaseColoring.classList.toggle('active', phase === 'coloring');
        this.phaseProcessing.classList.toggle('hidden', phase !== 'processing');
        this.phaseColoring.classList.toggle('hidden', phase !== 'coloring');
        this.phaseProcessing.hidden = phase !== 'processing';
        this.phaseColoring.hidden = phase !== 'coloring';

        // Update phase indicators
        this.phaseIndicators.forEach(indicator => {
            const indicatorPhase = indicator.dataset.phase;
            if (indicatorPhase === 'input' && phase === 'processing') {
                indicator.classList.add('active');
                indicator.setAttribute('aria-current', 'step');
            } else if (indicatorPhase === 'coloring' && phase === 'coloring') {
                indicator.classList.add('active');
                indicator.setAttribute('aria-current', 'step');
            } else {
                indicator.classList.remove('active');
                indicator.removeAttribute('aria-current');
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
        this.stepInput.classList.toggle('hidden', step !== 'input');
        this.stepConfigure.classList.toggle('hidden', step !== 'configure');
    }

    // ==================== WEBCAM ====================

    async startWebcam() {
        this.stopWebcam();
        const requestId = ++this.cameraRequestId;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 }
            });
            if (requestId !== this.cameraRequestId) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            this.stream = stream;
            this.webcam.srcObject = this.stream;
            this.webcamSection.classList.remove('hidden');
            this.setStatus('Camera ready. Choose Capture Photo when you are ready.');
        } catch (error) {
            if (requestId === this.cameraRequestId) {
                this.stopWebcam();
                this.setStatus('Camera access was not available. You can upload a photo or try the sample instead.');
            }
        }
    }

    stopWebcam() {
        this.cameraRequestId += 1;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        this.stream = null;
        this.webcam.srcObject = null;
        this.webcamSection.classList.add('hidden');
    }

    capturePhoto() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.webcam.videoWidth;
        tempCanvas.height = this.webcam.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.webcam, 0, 0);

        tempCanvas.toBlob((blob) => {
            if (!blob) return;
            const img = new Image();
            const loadId = ++this.imageLoadId;
            let objectUrl;
            img.onload = () => {
                if (loadId === this.imageLoadId) {
                    this.loadImage(img, objectUrl);
                    this.stopWebcam();
                } else {
                    this.revokeObjectUrl(objectUrl);
                }
            };
            img.onerror = () => this.revokeObjectUrl(objectUrl);
            objectUrl = this.setImageObjectUrl(img, blob);
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const img = new Image();
            const loadId = ++this.imageLoadId;
            let objectUrl;
            img.onload = () => {
                if (loadId === this.imageLoadId) {
                    this.loadImage(img, objectUrl);
                } else {
                    this.revokeObjectUrl(objectUrl);
                }
            };
            img.onerror = () => {
                this.revokeObjectUrl(objectUrl);
                if (loadId === this.imageLoadId) {
                    this.setStatus('That image could not be opened. Please choose another image.');
                }
            };
            objectUrl = this.setImageObjectUrl(img, file);
        }
    }

    loadSampleImage() {
        this.revokeObjectUrl();
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 640;
        sampleCanvas.height = 420;
        const ctx = sampleCanvas.getContext('2d');

        ctx.fillStyle = '#dff6ff';
        ctx.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);

        ctx.fillStyle = '#f7d794';
        ctx.beginPath();
        ctx.arc(520, 90, 52, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#78c850';
        ctx.beginPath();
        ctx.moveTo(0, 330);
        ctx.bezierCurveTo(130, 280, 230, 380, 360, 320);
        ctx.bezierCurveTo(470, 270, 560, 320, 640, 290);
        ctx.lineTo(640, 420);
        ctx.lineTo(0, 420);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f5f1df';
        ctx.fillRect(190, 170, 220, 150);
        ctx.fillStyle = '#de6b48';
        ctx.beginPath();
        ctx.moveTo(170, 175);
        ctx.lineTo(300, 80);
        ctx.lineTo(430, 175);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#8cc5e7';
        ctx.fillRect(225, 210, 55, 55);
        ctx.fillRect(325, 210, 55, 55);
        ctx.fillStyle = '#8a5a44';
        ctx.fillRect(280, 245, 50, 75);

        ctx.strokeStyle = '#384152';
        ctx.lineWidth = 8;
        ctx.lineJoin = 'round';
        ctx.strokeRect(190, 170, 220, 150);
        ctx.beginPath();
        ctx.moveTo(170, 175);
        ctx.lineTo(300, 80);
        ctx.lineTo(430, 175);
        ctx.closePath();
        ctx.stroke();
        ctx.strokeRect(225, 210, 55, 55);
        ctx.strokeRect(325, 210, 55, 55);
        ctx.strokeRect(280, 245, 50, 75);

        const img = new Image();
        const loadId = ++this.imageLoadId;
        img.onload = () => {
            if (loadId === this.imageLoadId) this.loadImage(img);
        };
        img.src = sampleCanvas.toDataURL('image/png');
    }

    loadImage(img, objectUrl = null) {
        this.currentImage = img;
        this.stopWebcam();

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
        this.setStatus('Image ready. Adjust the settings or continue to coloring.');
        this.revokeObjectUrl(objectUrl);
    }

    // ==================== IMAGE PROCESSING ====================

    addSliderListener(slider, valueDisplay) {
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
            if (this.processedCanvas.width > 0) {
                this.scheduleProcessing();
            }
        });
    }

    scheduleProcessing() {
        if (this.processingFrame !== null) return;

        this.processingFrame = requestAnimationFrame(() => {
            this.processingFrame = null;
            this.processImage();
        });
    }

    setStatus(message) {
        this.appStatus.textContent = message;
    }

    revokeObjectUrl(objectUrl = this.activeObjectUrl) {
        if (!objectUrl) return;
        URL.revokeObjectURL(objectUrl);
        if (this.activeObjectUrl === objectUrl) this.activeObjectUrl = null;
    }

    setImageObjectUrl(image, source) {
        this.revokeObjectUrl();
        this.activeObjectUrl = URL.createObjectURL(source);
        image.src = this.activeObjectUrl;
        return this.activeObjectUrl;
    }

    cleanupResources() {
        this.stopWebcam();
        this.imageLoadId += 1;
        this.revokeObjectUrl();
        if (this.processingFrame !== null) {
            cancelAnimationFrame(this.processingFrame);
            this.processingFrame = null;
        }
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

        if (!width || !height) {
            return;
        }

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
        this.lineArtData = this.processedCtx.getImageData(0, 0, width, height);
        this.coloringCtx.fillStyle = 'white';
        this.coloringCtx.fillRect(0, 0, width, height);
        this.coloringCtx.drawImage(this.processedCanvas, 0, 0);

        this.setMode('fill');
    }

    setMode(mode) {
        this.fillMode = mode === 'fill';
        this.fillModeBtn.classList.toggle('active', this.fillMode);
        this.drawModeBtn.classList.toggle('active', !this.fillMode);
        this.fillModeBtn.setAttribute('aria-pressed', String(this.fillMode));
        this.drawModeBtn.setAttribute('aria-pressed', String(!this.fillMode));
        this.coloringCanvas.style.cursor = this.fillMode ? 'pointer' : 'crosshair';
    }

    handleCanvasInteraction(e) {
        const { x, y } = this.canvasPoint(e);

        if (this.fillMode) {
            this.floodFill(x, y);
        } else {
            this.startDrawing(e);
        }
    }

    canvasPoint(e) {
        const rect = this.coloringCanvas.getBoundingClientRect();
        const scaleX = this.coloringCanvas.width / rect.width;
        const scaleY = this.coloringCanvas.height / rect.height;

        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY)
        };
    }

    floodFill(startX, startY) {
        const width = this.coloringCanvas.width;
        const height = this.coloringCanvas.height;

        if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
            return;
        }

        const imageData = this.coloringCtx.getImageData(0, 0, this.coloringCanvas.width, this.coloringCanvas.height);
        const data = imageData.data;
        const fillColor = this.hexToRgb(this.currentColor);
        const tolerance = 18;

        const startIndex = startY * width + startX;
        const startPos = startIndex * 4;
        const startR = data[startPos];
        const startG = data[startPos + 1];
        const startB = data[startPos + 2];

        if (
            this.isLinePixel(startIndex) ||
            this.colorDistance(startR, startG, startB, fillColor.r, fillColor.g, fillColor.b) <= tolerance
        ) {
            return;
        }

        const stack = [startIndex];
        const visited = new Uint8Array(width * height);

        while (stack.length > 0) {
            const index = stack.pop();
            if (visited[index]) continue;
            visited[index] = 1;

            const pos = index * 4;
            const r = data[pos];
            const g = data[pos + 1];
            const b = data[pos + 2];

            if (
                this.isLinePixel(index) ||
                this.colorDistance(r, g, b, startR, startG, startB) > tolerance
            ) {
                continue;
            }

            data[pos] = fillColor.r;
            data[pos + 1] = fillColor.g;
            data[pos + 2] = fillColor.b;
            data[pos + 3] = 255;

            const x = index % width;
            const y = Math.floor(index / width);
            if (x + 1 < width) stack.push(index + 1);
            if (x > 0) stack.push(index - 1);
            if (y + 1 < height) stack.push(index + width);
            if (y > 0) stack.push(index - width);
        }

        this.coloringCtx.putImageData(imageData, 0, 0);
    }

    colorDistance(r1, g1, b1, r2, g2, b2) {
        return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2));
    }

    isLinePixel(index) {
        if (!this.lineArtData) return false;

        const pos = index * 4;
        return (
            this.lineArtData.data[pos] < 64 &&
            this.lineArtData.data[pos + 1] < 64 &&
            this.lineArtData.data[pos + 2] < 64
        );
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
        const { x, y } = this.canvasPoint(e);
        this.coloringCtx.beginPath();
        this.coloringCtx.moveTo(x, y);
    }

    stopDrawing() {
        this.isDrawing = false;
        this.coloringCtx.beginPath();
    }

    draw(e) {
        if (!this.isDrawing) return;

        const { x, y } = this.canvasPoint(e);

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
        this.cleanupResources();
        this.goToPhase('processing');
        this.goToStep('input');
        this.currentImage = null;
        this.lineArtData = null;
        this.fileUpload.value = '';
        this.setStatus('Choose a photo, use the camera, or try the sample.');

        // Clear canvases
        this.originalCtx.clearRect(0, 0, this.originalCanvas.width, this.originalCanvas.height);
        this.processedCtx.clearRect(0, 0, this.processedCanvas.width, this.processedCanvas.height);
        this.coloringCtx.clearRect(0, 0, this.coloringCanvas.width, this.coloringCanvas.height);
    }
}

// Initialize app when DOM is ready
const app = new PhotoByNumbers();
