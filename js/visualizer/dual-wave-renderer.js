/* =========================================================
   DUAL WAVE RENDERER (DUAL AUDIO-REACTIVE ENGINE)
   js/visualizer/dual-wave.js
   ========================================================= */

(function () {
    "use strict";

    class DualWaveRenderer {
        constructor(options = {}) {
            this.manager = options.manager || null;
            this.canvasRenderer = options.canvasRenderer || null;

            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;

            this.waveform = null;
            this.energy = 0;
            this.bass = 0;
            this.mid = 0;

            this.beat = false;
            this.beatStrength = 0;

            this.lastTimestamp = 0;
            this.animationTime = 0;

            this.targetPoints = [];
            this.smoothedPoints = [];

            this.settings = {
                primaryColor: "#ffffff",
                secondaryColor: "#6ea8ff",
                size: 1,
                opacity: 1,
                lineWidth: 2.5,
                smoothing: 0.84,
                amplitude: 1,
                sensitivity: 1,
                spacing: 0,
                glow: true,
                glowIntensity: 18,
                fill: false,
                fillOpacity: 0.10,
                blendMode: "screen",
                samples: 180,
                bassReaction: true,
                bassAmount: 0.30,
                beatReaction: true,
                beatScale: 1.12,
                animationSpeed: 1,
                centerLine: false
            };

            if (options.manager || options.canvasRenderer) {
                this.init(options);
            }
        }

        /* ---------------------------------------------------------
           INIT & DEPENDENCIES
           --------------------------------------------------------- */

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

        /* ---------------------------------------------------------
           SETTINGS
           --------------------------------------------------------- */

        setSettings(settings = {}) {
            Object.assign(this.settings, settings);

            this.settings.size = Math.max(0.05, Number(this.settings.size) || 1);
            this.settings.opacity = Math.max(0, Math.min(1, Number(this.settings.opacity) || 0));
            this.settings.lineWidth = Math.max(0.5, Number(this.settings.lineWidth) || 1);
            this.settings.smoothing = Math.max(0, Math.min(0.99, Number(this.settings.smoothing) || 0));
            this.settings.amplitude = Math.max(0, Number(this.settings.amplitude) || 0);
            this.settings.sensitivity = Math.max(0, Number(this.settings.sensitivity) || 0);

            return this;
        }

        getSettings() {
            return { ...this.settings };
        }

        /* ---------------------------------------------------------
           UPDATE (Synchronized with Engines)
           --------------------------------------------------------- */

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
            this.mid = Number(audioData.mid) || this.audioAnalyzer?.getMid?.() || 0;

            // Correct method mapping
            this.beat = Boolean(audioData.beat) ||
                        this.beatDetector?.getBeat?.() ||
                        this.audioAnalyzer?.getBeat?.() ||
                        false;

            this.beatStrength = Number(audioData.beatStrength) ||
                                this.beatDetector?.getStrength?.() ||
                                this.audioAnalyzer?.getBeatStrength?.() ||
                                0;

            this._prepareWaveform();
            return this;
        }

        /* ---------------------------------------------------------
           PREPARE WAVEFORM (Robust Audio Normalization)
           --------------------------------------------------------- */

        _prepareWaveform() {
            if (!this.waveform || !this.waveform.length) {
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

                // Handles Uint8 (0-255) and Float32 (-1 to 1) without clipping
                if (isByteData || value > 1 || value < -1) {
                    value = (value - 128) / 128;
                }

                value *= this.settings.amplitude * this.settings.sensitivity;

                this.targetPoints[i] = value;
                this.smoothedPoints[i] = this.smoothedPoints[i] * smoothing + value * (1 - smoothing);
            }
        }

        /* ---------------------------------------------------------
           RENDER
           --------------------------------------------------------- */

        render(ctx, renderState = {}) {
            if (!ctx) return;

            const width = renderState.width || ctx.canvas.width;
            const height = renderState.height || ctx.canvas.height;
            const centerY = height / 2;

            ctx.save();

            ctx.globalAlpha = this.settings.opacity;
            ctx.globalCompositeOperation = this.settings.blendMode || "source-over";

            // Beat scaling
            let beatScale = 1;
            if (this.settings.beatReaction && this.beat) {
                beatScale += this.beatStrength * (this.settings.beatScale - 1);
            }

            // Bass amplitude boost
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
                ctx.shadowColor = this.settings.primaryColor;
            } else {
                ctx.shadowBlur = 0;
            }

            this._drawDualWave(ctx, width, height, centerY, bassScale);

            ctx.restore();
        }

        /* ---------------------------------------------------------
           DRAW DUAL WAVE
           --------------------------------------------------------- */

        _drawDualWave(ctx, width, height, centerY, bassScale) {
            const points = this.smoothedPoints;
            if (!points.length) return;

            const usableWidth = width * 0.94;
            const startX = (width - usableWidth) / 2;
            const step = usableWidth / Math.max(1, points.length - 1);
            const maxAmplitude = height * 0.34;
            const spacing = this.settings.spacing * height;

            // Top Wave
            this._drawWaveLine(ctx, points, startX, step, centerY - spacing / 2, maxAmplitude, bassScale, usableWidth, false);

            // Bottom Inverted Wave
            this._drawWaveLine(ctx, points, startX, step, centerY + spacing / 2, maxAmplitude, bassScale, usableWidth, true);
        }

        /* ---------------------------------------------------------
           DRAW SINGLE WAVE LINE (Curved Stroke & Matching Fill)
           --------------------------------------------------------- */

        _drawWaveLine(ctx, points, startX, step, baseY, maxAmplitude, bassScale, usableWidth, inverted) {
            const count = points.length;
            const calculatedPoints = [];

            for (let i = 0; i < count; i++) {
                const x = startX + i * step;
                let value = (points[i] || 0) * bassScale;
                value += Math.sin(this.animationTime * 1.6 + i * 0.045) * 0.008;

                const amp = value * maxAmplitude;
                const y = inverted ? baseY + amp : baseY - amp;
                calculatedPoints.push({ x, y });
            }

            // Path construction
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
            gradient.addColorStop(0, this.settings.primaryColor);
            gradient.addColorStop(0.5, this.settings.secondaryColor);
            gradient.addColorStop(1, this.settings.primaryColor);

            ctx.strokeStyle = gradient;
            ctx.lineWidth = this.settings.lineWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();

            // Smooth curve-matched fill
            if (this.settings.fill) {
                this._fillWave(ctx, calculatedPoints, startX, usableWidth, baseY, maxAmplitude);
            }
        }

        /* ---------------------------------------------------------
           FILL WAVE (Exact Quadratic Contour)
           --------------------------------------------------------- */

        _fillWave(ctx, calculatedPoints, startX, usableWidth, baseY, maxAmplitude) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = this.settings.fillOpacity;

            const gradient = ctx.createLinearGradient(0, baseY - maxAmplitude, 0, baseY + maxAmplitude);
            gradient.addColorStop(0, this.settings.primaryColor);
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

        /* ---------------------------------------------------------
           CENTER LINE
           --------------------------------------------------------- */

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
            this.mid = 0;
            this.beat = false;
            this.beatStrength = 0;
            this.targetPoints = [];
            this.smoothedPoints = [];
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

    /* ---------------------------------------------------------
       AUTO-REGISTER WITH VISUALIZER MANAGER
       --------------------------------------------------------- */

    window.DualWaveRenderer = DualWaveRenderer;

    function registerDualWave() {
        if (window.visualizerManager) {
            const renderer = new DualWaveRenderer({ manager: window.visualizerManager });
            window.visualizerManager.register("dualWave", renderer);
            window.visualizerManager.register("mirror", renderer);
            console.log("DualWaveRenderer registered to visualizerManager.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerDualWave);
    } else {
        registerDualWave();
    }
})();
