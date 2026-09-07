/* =========================================================
   VISUALIZER RENDERER (HIGH-DPI & ZERO-DRIFT RENDER ENGINE)
   js/visualizer/renderer.js
   ========================================================= */

(function () {
    "use strict";

    class VisualizerRenderer {
        constructor(canvas = null) {
            this.canvas = canvas;
            this.ctx = null;

            this.width = 0;
            this.height = 0;
            this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

            this.running = false;
            this.animationFrame = null;

            this.lastFrameTime = 0;
            this.deltaTime = 0;
            this.fps = 60;
            this.fpsFilter = 60;

            this.backgroundColor = "transparent";

            this.transform = {
                x: 0,
                y: 0,
                scale: 1,
                rotation: 0,
                opacity: 1
            };

            this.settings = {
                antialias: true,
                clearBeforeRender: true,
                autoResize: true
            };

            this.renderCallback = null;
            this.resizeObserver = null;

            this.boundResize = this.resize.bind(this);
            this.boundFrame = this.frame.bind(this);

            if (canvas) {
                this.init(canvas);
            }
        }

        /* -----------------------------------------------------
           INITIALIZE
        ----------------------------------------------------- */

        init(canvas) {
            if (!canvas) return false;

            this.canvas = canvas;
            this.ctx = canvas.getContext("2d", {
                alpha: true,
                desynchronized: true
            });

            if (!this.ctx) {
                console.error("VisualizerRenderer: Canvas 2D context unavailable.");
                return false;
            }

            this.resize();

            if (this.settings.autoResize) {
                this.observeResize();
            }

            return true;
        }

        /* -----------------------------------------------------
           SET CANVAS
        ----------------------------------------------------- */

        setCanvas(canvas) {
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            return this.init(canvas);
        }

        /* -----------------------------------------------------
           RESIZE (High-DPI without Style Thrashing)
        ----------------------------------------------------- */

        resize(width = null, height = null) {
            if (!this.canvas || !this.ctx) return;

            let displayWidth = width;
            let displayHeight = height;

            if (displayWidth === null || displayHeight === null) {
                const rect = this.canvas.getBoundingClientRect();
                displayWidth = Math.max(1, Math.round(rect.width));
                displayHeight = Math.max(1, Math.round(rect.height));
            }

            this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            this.width = displayWidth;
            this.height = displayHeight;

            const targetWidth = Math.round(displayWidth * this.pixelRatio);
            const targetHeight = Math.round(displayHeight * this.pixelRatio);

            // Avoid layout re-triggers if dimensions haven't actually changed
            if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
                this.canvas.width = targetWidth;
                this.canvas.height = targetHeight;
            }

            this.resetContextTransform();
            this.ctx.imageSmoothingEnabled = this.settings.antialias;
        }

        resetContextTransform() {
            if (this.ctx) {
                this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
            }
        }

        /* -----------------------------------------------------
           RESIZE OBSERVER (Observes Parent to Avoid Feedback Loop)
        ----------------------------------------------------- */

        observeResize() {
            if (!this.canvas) return;

            const target = this.canvas.parentElement || this.canvas;

            if (typeof ResizeObserver !== "undefined") {
                this.resizeObserver = new ResizeObserver(() => {
                    this.resize();
                    if (!this.running) {
                        this.renderOnce();
                    }
                });
                this.resizeObserver.observe(target);
            } else {
                window.addEventListener("resize", this.boundResize);
            }
        }

        /* -----------------------------------------------------
           CALLBACKS & ENGINE CONTROLS
        ----------------------------------------------------- */

        setRenderCallback(callback) {
            this.renderCallback = typeof callback === "function" ? callback : null;
        }

        start(callback = null) {
            if (callback) {
                this.setRenderCallback(callback);
            }

            if (this.running) return;

            this.running = true;
            this.lastFrameTime = performance.now();
            this.animationFrame = requestAnimationFrame(this.boundFrame);
        }

        stop() {
            this.running = false;
            if (this.animationFrame !== null) {
                cancelAnimationFrame(this.animationFrame);
                this.animationFrame = null;
            }
        }

        /* -----------------------------------------------------
           FRAME TICK (Smoothed FPS & Delta-Clamping)
        ----------------------------------------------------- */

        frame(timestamp) {
            if (!this.running) return;

            this.deltaTime = timestamp - this.lastFrameTime;
            this.lastFrameTime = timestamp;

            // Clamp delta time to avoid large jumps after background tab freeze
            this.deltaTime = Math.min(this.deltaTime, 100);

            if (this.deltaTime > 0) {
                const instantFps = 1000 / this.deltaTime;
                this.fpsFilter += (instantFps - this.fpsFilter) * 0.08;
                this.fps = Math.round(this.fpsFilter);
            }

            this.render();

            this.animationFrame = requestAnimationFrame(this.boundFrame);
        }

        /* -----------------------------------------------------
           RENDER EXECUTION
        ----------------------------------------------------- */

        render() {
            if (!this.ctx || !this.canvas) return;

            if (this.settings.clearBeforeRender) {
                this.clear();
            }

            this.applyTransform();

            if (this.renderCallback) {
                this.renderCallback(this.ctx, this.getRenderState());
            }

            this.restoreTransform();
        }

        renderOnce() {
            this.render();
        }

        /* -----------------------------------------------------
           CLEAR CANVAS
        ----------------------------------------------------- */

        clear(color = null) {
            if (!this.ctx) return;

            this.ctx.save();
            this.resetContextTransform();

            if (color) {
                this.ctx.fillStyle = color;
                this.ctx.fillRect(0, 0, this.width, this.height);
            } else {
                this.ctx.clearRect(0, 0, this.width, this.height);
            }

            this.ctx.restore();
        }

        /* -----------------------------------------------------
           TRANSFORMS (Center-Oriented Rotation & Scale)
        ----------------------------------------------------- */

        applyTransform() {
            if (!this.ctx) return;

            const x = this.transform.x;
            const y = this.transform.y;
            const scale = this.transform.scale;
            const rotation = (this.transform.rotation * Math.PI) / 180;
            const opacity = Math.max(0, Math.min(1, this.transform.opacity));

            this.ctx.save();

            // Transform relative to canvas midpoint
            const centerX = this.width / 2;
            const centerY = this.height / 2;

            this.ctx.translate(centerX + x, centerY + y);
            this.ctx.rotate(rotation);
            this.ctx.scale(scale, scale);
            this.ctx.translate(-centerX, -centerY);

            this.ctx.globalAlpha = opacity;
        }

        restoreTransform() {
            if (this.ctx) {
                this.ctx.restore();
            }
        }

        /* -----------------------------------------------------
           SETTERS & GETTERS
        ----------------------------------------------------- */

        setPosition(x = 0, y = 0) {
            this.transform.x = Number(x) || 0;
            this.transform.y = Number(y) || 0;
        }

        setX(x) { this.transform.x = Number(x) || 0; }
        setY(y) { this.transform.y = Number(y) || 0; }

        setScale(scale) {
            this.transform.scale = Math.max(0.01, Number(scale) || 1);
        }

        setRotation(rotation) {
            this.transform.rotation = Number(rotation) || 0;
        }

        setOpacity(opacity) {
            this.transform.opacity = Math.max(0, Math.min(1, Number(opacity) || 0));
        }

        setTransform(transform = {}) {
            if (transform.x !== undefined) this.setX(transform.x);
            if (transform.y !== undefined) this.setY(transform.y);
            if (transform.scale !== undefined) this.setScale(transform.scale);
            if (transform.rotation !== undefined) this.setRotation(transform.rotation);
            if (transform.opacity !== undefined) this.setOpacity(transform.opacity);
        }

        resetTransform() {
            this.transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
        }

        getCenter() {
            return { x: this.width / 2, y: this.height / 2 };
        }

        normalizedToPixel(x, y) {
            return { x: x * this.width, y: y * this.height };
        }

        pixelToNormalized(x, y) {
            return {
                x: this.width ? x / this.width : 0,
                y: this.height ? y / this.height : 0
            };
        }

        getContext() { return this.ctx; }
        getCanvas() { return this.canvas; }
        getSize() { return { width: this.width, height: this.height }; }
        getFPS() { return this.fps; }
        getDeltaTime() { return this.deltaTime; }

        getRenderState() {
            return {
                width: this.width,
                height: this.height,
                pixelRatio: this.pixelRatio,
                deltaTime: this.deltaTime,
                fps: this.fps,
                transform: { ...this.transform }
            };
        }

        setAntialias(enabled) {
            this.settings.antialias = Boolean(enabled);
            if (this.ctx) this.ctx.imageSmoothingEnabled = this.settings.antialias;
        }

        setAutoResize(enabled) {
            this.settings.autoResize = Boolean(enabled);
        }

        setClearBeforeRender(enabled) {
            this.settings.clearBeforeRender = Boolean(enabled);
        }

        /* -----------------------------------------------------
           CLEANUP
        ----------------------------------------------------- */

        reset() {
            this.stop();
            this.resetTransform();
            this.deltaTime = 0;
            this.fps = 60;
            this.clear();
        }

        destroy() {
            this.stop();
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            window.removeEventListener("resize", this.boundResize);
            this.canvas = null;
            this.ctx = null;
            this.renderCallback = null;
        }
    }

    /* ---------------------------------------------------------
       GLOBAL EXPORT & AUTO-MOUNT
       --------------------------------------------------------- */

    window.VisualizerRenderer = VisualizerRenderer;
    window.visualizerRenderer = null;

    function initializeDefaultRenderer() {
        const canvas = document.getElementById("visualizerCanvas");
        if (!canvas) return;

        if (!window.visualizerRenderer) {
            window.visualizerRenderer = new VisualizerRenderer(canvas);
            console.log("Default VisualizerRenderer initialized.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeDefaultRenderer);
    } else {
        initializeDefaultRenderer();
    }
})();
