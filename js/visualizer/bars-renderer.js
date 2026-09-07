/* =========================================================
   BARS RENDERER (SPECTRUM FREQUENCY VISUALIZER)
   js/visualizer/bars.js
   ========================================================= */

(function () {
    "use strict";

    class BarsRenderer {
        constructor(options = {}) {
            this.manager = options.manager || null;
            this.canvasRenderer = options.canvasRenderer || null;

            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;

            this.settings = {
                barCount: 64,
                barWidth: 0.75,
                gap: 0.25,

                size: 1,
                opacity: 1,

                amplitude: 1,
                sensitivity: 1.15,
                smoothing: 0.75,

                minHeight: 3,
                maxHeight: 0.90,

                position: "bottom", // "bottom", "center", "top"
                mirror: false,

                color: "#ffffff",
                secondaryColor: "#6c5ce7",

                gradient: true,
                fill: true,

                glow: true,
                glowIntensity: 16,

                rounded: true,
                roundness: 6,

                beatReaction: true,
                bassReaction: true,

                beatBoost: 1.25,
                bassBoost: 0.35,

                blendMode: "screen",

                ...options
            };

            this.bars = [];
            this.smoothedBars = [];

            this.lastBeatStrength = 0;
            this.lastBass = 0;

            this.createBars();

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
           BAR ARRAYS
           --------------------------------------------------------- */

        createBars() {
            const count = Math.max(8, Math.floor(this.settings.barCount));
            this.bars = new Float32Array(count);
            this.smoothedBars = new Float32Array(count);
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

            // Smooth decay down to zero when audio pauses
            if (!frequencyData || frequencyData.length === 0) {
                for (let i = 0; i < this.smoothedBars.length; i++) {
                    this.smoothedBars[i] *= 0.88;
                }
                return;
            }

            const count = this.bars.length;
            const isByteData = frequencyData instanceof Uint8Array;

            const energy = typeof audioData.energy === "number"
                ? audioData.energy
                : (this.audioAnalyzer?.getEnergy?.() || 0);

            const bass = typeof audioData.bass === "number"
                ? audioData.bass
                : (this.audioAnalyzer?.getBass?.() || 0);

            const beat = Boolean(audioData.beat) ||
                         this.beatDetector?.getBeat?.() ||
                         false;

            const beatStrength = typeof audioData.beatStrength === "number"
                ? audioData.beatStrength
                : (this.beatDetector?.getStrength?.() || 0);

            this.lastBeatStrength = beatStrength;
            this.lastBass = bass;

            const smoothing = this.settings.smoothing;

            for (let i = 0; i < count; i++) {
                // Perceptual logarithmic mapping emphasizing audible bass & mids
                const normalizedIndex = i / Math.max(1, count - 1);
                const mappedIndex = Math.pow(normalizedIndex, 1.6) * (frequencyData.length - 1);
                const index = Math.floor(mappedIndex);

                const raw = frequencyData[index] || 0;
                // Correctly handles Uint8 (0..255) vs Float32 (0..1)
                const value = isByteData ? raw / 255 : raw;

                let target = value * this.settings.amplitude * this.settings.sensitivity;

                // Bass reaction
                if (this.settings.bassReaction) {
                    target += (1 - normalizedIndex) * bass * this.settings.bassBoost;
                }

                // Beat reaction
                if (this.settings.beatReaction && beat) {
                    target += beatStrength * this.settings.beatBoost * 0.18;
                }

                target += energy * 0.04;
                target = Math.max(0, Math.min(1, target));

                this.bars[i] = target;
                this.smoothedBars[i] = this.smoothedBars[i] * smoothing + target * (1 - smoothing);
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

            const barCount = this.smoothedBars.length;
            if (barCount === 0) return;

            const usableWidth = width * 0.94;
            const startX = (width - usableWidth) / 2;
            const barSpace = usableWidth / barCount;
            const barWidth = Math.max(2, barSpace * this.settings.barWidth);
            const gap = barSpace - barWidth;

            ctx.save();

            ctx.globalAlpha = this.settings.opacity;
            ctx.globalCompositeOperation = this.settings.blendMode || "source-over";

            // Beat scaling
            let beatScale = 1;
            if (this.settings.beatReaction && this.lastBeatStrength > 0) {
                beatScale += this.lastBeatStrength * 0.08;
            }

            ctx.translate(width / 2, centerY);
            ctx.scale(this.settings.size * beatScale, this.settings.size * beatScale);
            ctx.translate(-width / 2, -centerY);

            // Glow
            if (this.settings.glow) {
                ctx.shadowBlur = this.settings.glowIntensity * (0.6 + this.lastBass * 0.4);
                ctx.shadowColor = this.settings.color;
            } else {
                ctx.shadowBlur = 0;
            }

            // Global spectrum gradient
            let fillStyle = this.settings.color;
            if (this.settings.gradient) {
                const gradient = ctx.createLinearGradient(startX, height, startX + usableWidth, 0);
                gradient.addColorStop(0, this.settings.color);
                gradient.addColorStop(1, this.settings.secondaryColor);
                fillStyle = gradient;
            }
            ctx.fillStyle = fillStyle;

            const maxHeightLimit = height * (this.settings.position === "center" ? 0.42 : 0.75);

            for (let i = 0; i < barCount; i++) {
                const value = this.smoothedBars[i];
                const normalizedHeight = Math.max(0, Math.min(this.settings.maxHeight, value));
                const barHeight = Math.max(this.settings.minHeight, normalizedHeight * maxHeightLimit);

                const x = startX + i * barSpace + gap / 2;
                let y;

                if (this.settings.position === "center") {
                    y = centerY - barHeight / 2;
                } else if (this.settings.position === "top") {
                    y = 24;
                } else {
                    y = height - barHeight - 24;
                }

                this.drawBar(ctx, x, y, barWidth, barHeight);

                if (this.settings.mirror) {
                    const mirrorY = this.settings.position === "center"
                        ? centerY + barHeight / 2
                        : height - y - barHeight;

                    this.drawBar(ctx, x, mirrorY, barWidth, barHeight);
                }
            }

            ctx.restore();
        }

        /* ---------------------------------------------------------
           DRAW SINGLE BAR
           --------------------------------------------------------- */

        drawBar(ctx, x, y, width, height) {
            if (this.settings.rounded) {
                const radius = Math.min(this.settings.roundness, width / 2, height / 2);
                if (typeof ctx.roundRect === "function") {
                    ctx.beginPath();
                    ctx.roundRect(x, y, width, height, radius);
                    ctx.fill();
                } else {
                    this.roundedRectFallback(ctx, x, y, width, height, radius);
                    ctx.fill();
                }
            } else {
                ctx.fillRect(x, y, width, height);
            }
        }

        roundedRectFallback(ctx, x, y, width, height, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + width - r, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + r);
            ctx.lineTo(x + width, y + height - r);
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
            ctx.lineTo(x + r, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }

        /* ---------------------------------------------------------
           SETTINGS & CONTROLS
           --------------------------------------------------------- */

        setSettings(settings = {}) {
            const oldBarCount = this.settings.barCount;
            Object.assign(this.settings, settings);

            this.settings.size = Math.max(0.05, Number(this.settings.size) || 1);
            this.settings.opacity = Math.max(0, Math.min(1, Number(this.settings.opacity) || 0));

            if (oldBarCount !== this.settings.barCount) {
                this.createBars();
            }

            return this;
        }

        getSettings() {
            return { ...this.settings };
        }

        resize() {
            this.createBars();
        }

        reset() {
            if (this.bars.length) this.bars.fill(0);
            if (this.smoothedBars.length) this.smoothedBars.fill(0);
            this.lastBeatStrength = 0;
            this.lastBass = 0;
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

    window.BarsRenderer = BarsRenderer;

    function registerBars() {
        if (window.visualizerManager) {
            const renderer = new BarsRenderer({ manager: window.visualizerManager });
            window.visualizerManager.register("bars", renderer);
            window.visualizerManager.register("spectrum", renderer);
            console.log("BarsRenderer registered to visualizerManager.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerBars);
    } else {
        registerBars();
    }
})();
                                  
