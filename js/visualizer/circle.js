/* =========================================================
   CIRCLE RENDERER (SEAMLESS CIRCULAR SPECTRUM ENGINE)
   js/visualizer/circle.js
   ========================================================= */

(function () {
    "use strict";

    class CircleRenderer {
        constructor(options = {}) {
            this.manager = options.manager || null;
            this.canvasRenderer = options.canvasRenderer || null;

            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;

            this.settings = {
                points: 128,

                radius: 120,
                size: 1,
                opacity: 1,

                amplitude: 1,
                sensitivity: 1.15,
                smoothing: 0.78,

                rotation: 0,
                rotationSpeed: 0.15,

                color: "#ffffff",
                secondaryColor: "#6c5ce7",

                gradient: true,
                lineWidth: 2.5,

                fill: true,
                fillOpacity: 0.16,

                glow: true,
                glowIntensity: 20,

                bassReaction: true,
                beatReaction: true,

                bassBoost: 0.45,
                beatBoost: 0.25,

                innerRadius: 0.72,
                mirror: false,

                blendMode: "screen",

                ...options
            };

            this.values = [];
            this.smoothedValues = [];

            this.lastBass = 0;
            this.lastBeatStrength = 0;
            this.currentRotation = 0;
            this.lastTimestamp = 0;

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
           BUFFER SETUP
           --------------------------------------------------------- */

        createPoints() {
            const count = Math.max(32, Math.floor(this.settings.points));
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
            let delta = 0.016;
            if (this.lastTimestamp) {
                delta = Math.min(0.05, Math.max(0, (timestamp - this.lastTimestamp) / 1000));
            }
            this.lastTimestamp = timestamp;

            // Slow ambient rotation
            this.currentRotation += delta * this.settings.rotationSpeed;

            const frequencyData = this.getFrequencyData(audioData);

            // Smooth decay down to baseline circle on pause
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
                // Symmetrical circular layout: map half and mirror to prevent seam
                const halfCount = count / 2;
                const distanceRatio = i < halfCount ? i / halfCount : (count - i) / halfCount;

                const mapped = Math.pow(distanceRatio, 1.45) * (frequencyData.length - 1);
                const index = Math.min(frequencyData.length - 1, Math.floor(mapped));

                const raw = frequencyData[index] || 0;
                // Correctly handles Uint8 (0..255) and Float32 (0..1)
                const value = isByteData ? raw / 255 : raw;

                let target = value * this.settings.amplitude * this.settings.sensitivity;

                // Bass reaction
                if (this.settings.bassReaction) {
                    target += (1 - distanceRatio) * bass * this.settings.bassBoost;
                }

                // Beat reaction
                if (this.settings.beatReaction && beat) {
                    target += beatStrength * this.settings.beatBoost * 0.25;
                }

                target = Math.max(0, Math.min(1, target));

                this.values[i] = target;
                this.smoothedValues[i] = this.smoothedValues[i] * smoothing + target * (1 - smoothing);
            }
        }

        /* ---------------------------------------------------------
           GRADIENT HELPER
           --------------------------------------------------------- */

        createGradient(ctx, centerX, centerY, radius) {
            const gradient = ctx.createRadialGradient(
                centerX, centerY, radius * 0.4,
                centerX, centerY, radius * 1.5
            );
            gradient.addColorStop(0, this.settings.secondaryColor);
            gradient.addColorStop(0.6, this.settings.color);
            gradient.addColorStop(1, this.settings.secondaryColor);
            return gradient;
        }

        /* ---------------------------------------------------------
           RENDER
           --------------------------------------------------------- */

        render(ctx, renderState = {}) {
            if (!ctx) return;

            const width = renderState.width || ctx.canvas.width;
            const height = renderState.height || ctx.canvas.height;
            const centerX = width / 2;
            const centerY = height / 2;

            const baseRadius = Math.min(width, height) * 0.22 * (this.settings.radius / 120);
            const points = this.smoothedValues.length;

            ctx.save();

            ctx.globalAlpha = this.settings.opacity;
            ctx.globalCompositeOperation = this.settings.blendMode || "source-over";

            // Dynamic beat expansion
            let beatExpansion = 0;
            if (this.settings.beatReaction && this.lastBeatStrength > 0) {
                beatExpansion = this.lastBeatStrength * this.settings.beatBoost * (baseRadius * 0.25);
            }

            const radius = (baseRadius + beatExpansion) * this.settings.size;
            const rotation = (this.settings.rotation * Math.PI / 180) + this.currentRotation;

            // Glow
            if (this.settings.glow) {
                ctx.shadowBlur = this.settings.glowIntensity * (0.6 + this.lastBass * 0.4);
                ctx.shadowColor = this.settings.color;
            } else {
                ctx.shadowBlur = 0;
            }

            // Colors
            let strokeStyle = this.settings.color;
            if (this.settings.gradient) {
                strokeStyle = this.createGradient(ctx, centerX, centerY, radius);
            }
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = this.settings.lineWidth;

            // Build outer curve points
            const outerPoints = [];
            for (let i = 0; i < points; i++) {
                const angle = rotation + (i / points) * Math.PI * 2;
                const value = this.smoothedValues[i];
                const pointRadius = radius + value * radius * 0.65;

                outerPoints.push({
                    x: centerX + Math.cos(angle) * pointRadius,
                    y: centerY + Math.sin(angle) * pointRadius
                });
            }

            // Draw filled inner area (using smooth quadratic curves)
            if (this.settings.fill) {
                ctx.save();
                ctx.globalAlpha = this.settings.fillOpacity * this.settings.opacity;
                ctx.fillStyle = strokeStyle;

                this.buildSmoothClosedPath(ctx, outerPoints);
                ctx.fill();
                ctx.restore();
            }

            // Draw outer smooth curve line
            this.buildSmoothClosedPath(ctx, outerPoints);
            ctx.stroke();

            // Inner Baseline Ring
            const innerRadius = radius * this.settings.innerRadius;
            ctx.save();
            ctx.shadowBlur = this.settings.glow ? this.settings.glowIntensity * 0.4 : 0;
            ctx.lineWidth = Math.max(1, this.settings.lineWidth * 0.6);
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Mirrored inward spectrum ring
            if (this.settings.mirror) {
                this.renderMirror(ctx, centerX, centerY, radius, rotation);
            }

            ctx.restore();
        }

        /* ---------------------------------------------------------
           SEAMLESS CLOSED QUADRATIC PATH HELPER
           --------------------------------------------------------- */

        buildSmoothClosedPath(ctx, pts) {
            const count = pts.length;
            if (count < 3) return;

            ctx.beginPath();

            // Start smoothly at the midpoint between last and first point
            const firstMidX = (pts[count - 1].x + pts[0].x) / 2;
            const firstMidY = (pts[count - 1].y + pts[0].y) / 2;
            ctx.moveTo(firstMidX, firstMidY);

            for (let i = 0; i < count; i++) {
                const current = pts[i];
                const next = pts[(i + 1) % count];
                const midX = (current.x + next.x) / 2;
                const midY = (current.y + next.y) / 2;

                ctx.quadraticCurveTo(current.x, current.y, midX, midY);
            }

            ctx.closePath();
        }

        /* ---------------------------------------------------------
           MIRRORED INWARD WAVEFORM
           --------------------------------------------------------- */

        renderMirror(ctx, centerX, centerY, radius, rotation) {
            const points = this.smoothedValues.length;
            const innerPoints = [];

            for (let i = 0; i < points; i++) {
                const angle = rotation + (i / points) * Math.PI * 2;
                const value = this.smoothedValues[points - 1 - i];
                const pointRadius = Math.max(radius * 0.2, radius - value * radius * 0.42);

                innerPoints.push({
                    x: centerX + Math.cos(angle) * pointRadius,
                    y: centerY + Math.sin(angle) * pointRadius
                });
            }

            ctx.save();
            ctx.globalAlpha = 0.55 * this.settings.opacity;
            ctx.lineWidth = Math.max(1, this.settings.lineWidth * 0.7);
            this.buildSmoothClosedPath(ctx, innerPoints);
            ctx.stroke();
            ctx.restore();
        }

        /* ---------------------------------------------------------
           SETTINGS & LIFECYCLE
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

    window.CircleRenderer = CircleRenderer;

    function registerCircle() {
        if (window.visualizerManager) {
            const renderer = new CircleRenderer({ manager: window.visualizerManager });
            window.visualizerManager.register("circle", renderer);
            window.visualizerManager.register("circularSpectrum", renderer);
            console.log("CircleRenderer registered to visualizerManager.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerCircle);
    } else {
        registerCircle();
    }
})();
