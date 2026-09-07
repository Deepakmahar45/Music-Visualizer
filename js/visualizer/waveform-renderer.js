/* =========================================================
   WAVEFORM RENDERER (CLASSIC REAL-TIME WAVEFORM ENGINE)
   js/visualizer/waveform-renderer.js
   ========================================================= */

(function () {
    "use strict";

    class WaveformRenderer {
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

            this.targetWaveform = [];
            this.smoothedWaveform = [];

            this.settings = {
                color: "#ffffff",
                secondaryColor: "#8ab4ff",
                size: 1,
                opacity: 1,
                lineWidth: 2.5,
                amplitude: 1,
                sensitivity: 1,
                smoothing: 0.82,
                samples: 200,
                glow: true,
                glowIntensity: 16,
                fill: false,
                fillOpacity: 0.10,
                centerLine: false,
                beatReaction: true,
                beatScale: 1.10,
                bassReaction: true,
                bassAmount: 0.25,
                blendMode: "screen",
                animationSpeed: 1
            };

            if (options.manager || options.canvasRenderer) {
                this.init(options);
            }
        }

        /* =====================================================
           INIT & DEPENDENCY BINDING
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
            this.settings.amplitude = Math.max(0, Number(this.settings.amplitude) || 0);
            this.settings.sensitivity = Math.max(0, Number(this.settings.sensitivity) || 0);
            this.settings.smoothing = Math.max(0, Math.min(0.99, Number(this.settings.smoothing) || 0));
            this.settings.samples = Math.max(20, Math.floor(Number(this.settings.samples) || 200));

            return this;
        }

        getSettings() {
            return { ...this.settings };
        }

        /* =====================================================
           UPDATE TICK
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

            // Correct API mapping
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
           PROCESS WAVEFORM DATA (Edge Normalization & Decay)
           ===================================================== */

        _processWaveform() {
            if (!this.waveform || !this.waveform.length) {
                // Smoothly decay to flat line when audio is paused
                for (let i = 0; i < this.smoothedWaveform.length; i++) {
                    this.smoothedWaveform[i] *= 0.88;
                }
                return;
            }

            const source = this.waveform;
            const sampleCount = Math.min(this.settings.samples, source.length);

            if (this.targetWaveform.length !== sampleCount) {
                this.targetWaveform = new Float32Array(sampleCount);
                this.smoothedWaveform = new Float32Array(sampleCount);
            }

            const step = source.length / sampleCount;
            const smoothing = this.settings.smoothing;
            const isByteData = source instanceof Uint8Array;

            for (let i = 0; i < sampleCount; i++) {
                const index = Math.min(source.length - 1, Math.floor(i * step));
                let value = Number(source[index]) || 0;

                // Robust handling for both byte buffers [0..255] and floats [-1..1]
                if (isByteData || value > 1 || value < -1) {
                    value = (value - 128) / 128;
                }

                value *= this.settings.amplitude * this.settings.sensitivity;

                this.targetWaveform[i] = value;
                this.smoothedWaveform[i] = this.smoothedWaveform[i] * smoothing + value * (1 - smoothing);
            }
        }

        /* =====================================================
           RENDER
           ===================================================== */

        render(ctx, renderState = {}) {
            if (!ctx || !this.smoothedWaveform.length) return;

            const width = renderState.width || ctx.canvas.width;
            const height = renderState.height || ctx.canvas.height;
            const centerY = height / 2;

            ctx.save();

            ctx.globalAlpha = this.settings.opacity;
            ctx.globalCompositeOperation = this.settings.blendMode || "source-over";

            // Beat scale expansion
            let beatScale = 1;
            if (this.settings.beatReaction && this.beat) {
                beatScale += this.beatStrength * (this.settings.beatScale - 1);
            }

            // Bass boost
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

            this._drawWaveform(ctx, width, height, centerY, bassScale);

            ctx.restore();
        }

        /* =====================================================
           DRAW WAVEFORM (Smooth Quadratic Midpoint Interpolation)
           ===================================================== */

        _drawWaveform(ctx, width, height, centerY, bassScale) {
            const points = this.smoothedWaveform;
            const count = points.length;
            if (!count) return;

            const usableWidth = width * 0.94;
            const startX = (width - usableWidth) / 2;
            const step = usableWidth / Math.max(1, count - 1);
            const maxAmplitude = height * 0.38;

            const calculatedPoints = [];

            for (let i = 0; i < count; i++) {
                const x = startX + i * step;
                let value = (points[i] || 0) * bassScale;

                // Subtle organic motion
                value += Math.sin(this.animationTime * 1.4 + i * 0.035) * 0.005;

                const y = centerY - value * maxAmplitude;
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

            if (count > 1) {
                ctx.quadraticCurveTo(
                    calculatedPoints[count - 2].x,
                    calculatedPoints[count - 2].y,
                    calculatedPoints[count - 1].x,
                    calculatedPoints[count - 1].y
                );
            }

            // Wave Gradient
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
                this._drawFill(ctx, calculatedPoints, startX, usableWidth, centerY, maxAmplitude);
            }
        }

        /* =====================================================
           FILL (Matches Exact Quadratic Stroke Curves)
           ===================================================== */

        _drawFill(ctx, calculatedPoints, startX, usableWidth, centerY, maxAmplitude) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = this.settings.fillOpacity;

            const gradient = ctx.createLinearGradient(0, centerY - maxAmplitude, 0, centerY + maxAmplitude);
            gradient.addColorStop(0, this.settings.color);
            gradient.addColorStop(1, this.settings.secondaryColor);
            ctx.fillStyle = gradient;

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
            this.targetWaveform = [];
            this.smoothedWaveform = [];
            this.animationTime = 0;
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

    /* =========================================================
       GLOBAL EXPORT & AUTO-REGISTRATION
       ========================================================= */

    window.WaveformRenderer = WaveformRenderer;

    function registerWaveform() {
        if (window.visualizerManager) {
            const renderer = new WaveformRenderer({ manager: window.visualizerManager });
            window.visualizerManager.register("waveform", renderer);
            window.visualizerManager.register("classicWave", renderer);
            console.log("WaveformRenderer registered to visualizerManager.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerWaveform);
    } else {
        registerWaveform();
    }
})();
