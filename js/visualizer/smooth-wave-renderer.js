/* =========================================================
   SMOOTH WAVE RENDERER (CINEMATIC WAVEFORM ENGINE)
   js/visualizer/renderers/smooth-wave.js
   ========================================================= */

(function () {
    "use strict";

    class SmoothWaveRenderer {
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

            this.time = 0;
            this.lastTimestamp = 0;
            this.animationOffset = 0; // Safely initialized in constructor

            this.settings = {
                color: "#ffffff",
                secondaryColor: "#8ab4ff",
                size: 1,
                opacity: 1,
                lineWidth: 2.5,
                smoothing: 0.82,
                amplitude: 1,
                sensitivity: 1,
                glow: true,
                glowIntensity: 18,
                fill: false,
                fillOpacity: 0.12,
                blendMode: "screen",
                samples: 160,
                mirror: false,
                centerLine: true,
                beatReaction: true,
                beatScale: 1.12,
                animationSpeed: 1
            };

            this.smoothedPoints = [];
            this.targetPoints = [];

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

            return this;
        }

        getSettings() {
            return { ...this.settings };
        }

        /* ---------------------------------------------------------
           UPDATE (Synced with BeatDetector & Frequency Engine)
           --------------------------------------------------------- */

        update(audioData = {}, timestamp = performance.now()) {
            this.lastTimestamp = timestamp;

            const delta = this.time === 0 ? 0.016 : Math.min(0.05, (timestamp - this.time) / 1000);
            this.time = timestamp;

            this.waveform = audioData.waveform || this.audioAnalyzer?.getWaveform?.() || null;
            this.energy = Number(audioData.energy) || this.audioAnalyzer?.getEnergy?.() || 0;
            this.bass = Number(audioData.bass) || this.audioAnalyzer?.getBass?.() || 0;

            // Corrected method calls matching BeatDetector API
            this.beat = Boolean(audioData.beat) ||
                        this.beatDetector?.getBeat?.() ||
                        this.audioAnalyzer?.getBeat?.() ||
                        false;

            this.beatStrength = Number(audioData.beatStrength) ||
                                this.beatDetector?.getStrength?.() ||
                                this.audioAnalyzer?.getBeatStrength?.() ||
                                0;

            this._prepareWaveform();

            this.animationOffset += delta * this.settings.animationSpeed;
            return this;
        }

        /* ---------------------------------------------------------
           INTERNAL WAVEFORM PREPARATION (Data Normalization Fix)
           --------------------------------------------------------- */

        _prepareWaveform() {
            if (!this.waveform || !this.waveform.length) {
                // Decay down to flat line when audio pauses
                for (let i = 0; i < this.smoothedPoints.length; i++) {
                    this.smoothedPoints[i] *= 0.9;
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
                const sourceIndex = Math.min(source.length - 1, Math.floor(i * step));
                let value = Number(source[sourceIndex]) || 0;

                // Robust normalization: handles both Uint8 (0-255) and Float32 (-1 to 1)
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

            // Beat scale expansion
            let reactionScale = 1;
            if (this.settings.beatReaction && this.beat) {
                reactionScale += this.beatStrength * (this.settings.beatScale - 1);
            }

            ctx.translate(width / 2, centerY);
            ctx.scale(this.settings.size * reactionScale, this.settings.size * reactionScale);
            ctx.translate(-width / 2, -centerY);

            if (this.settings.glow) {
                ctx.shadowBlur = this.settings.glowIntensity * (0.6 + this.energy);
                ctx.shadowColor = this.settings.color;
            } else {
                ctx.shadowBlur = 0;
            }

            if (this.settings.centerLine) {
                this._drawCenterLine(ctx, width, centerY);
            }

            // Draw primary waveform
            this._drawWave(ctx, width, height, centerY, false);

            // Draw mirror waveform
            if (this.settings.mirror) {
                this._drawWave(ctx, width, height, centerY, true);
            }

            ctx.restore();
        }

        /* ---------------------------------------------------------
           WAVE DRAWING (Smooth Midpoint Quadratic Curve)
           --------------------------------------------------------- */

        _drawWave(ctx, width, height, centerY, mirrored = false) {
            const points = this.smoothedPoints;
            const count = points.length;
            if (!count) return;

            const usableWidth = width * 0.94;
            const startX = (width - usableWidth) / 2;
            const step = usableWidth / Math.max(1, count - 1);
            const maxHeight = height * 0.38;
            const bassBoost = 1 + this.bass * 0.3;

            // Generate curve points
            const calculatedPoints = [];
            for (let i = 0; i < count; i++) {
                const x = startX + i * step;
                const raw = points[i] || 0;
                const organic = Math.sin(this.animationOffset * 1.5 + i * 0.045) * 0.012;

                const amp = (raw + organic) * bassBoost;
                const y = mirrored ? centerY + amp * maxHeight : centerY - amp * maxHeight;

                calculatedPoints.push({ x, y });
            }

            // Build smooth curve path
            ctx.beginPath();
            ctx.moveTo(calculatedPoints[0].x, calculatedPoints[0].y);

            for (let i = 1; i < count - 1; i++) {
                const xc = (calculatedPoints[i].x + calculatedPoints[i + 1].x) / 2;
                const yc = (calculatedPoints[i].y + calculatedPoints[i + 1].y) / 2;
                ctx.quadraticCurveTo(calculatedPoints[i].x, calculatedPoints[i].y, xc, yc);
            }

            // Close smoothly to the final point
            if (count > 1) {
                ctx.quadraticCurveTo(
                    calculatedPoints[count - 2].x,
                    calculatedPoints[count - 2].y,
                    calculatedPoints[count - 1].x,
                    calculatedPoints[count - 1].y
                );
            }

            // Stroke Gradient
            const gradient = ctx.createLinearGradient(startX, 0, startX + usableWidth, 0);
            gradient.addColorStop(0, this.settings.color);
            gradient.addColorStop(0.5, this.settings.secondaryColor);
            gradient.addColorStop(1, this.settings.color);

            ctx.strokeStyle = gradient;
            ctx.lineWidth = this.settings.lineWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();

            // Filled Waveform (Matches quadratic curve exactly)
            if (this.settings.fill) {
                this._drawFill(ctx, calculatedPoints, centerY, startX, usableWidth, maxHeight);
            }
        }

        /* ---------------------------------------------------------
           CURVE-MATCHED FILL
           --------------------------------------------------------- */

        _drawFill(ctx, calculatedPoints, centerY, startX, usableWidth, maxHeight) {
            ctx.save();
            ctx.globalAlpha = this.settings.fillOpacity;

            const fillGrad = ctx.createLinearGradient(0, centerY - maxHeight, 0, centerY + maxHeight);
            fillGrad.addColorStop(0, this.settings.color);
            fillGrad.addColorStop(1, this.settings.secondaryColor);
            ctx.fillStyle = fillGrad;

            ctx.beginPath();
            ctx.moveTo(calculatedPoints[0].x, centerY);
            ctx.lineTo(calculatedPoints[0].x, calculatedPoints[0].y);

            for (let i = 1; i < calculatedPoints.length - 1; i++) {
                const xc = (calculatedPoints[i].x + calculatedPoints[i + 1].x) / 2;
                const yc = (calculatedPoints[i].y + calculatedPoints[i + 1].y) / 2;
                ctx.quadraticCurveTo(calculatedPoints[i].x, calculatedPoints[i].y, xc, yc);
            }

            const last = calculatedPoints[calculatedPoints.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.lineTo(startX + usableWidth, centerY);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        /* ---------------------------------------------------------
           CENTER GUIDE LINE
           --------------------------------------------------------- */

        _drawCenterLine(ctx, width, centerY) {
            ctx.save();
            ctx.globalAlpha = 0.12 * this.settings.opacity;
            ctx.shadowBlur = 0;
            ctx.strokeStyle = this.settings.color;
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
            this.smoothedPoints = [];
            this.targetPoints = [];
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

    window.SmoothWaveRenderer = SmoothWaveRenderer;

    function registerWaveRenderer() {
        if (window.visualizerManager) {
            const renderer = new SmoothWaveRenderer({ manager: window.visualizerManager });
            window.visualizerManager.register("waveform", renderer);
            window.visualizerManager.register("smoothWave", renderer);
            console.log("SmoothWaveRenderer registered to visualizerManager.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerWaveRenderer);
    } else {
        registerWaveRenderer();
    }
})();
              
