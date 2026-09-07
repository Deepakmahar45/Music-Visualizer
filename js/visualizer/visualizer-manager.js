/* =========================================================
   VISUALIZER MANAGER (ZERO-ALLOCATION RENDER PIPELINE)
   js/visualizer/visualizer-manager.js
   ========================================================= */

(function () {
    "use strict";

    class VisualizerManager {
        constructor(options = {}) {
            this.renderer = null;

            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;

            this.renderers = new Map();
            this.activeType = null;
            this.activeRenderer = null;

            this.settings = {
                size: 1,
                opacity: 1,
                position: { x: 0, y: 0 },
                scale: 1,
                rotation: 0,
                color: "#ffffff",
                appearance: "solid",
                lineWidth: 2,
                smoothing: 0.5,
                glow: false,
                glowIntensity: 0.5,
                blendMode: "source-over"
            };

            // Pre-allocated cache objects to avoid 60fps GC garbage collection pauses
            this._cachedAudioData = {
                waveform: null,
                frequency: null,
                energy: 0,
                bass: 0,
                mid: 0,
                treble: 0,
                beat: false,
                beatStrength: 0
            };

            this._cachedRenderState = {
                timestamp: 0,
                deltaTime: 0,
                width: 0,
                height: 0,
                settings: this.settings,
                audio: this._cachedAudioData,
                type: null
            };

            this.initialized = false;

            if (options.renderer) this.setRenderer(options.renderer);
            if (options.audioAnalyzer) this.setAudioAnalyzer(options.audioAnalyzer);
            if (options.frequencyAnalyzer) this.setFrequencyAnalyzer(options.frequencyAnalyzer);
            if (options.beatDetector) this.setBeatDetector(options.beatDetector);
        }

        /* -----------------------------------------------------
           SET MAIN RENDERER & HOOK RENDER LOOP
        ----------------------------------------------------- */

        setRenderer(renderer) {
            if (!renderer) return false;

            this.renderer = renderer;
            this.initialized = true;

            // Automatically bind the manager render & update loop to canvas ticks
            if (typeof this.renderer.setRenderCallback === "function") {
                this.renderer.setRenderCallback((ctx, renderState) => {
                    this.update(renderState.deltaTime);
                    this.render(ctx, renderState.timestamp);
                });
            }

            this.applyTransform();
            return true;
        }

        /* -----------------------------------------------------
           DEPENDENCY INJECTION
        ----------------------------------------------------- */

        setAudioAnalyzer(analyzer) {
            this.audioAnalyzer = analyzer || null;
            this.connectDependencies();
            return !!this.audioAnalyzer;
        }

        setFrequencyAnalyzer(analyzer) {
            this.frequencyAnalyzer = analyzer || null;
            this.connectDependencies();
            return !!this.frequencyAnalyzer;
        }

        setBeatDetector(detector) {
            this.beatDetector = detector || null;
            this.connectDependencies();
            return !!this.beatDetector;
        }

        connectDependencies() {
            if (!this.activeRenderer) return;

            const renderer = this.activeRenderer;
            const deps = {
                audioAnalyzer: this.audioAnalyzer,
                frequencyAnalyzer: this.frequencyAnalyzer,
                beatDetector: this.beatDetector,
                manager: this
            };

            if (typeof renderer.connect === "function") {
                renderer.connect(deps);
            } else {
                if (typeof renderer.setAudioAnalyzer === "function") renderer.setAudioAnalyzer(this.audioAnalyzer);
                if (typeof renderer.setFrequencyAnalyzer === "function") renderer.setFrequencyAnalyzer(this.frequencyAnalyzer);
                if (typeof renderer.setBeatDetector === "function") renderer.setBeatDetector(this.beatDetector);
            }
        }

        /* -----------------------------------------------------
           REGISTRATION & AUTO-ACTIVATION
        ----------------------------------------------------- */

        register(type, renderer) {
            if (!type || !renderer) return false;

            const key = String(type);
            this.renderers.set(key, renderer);

            if (typeof renderer.init === "function") {
                renderer.init({
                    manager: this,
                    canvasRenderer: this.renderer
                });
            }

            // Auto-activate the first registered visualizer if none is set
            if (!this.activeType) {
                this.setType(key);
            }

            return true;
        }

        registerMany(renderers = {}) {
            if (renderers instanceof Map) {
                renderers.forEach((renderer, type) => this.register(type, renderer));
                return;
            }

            Object.keys(renderers).forEach(type => {
                this.register(type, renderers[type]);
            });
        }

        unregister(type) {
            const key = String(type);
            const renderer = this.renderers.get(key);

            if (renderer && typeof renderer.destroy === "function") {
                renderer.destroy();
            }

            this.renderers.delete(key);

            if (this.activeType === key) {
                this.activeType = null;
                this.activeRenderer = null;

                // Fallback to next available renderer
                const remaining = this.getTypes();
                if (remaining.length > 0) {
                    this.setType(remaining[0]);
                }
            }
        }

        has(type) {
            return this.renderers.has(String(type));
        }

        getTypes() {
            return Array.from(this.renderers.keys());
        }

        /* -----------------------------------------------------
           VISUALIZER SWITCHING
        ----------------------------------------------------- */

        setType(type) {
            const key = String(type);
            const renderer = this.renderers.get(key);

            if (!renderer) {
                console.warn(`Visualizer "${key}" is not registered.`);
                return false;
            }

            if (this.activeRenderer && this.activeRenderer !== renderer) {
                if (typeof this.activeRenderer.onDeactivate === "function") {
                    this.activeRenderer.onDeactivate();
                }
            }

            this.activeType = key;
            this.activeRenderer = renderer;

            if (typeof renderer.onActivate === "function") {
                renderer.onActivate();
            }

            this.connectDependencies();
            this.applySettings();

            // Trigger re-render if canvas is currently paused
            if (this.renderer && !this.renderer.running && typeof this.renderer.renderOnce === "function") {
                this.renderer.renderOnce();
            }

            return true;
        }

        getType() { return this.activeType; }
        getActiveRenderer() { return this.activeRenderer; }

        /* -----------------------------------------------------
           UPDATE TICK
        ----------------------------------------------------- */

        update(deltaTime = 16.6) {
            if (!this.activeRenderer) return;

            const audioData = this.getAudioData();

            if (typeof this.activeRenderer.update === "function") {
                this.activeRenderer.update(audioData, deltaTime);
            }
        }

        /* -----------------------------------------------------
           RENDER EXECUTION (Isolated Context State)
        ----------------------------------------------------- */

        render(ctx = null, timestamp = performance.now()) {
            if (!this.activeRenderer) return;

            const context = ctx || (this.renderer && typeof this.renderer.getContext === "function" ? this.renderer.getContext() : null);
            if (!context) return;

            const renderState = this.getRenderState(timestamp);

            // Isolate render states to prevent blend-mode and filter pollution
            context.save();
            try {
                if (this.settings.blendMode && this.settings.blendMode !== "source-over") {
                    context.globalCompositeOperation = this.settings.blendMode;
                }

                if (typeof this.activeRenderer.render === "function") {
                    this.activeRenderer.render(context, renderState);
                }
            } finally {
                context.restore();
            }
        }

        /* -----------------------------------------------------
           AUDIO DATA COLLECTION (Zero-Allocation Pipeline)
        ----------------------------------------------------- */

        getAudioData() {
            const out = this._cachedAudioData;

            // Reset values
            out.waveform = null;
            out.frequency = null;
            out.energy = 0;
            out.bass = 0;
            out.mid = 0;
            out.treble = 0;
            out.beat = false;
            out.beatStrength = 0;

            // Primary Analyzer Fetch
            if (this.audioAnalyzer) {
                if (typeof this.audioAnalyzer.getWaveform === "function") {
                    out.waveform = this.audioAnalyzer.getWaveform();
                }
                if (typeof this.audioAnalyzer.getFrequencyData === "function") {
                    out.frequency = this.audioAnalyzer.getFrequencyData();
                } else if (typeof this.audioAnalyzer.getFrequency === "function") {
                    out.frequency = this.audioAnalyzer.getFrequency();
                }
                if (typeof this.audioAnalyzer.getEnergy === "function") {
                    out.energy = this.audioAnalyzer.getEnergy();
                }
                if (typeof this.audioAnalyzer.getBass === "function") {
                    out.bass = this.audioAnalyzer.getBass();
                }
                if (typeof this.audioAnalyzer.getMid === "function") {
                    out.mid = this.audioAnalyzer.getMid();
                }
                if (typeof this.audioAnalyzer.getTreble === "function") {
                    out.treble = this.audioAnalyzer.getTreble();
                }
            }

            // Frequency Analyzer Priority Override
            if (this.frequencyAnalyzer) {
                if (typeof this.frequencyAnalyzer.getSmoothedData === "function") {
                    out.frequency = this.frequencyAnalyzer.getSmoothedData();
                }
                if (typeof this.frequencyAnalyzer.getEnergy === "function") {
                    out.energy = this.frequencyAnalyzer.getEnergy();
                }
                if (typeof this.frequencyAnalyzer.getBass === "function") {
                    out.bass = this.frequencyAnalyzer.getBass();
                    out.mid = this.frequencyAnalyzer.getMids();
                    out.treble = this.frequencyAnalyzer.getHighs();
                } else if (typeof this.frequencyAnalyzer.getBand === "function") {
                    out.bass = this.frequencyAnalyzer.getBand("bass");
                    out.mid = this.frequencyAnalyzer.getBand("mid");
                    out.treble = this.frequencyAnalyzer.getBand("treble");
                }
            }

            // Beat Detector Sync
            if (this.beatDetector) {
                if (typeof this.beatDetector.getBeat === "function") {
                    out.beat = this.beatDetector.getBeat();
                }
                if (typeof this.beatDetector.getStrength === "function") {
                    out.beatStrength = this.beatDetector.getStrength();
                }
            }

            return out;
        }

        /* -----------------------------------------------------
           RENDER STATE SNAPSHOT
        ----------------------------------------------------- */

        getRenderState(timestamp) {
            const size = this.renderer && typeof this.renderer.getSize === "function"
                ? this.renderer.getSize()
                : { width: 0, height: 0 };

            const state = this._cachedRenderState;
            state.timestamp = timestamp;
            state.width = size.width;
            state.height = size.height;
            state.settings = this.settings;
            state.audio = this.getAudioData();
            state.type = this.activeType;

            return state;
        }

        /* -----------------------------------------------------
           SETTINGS & TRANSFORMS
        ----------------------------------------------------- */

        applySettings() {
            this.applyTransform();

            if (this.activeRenderer && typeof this.activeRenderer.setSettings === "function") {
                this.activeRenderer.setSettings(this.settings);
            }
        }

        applyTransform() {
            if (!this.renderer || typeof this.renderer.setTransform !== "function") return;

            this.renderer.setTransform({
                x: this.settings.position.x,
                y: this.settings.position.y,
                scale: this.settings.scale,
                rotation: this.settings.rotation,
                opacity: this.settings.opacity
            });
        }

        setPosition(x, y) {
            this.settings.position.x = Number(x) || 0;
            this.settings.position.y = Number(y) || 0;
            this.applyTransform();
        }

        setScale(value) {
            this.settings.scale = Math.max(0.01, Number(value) || 1);
            this.applyTransform();
        }

        setRotation(value) {
            this.settings.rotation = Number(value) || 0;
            this.applyTransform();
        }

        setOpacity(value) {
            this.settings.opacity = Math.max(0, Math.min(1, Number(value)));
            this.applyTransform();
        }

        setSize(value) {
            this.settings.size = Math.max(0.1, Number(value) || 1);
            this.applySettings();
        }

        setColor(color) {
            if (!color) return;
            this.settings.color = String(color);
            this.applySettings();
        }

        setLineWidth(value) {
            this.settings.lineWidth = Math.max(0.1, Number(value) || 1);
            this.applySettings();
        }

        setSmoothing(value) {
            this.settings.smoothing = Math.max(0, Math.min(1, Number(value) || 0));
            this.applySettings();
        }

        setGlow(enabled, intensity = null) {
            this.settings.glow = Boolean(enabled);
            if (intensity !== null) {
                this.settings.glowIntensity = Math.max(0, Math.min(1, Number(intensity)));
            }
            this.applySettings();
        }

        setBlendMode(mode) {
            this.settings.blendMode = String(mode || "source-over");
            this.applySettings();
        }

        getSettings() {
            return {
                ...this.settings,
                position: { ...this.settings.position }
            };
        }

        resetSettings() {
            this.settings = {
                size: 1,
                opacity: 1,
                position: { x: 0, y: 0 },
                scale: 1,
                rotation: 0,
                color: "#ffffff",
                appearance: "solid",
                lineWidth: 2,
                smoothing: 0.5,
                glow: false,
                glowIntensity: 0.5,
                blendMode: "source-over"
            };
            this.applySettings();
        }

        /* -----------------------------------------------------
           CLEANUP & TEARDOWN
        ----------------------------------------------------- */

        destroy() {
            this.renderers.forEach(renderer => {
                if (renderer && typeof renderer.destroy === "function") {
                    renderer.destroy();
                }
            });

            this.renderers.clear();
            this.activeRenderer = null;
            this.activeType = null;
            this.renderer = null;
            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.beatDetector = null;
        }
    }

    /* ---------------------------------------------------------
       GLOBAL EXPORT & AUTO LINK
       --------------------------------------------------------- */

    window.VisualizerManager = VisualizerManager;
    window.visualizerManager = new VisualizerManager();

    function connectGlobals() {
        const mgr = window.visualizerManager;
        if (!mgr) return;

        if (window.audioAnalyzer) mgr.setAudioAnalyzer(window.audioAnalyzer);
        if (window.frequencyAnalyzer) mgr.setFrequencyAnalyzer(window.frequencyAnalyzer);
        if (window.beatDetector) mgr.setBeatDetector(window.beatDetector);
        if (window.visualizerRenderer) mgr.setRenderer(window.visualizerRenderer);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", connectGlobals, { once: true });
    } else {
        connectGlobals();
    }
})();
