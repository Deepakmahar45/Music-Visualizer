/* =========================================================
   SPECTRUM RENDERER (CONTINUOUS FREQUENCY CURVE ENGINE)
   js/visualizer/spectrum.js
   ========================================================= */

(function () {
    "use strict";

    class SpectrumRenderer {
        constructor(options = {}) {
            this.manager = options.manager || null;
            this.canvasRenderer = options.canvasRenderer || null;

            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;

            this.settings = {
                points: 128,

                size: 1,
                opacity: 1,

                amplitude: 1,
                sensitivity: 1.15,
                smoothing: 0.78,

                position: "bottom", // "bottom", "center", "top"

                color: "#ffffff",
                secondaryColor: "#6c5ce7",

                gradient: true,
                fill: true,
                fillOpacity: 0.18,

                lineWidth: 2.5,

                glow: true,
                glowIntensity: 20,

                bassReaction: true,
                beatReaction: true,

                bassBoost: 0.30,
                beatBoost: 0.20,

                mirror: false,

                centerLine: false,
                centerLineWidth: 1,

                blendMode: "screen",

                ...options
            };

            this.values = [];
            this.smoothedValues = [];

            this.lastBass = 0;
            this.lastBeatStrength = 0;

            this.createPoints();

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

            if (options.settings) {
                this.setSettings(options.settings);
            }

            return this;
        }

        connect({ audioAnalyzer = null, frequencyAnalyzer = null, beatDetector = null } = {}) {
            this.audioAnalyzer = audioAnalyzer;
            this.frequencyAnalyzer = frequencyAnalyzer;
            this.beatDetector = beatDetector;
            return this;
        }

        /* ---------------------------------------------------------
           INTERNAL POINT ARRAYS
           --------------------------------------------------------- */

        createPoints() {
            const count = Math.max(16, Math.floor(this.settings.points));
            this.values = new Float32Array(count);
            this.smoothedValues = new Float32Array(count);
        }

        /* ---------------------------------------------------------
           DATA EXTRACTION
           --------------------------------------------------------- */

        getFrequencyData(audioData = {}) {
            if (audioData.frequency && audioData.frequency.length > 0) {
                return audioData.frequency;
            }

            if (audioData.frequencyData && audioData.frequencyData.length > 0) {
                return audioData.frequencyData;
            }

            if (this.frequencyAnalyzer) {
                if (typeof this.frequencyAnalyzer.getSmoothedData === "function") {
                    return this.frequencyAnalyzer.getSmoothedData();
                }
                if (typeof this.frequencyAnalyzer.getFrequencyData === "function") {
                    return this.frequencyAnalyzer.getFrequencyData();
                }
            }

            if (this.audioAnalyzer && typeof this.audioAnalyzer.getFrequencyData === "function") {
                return this.audioAnalyzer.getFrequencyData();
            }

            return null;
        }

        /* ---------------------------------------------------------
           UPDATE TICK
           --------------------------------------------------------- */

        update(audioData = {}, timestamp = performance.now()) {
            const frequencyData = this.getFrequencyData(audioData);

            // Smooth decay down to zero line when audio pauses
            if (!frequencyData || frequencyData.length === 0) {
                for (let i = 0; i < this.smoothedValues.length; i++) {
                    this.smoothedValues[i] *= 0.88;
                }
                return;
            }

            const count = this.values.length;
            const isByteData = frequencyData instanceof Uint8Array;

            const bass = typeof audioData.bass === "number"
                ? audioData.bass
                : (this.audioAnalyzer?.getBass?.() || 0);

            const beat = Boolean(audioData.beat) ||
                         this.beatDetector?.getBeat?.() ||
                         false;

            const beatStrength = typeof audioData.beatStrength === "number"
                ? audioData.beatStrength
                : (this.beatDetector?.getStrength?.() || 0);

            this.lastBass = bass;
            this.lastBeatStrength = beatStrength;

            const smoothing = this.settings.smoothing;

            for (let i = 0; i < count; i++) {
                const normalized = i / Math.max(1, count - 1);

                // Perceptual frequency mapping emphasizing audible range
                const mapped = Math.pow(normalized, 1.55) * (frequencyData.length - 1);
                const index = Math.min(frequencyData.length - 1, Math.floor(mapped));

                const raw = frequencyData[index] || 0;
                // Correctly handles Uint8 [0..255] and Float32 [0..1]
                const value = isByteData ? raw / 255 : raw;

                let target = value * this.settings.amplitude * this.settings.sensitivity;

                // Bass reaction
                if (this.settings.bassReaction) {
                    target += (1 - normalized) * bass * this.settings.bassBoost;
                }

                // Beat reaction
                if (this.settings.beatReaction && beat) {
                    target += beatStrength * this.settings.beatBoost * (0.35 + (1 - normalized) * 0.65);
                }

                target = Math.max(0, Math.min(1, target));

                this.values[i] = target;
                this.smoothedValues[i] = this.smoothedValues[i] * smoothing + target * (1 - smoothing);
            }
        }

        /* ---------------------------------------------------------
           POSITION & GEOMETRY HELPERS
           --------------------------------------------------------- */

        getBaseY(height) {
            if (this.settings.position === "top") return 28;
            if (this.settings.position === "center") return height / 2;
            return height - 28;
        }

        getSpectrumHeight(height) {
            if (this.settings.position === "center") return height * 0.40;
            return height * 0.72;
        }

        /* ---------------------------------------------------------
           RENDER
           --------------------------------------------------------- */

        render(ctx, renderState = {}) {
            if (!ctx) return;

            const width = renderState.width || ctx.canvas.width;
            const height = renderState.height || ctx.canvas.height;
            const count = this.smoothedValues.length;

            if (count < 2) return;

            const usableWidth = width * 0.94;
            const startX = (width - usableWidth) / 2;
            const baseY = this.getBaseY(height);
            const spectrumHeight = this.getSpectrumHeight(height);

            // Calculate precise curve coordinates
            const points = [];
            for (let i = 0; i < count; i++) {
                const x = startX + (i / (count - 1)) * usableWidth;
                const val = this.smoothedValues[i];
                const y = baseY - val * spectrumHeight;
                points.push({ x, y });
            }

            ctx.save();

            ctx.globalAlpha = this.settings.opacity;
            ctx.globalCompositeOperation = this.settings.blendMode || "source-over";

            // Beat scale reaction
            let beatScale = 1;
            if (this.settings.beatReaction && this.lastBeatStrength > 0) {
                beatScale += this.lastBeatStrength * 0.08;
            }

            ctx.translate(width / 2, baseY);
            ctx.scale(this.settings.size * beatScale, this.settings.size * beatScale);
            ctx.translate(-width / 2, -baseY);

            // Glow
            if (this.settings.glow) {
                ctx.shadowBlur = this.settings.glowIntensity * (0.6 + this.lastBass * 0.4);
                ctx.shadowColor = this.settings.color;
            } else {
                ctx.shadowBlur = 0;
            }

            // Gradient setup
            let gradient = this.settings.color;
            if (this.settings.gradient) {
                gradient = ctx.createLinearGradient(startX, baseY, startX + usableWidth, baseY - spectrumHeight);
                gradient.addColorStop(0, this.settings.color);
                gradient.addColorStop(0.5, this.settings.secondaryColor);
                gradient.addColorStop(1, this.settings.color);
            }

            // Optional fill area under spectrum
            if (this.settings.fill) {
                this.drawFill(ctx, points, startX, usableWidth, baseY, gradient, 1);
            }

            // Primary spectrum stroke
            this.drawStroke(ctx, points, gradient);

            // Mirrored spectrum
            if (this.settings.mirror) {
                const mirrorPoints = points.map(p => ({
                    x: p.x,
                    y: baseY + (baseY - p.y)
                }));

                if (this.settings.fill) {
                    this.drawFill(ctx, mirrorPoints, startX, usableWidth, baseY, gradient, -1);
                }

                this.drawStroke(ctx, mirrorPoints, gradient);
            }

            // Center baseline
            if (this.settings.centerLine) {
                ctx.save();
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 0.25 * this.settings.opacity;
                ctx.strokeStyle = this.settings.secondaryColor;
                ctx.lineWidth = this.settings.centerLineWidth;

                ctx.beginPath();
                ctx.moveTo(startX, baseY);
                ctx.lineTo(startX + usableWidth, baseY);
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore();
        }

        /* ---------------------------------------------------------
           PATH DRAWING HELPERS
           --------------------------------------------------------- */

        drawStroke(ctx, points, strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = this.settings.lineWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            for (let i = 1; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }

            const last = points[points.length - 1];
            ctx.quadraticCurveTo(
                points[points.length - 2].x,
                points[points.length - 2].y,
                last.x,
                last.y
            );

            ctx.stroke();
        }

        drawFill(ctx, points, startX, usableWidth, baseY, fillStyle, dir) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = this.settings.fillOpacity * this.settings.opacity;
            ctx.fillStyle = fillStyle;

            ctx.beginPath();
            ctx.moveTo(points[0].x, baseY);
            ctx.lineTo(points[0].x, points[0].y);

            for (let i = 1; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }

            const last = points[points.length - 1];
            ctx.lineTo(last.x, last.y);
            ctx.lineTo(startX + usableWidth, baseY);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        /* ---------------------------------------------------------
           SETTINGS & CONTROLS
           --------------------------------------------------------- */

        setSettings(settings = {}) {
            const oldPoints = this.settings.points;
            Object.assign(this.settings, settings);

            this.settings.size = Math.max(0.05, Number(this.settings.size) || 1);
            this.settings.opacity = Math.max(0, Math.min(1, Number(this.settings.opacity) || 0));

            if (oldPoints !== this.settings.points) {
                this.createPoints();
            }

            return this;
        }

        getSettings() {
            return { ...this.settings };
        }

        resize() {
            this.createPoints();
        }

        reset() {
            if (this.values.length) this.values.fill(0);
            if (this.smoothedValues.length) this.smoothedValues.fill(0);
            this.lastBass = 0;
            this.lastBeatStrength = 0;
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

    window.SpectrumRenderer = SpectrumRenderer;

    function registerSpectrum() {
        if (window.visualizerManager) {
            const renderer = new SpectrumRenderer({ manager: window.visualizerManager });
            window.visualizerManager.register("spectrumCurve", renderer);
            window.visualizerManager.register("spectrumLine", renderer);
            console.log("SpectrumRenderer registered to visualizerManager.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerSpectrum);
    } else {
        registerSpectrum();
    }
})();
