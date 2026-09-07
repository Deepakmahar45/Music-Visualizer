/* =========================================================
   MIRROR WAVE RENDERER (SYMMETRICAL DUAL-AXIS WAVEFORM)
   js/visualizer/mirror-wave.js
   ========================================================= */

(function () {
    "use strict";

    class MirrorWaveRenderer {
        constructor(options = {}) {
            this.manager = options.manager || null;
            this.canvasRenderer = options.canvasRenderer || null;

            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;

            this.waveform = null;
            this.energy = 0;
            this.bass = 0;
            this.beat = false;
            this.beatStrength = 0;

            this.lastTimestamp = 0;
            this.animationTime = 0;

            this.targetPoints = [];
            this.smoothedPoints = [];

            this.settings = {
                color: "#ffffff",
                secondaryColor: "#7db7ff",
                size: 1,
                opacity: 1,
                lineWidth: 2.5,
                amplitude: 1,
                sensitivity: 1,
                smoothing: 0.80,
                samples: 180,
                glow: true,
                glowIntensity: 18,
                fill: false,
                fillOpacity: 0.12,
                centerGap: 0,
                beatReaction: true,
                beatScale: 1.12,
                bassReaction: true,
                bassAmount: 0.30,
                blendMode: "screen",
                centerLine: false,
                animationSpeed: 1
            };

            if (options.manager || options.canvasRenderer) {
                this.init(options);
            }
        }

        /* =====================================================
           INIT & DEPENDENCY INJECTION
           ===================================================== */

        init(options = {}) {
            if (options.manager) this.manager = options.manager;
            if (options.canvasRenderer) this.canvasRenderer = options.canvasRenderer;

            this.connect({
                audioAnalyzer: options.audioAnalyzer || this.manager?.audioAnalyzer || window.audioAnalyzer,
                frequencyAnalyzer: options.frequencyAnalyzer || this.manager?.frequencyAnalyzer || window.frequencyAnalyzer,
                beatDetector: options.beatDetector || this.manager?.beatDetector || window.beatDetector
            });

            return this;
        }

        connect({ audioAnalyzer = null, frequencyAnalyzer = null, beatDetector = null } = {}) {
            this.audioAnalyzer = audioAnalyzer;
            this.frequencyAnalyzer = frequencyAnalyzer;
            this.beatDetector = beatDetector;
            return this;
        }

        /* =====================================================
           SETTINGS CONFIGURATION
           ===================================================== */

        setSettings(settings = {}) {
            Object.assign(this.settings, settings);

            this.settings.size = Math.max(0.05, Number(this.settings.size) || 1);
            this.settings.opacity = Math.max(0, Math.min(1, Number(this.settings.opacity) || 0));
            this.settings.lineWidth = Math.max(0.5, Number(this.settings.lineWidth) || 1);
            this.settings.smoothing = Math.max(0, Math.min(0.99, Number(this.settings.smoothing) || 0));
            this.settings.samples = Math.max(20, Math.floor(Number(this.settings.samples) || 180));
            this.settings.amplitude = Math.max(0, Number(this.settings.amplitude) || 0);
            this.settings.sensitivity = Math.max(0, Number(this.settings.sensitivity) || 0);

            return this;
        }

        getSettings() {
            return { ...this.settings };
        }

        /* =====================================================
           UPDATE (Engine Synchronization)
           ===================================================== */

        update(audioData = {}, timestamp = performance.now()) {
            let delta = 0.016;

            if (this.lastTimestamp) {
                delta = Math.min(0.05, Math.max(0, (timestamp - this.lastTimestamp) / 1000));
            }

            this.lastTimestamp = timestamp;
            this.animationTime += delta * this.settings.animationSpeed;

            this.waveform = audioData.waveform || this.audioAnalyzer?.getWaveform?.() || null;
            this.energy = Number(audioData.energy) || this.audioAnalyzer?.getEnergy?.() || 0;
            this.bass = Number(audioData.bass) || this.audioAnalyzer?.getBass?.() || 0;

            // Correct API mapping matching BeatDetector
            this.beat = Boolean(audioData.beat) ||
                        this.beatDetector?.getBeat?.() ||
                        this.audioAnalyzer?.getBeat?.() ||
                        false;

            this.beatStrength = Number(audioData.beatStrength) ||
                                this.beatDetector?.getStrength?.() ||
                                this.audioAnalyzer?.getBeatStrength?.() ||
                                0;

            this._processWaveform();
            return this;
        }

        /* =====================================================
           PROCESS WAVEFORM (Edge Normalization & Decay)
           ===================================================== */

        _processWaveform() {
            if (!this.waveform || !this.waveform.length) {
                // Smooth decay when music pauses
                for (let i = 0; i < this.smoothedPoints.length; i++) {
                    this.smoothedPoints[i] *= 0.88;
                }
                return;
            }

            const source = this.waveform;
            const sampleCount = Math.min(this.settings.samples, source.length);

            if (this.targetPoints.length !== sampleCount) {
                this.targetPoints = new Float32Array(sampleCount);
                this.smoothedPoints = new Float32Array(sampleCount);
            }

            const step = source.length / sampleCount;
            const smoothing = this.settings.smoothing;
            const isByteData = source instanceof Uint8Array;

            for (let i = 0; i < sampleCount; i++) {
                const index = Math.min(source.length - 1, Math.floor(i * step));
                let value = Number(source[index]) || 0;

                // Handles Uint8 [0..255] and Float32 [-1..1] safely
                if (isByteData || value > 1 || value < -1) {
                    value = (value - 128) / 128;
                }

                value *= this.settings.amplitude * this.settings.sensitivity;

                this.targetPoints[i] = value;
                this.smoothedPoints[i] = this.smoothedPoints[i] * smoothing + value * (1 - smoothing);
            }
        }

        /* =====================================================
           RENDER
           ===================================================== */

        render(ctx, renderState = {}) {
            if (!ctx || !this.smoothedPoints.length) return;

            const width = renderState.width || ctx.canvas.width;
            const height = renderState.height || ctx.canvas.height;
            const centerY = height / 2;

            ctx.save();

            ctx.globalAlpha = this.settings.opacity;
            ctx.globalCompositeOperation = this.settings.blendMode || "source-over";

            // Beat scale reaction
            let beatScale = 1;
            if (this.settings.beatReaction && this.beat) {
                beatScale += this.beatStrength * (this.settings.beatScale - 1);
            }

            // Bass amplitude scaling
            let bassScale = 1;
            if (this.settings.bassReaction) {
                bassScale += this.bass * this.settings.bassAmount;
            }

            ctx.translate(width / 2, centerY);
            ctx.scale(this.settings.size * beatScale, this.settings.size * beatScale);
            ctx.translate(-width / 2, -centerY);

            if (this.settings.centerLine) {
                this._drawCenterLine(ctx, width, centerY);
            }

            if (this.settings.glow) {
                ctx.shadowBlur = this.settings.glowIntensity * (0.5 + this.energy);
                ctx.shadowColor = this.settings.color;
            } else {
                ctx.shadowBlur = 0;
            }

            this._drawMirrorWave(ctx, width, height, centerY, bassScale);

            ctx.restore();
        }

        /* =====================================================
           DRAW MIRRORED WAVE
           ===================================================== */

        _drawMirrorWave(ctx, width, height, centerY, bassScale) {
            const points = this.smoothedPoints;
            const count = points.length;
            if (!count) return;

            const usableWidth = width * 0.92;
            const startX = (width - usableWidth) / 2;
            const step = usableWidth / Math.max(1, count - 1);
            const maxAmplitude = height * 0.36;
            const gap = this.settings.centerGap * height;

            // Top Wave (-1 direction)
            this._drawSide(ctx, points, startX, step, centerY - gap / 2, maxAmplitude, bassScale, usableWidth, -1);

            // Bottom Wave (+1 direction)
            this._drawSide(ctx, points, startX, step, centerY + gap / 2, maxAmplitude, bassScale, usableWidth, 1);
        }

        /* =====================================================
           DRAW ONE SIDE (Smooth Quadratic Midpoint Interpolation)
           ===================================================== */

        _drawSide(ctx, points, startX, step, baseY, maxAmplitude, bassScale, usableWidth, direction) {
            const count = points.length;
            const calculatedPoints = [];

            for (let i = 0; i < count; i++) {
                const x = startX + i * step;
                let value = (points[i] || 0) * bassScale;

                // Subtle organic motion
                value += Math.sin(this.animationTime * 1.5 + i * 0.04) * 0.006;

                const y = baseY + value * maxAmplitude * direction;
                calculatedPoints.push({ x, y });
            }

            // Build smooth quadratic curve path
            ctx.beginPath();
            ctx.moveTo(calculatedPoints[0].x, calculatedPoints[0].y);

            for (let i = 1; i < count - 1; i++) {
                const xc = (calculatedPoints[i].x + calculatedPoints[i + 1].x) / 2;
                const yc = (calculatedPoints[i].y + calculatedPoints[i + 1].y) / 2;
                ctx.quadraticCurveTo(calculatedPoints[i].x, calculatedPoints[i].y, xc, yc);
            }

            if (count > 1) {
                ctx.quadraticCurveTo(
                    calculatedPoints[count - 2].x,
                    calculatedPoints[count - 2].y,
                    calculatedPoints[count - 1].x,
                    calculatedPoints[count - 1].y
                );
            }

            const gradient = ctx.createLinearGradient(startX, 0, startX + usableWidth, 0);
            gradient.addColorStop(0, this.settings.color);
            gradient.addColorStop(0.5, this.settings.secondaryColor);
            gradient.addColorStop(1, this.settings.color);

            ctx.strokeStyle = gradient;
            ctx.lineWidth = this.settings.lineWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();

            // Smooth curve-matched fill
            if (this.settings.fill) {
                this._fillSide(ctx, calculatedPoints, startX, usableWidth, baseY, maxAmplitude);
            }
        }

        /* =====================================================
           FILL (Matches Exact Quadratic Contour)
           ===================================================== */

        _fillSide(ctx, calculatedPoints, startX, usableWidth, baseY, maxAmplitude) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = this.settings.fillOpacity;

            const gradient = ctx.createLinearGradient(0, baseY - maxAmplitude, 0, baseY + maxAmplitude);
            gradient.addColorStop(0, this.settings.color);
            gradient.addColorStop(1, this.settings.secondaryColor);
            ctx.fillStyle = gradient;

            ctx.beginPath();
            ctx.moveTo(calculatedPoints[0].x, baseY);
            ctx.lineTo(calculatedPoints[0].x, calculatedPoints[0].y);

            for (let i = 1; i < calculatedPoints.length - 1; i++) {
                const xc = (calculatedPoints[i].x + calculatedPoints[i + 1].x) / 2;
                const yc = (calculatedPoints[i].y + calculatedPoints[i + 1].y) / 2;
                ctx.quadraticCurveTo(calculatedPoints[i].x, calculatedPoints[i].y, xc, yc);
            }

            const last = calculatedPoints[calculatedPoints.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.lineTo(startX + usableWidth, baseY);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        /* =====================================================
           CENTER LINE
           ===================================================== */

        _drawCenterLine(ctx, width, centerY) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.12 * this.settings.opacity;
            ctx.strokeStyle = this.settings.secondaryColor;
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(width * 0.03, centerY);
            ctx.lineTo(width * 0.97, centerY);
            ctx.stroke();
            ctx.restore();
        }

        resize() { return this; }

        reset() {
            this.waveform = null;
            this.energy = 0;
            this.bass = 0;
            this.beat = false;
            this.beatStrength = 0;
            this.targetPoints = [];
            this.smoothedPoints = [];
            this.lastTimestamp = 0;
            return this;
        }

        destroy() {
            this.reset();
            this.manager = null;
            this.canvasRenderer = null;
            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;
        }
    }

    /* =====================================================
       GLOBAL EXPORT & AUTO-REGISTRATION
       ===================================================== */

    window.MirrorWaveRenderer = MirrorWaveRenderer;

    function registerMirrorWave() {
        if (window.visualizerManager) {
            const renderer = new MirrorWaveRenderer({ manager: window.visualizerManager });
            window.visualizerManager.register("mirror", renderer);
            window.visualizerManager.register("mirrorWave", renderer);
            console.log("MirrorWaveRenderer registered to visualizerManager.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerMirrorWave);
    } else {
        registerMirrorWave();
    }
})();
