/* =========================================================
   PROJECT STATE MANAGER (OPTIMIZED & SECURE)
   Music Visualizer
   ========================================================= */

(function () {
    "use strict";

    const defaultState = {
        project: {
            name: "Untitled Project",
            version: 1,
            createdAt: null,
            updatedAt: null
        },

        audio: {
            loaded: false,
            name: "",
            url: "",
            duration: 0,
            currentTime: 0,
            volume: 1,
            playing: false
        },

        canvas: {
            aspect: "16-9",
            width: 1920,
            height: 1080,
            fps: 30
        },

        visualizer: {
            type: "waveform",
            size: 1,
            opacity: 1,

            position: {
                x: 0,
                y: 0
            },

            transform: {
                scale: 1,
                rotation: 0,
                width: 100,
                height: 100
            },

            appearance: {
                colorMode: "solid",
                primaryColor: "#ffffff",
                secondaryColor: "#7c7cff",
                tertiaryColor: "#00d4ff",
                gradientAngle: 90,
                glow: true,
                glowIntensity: 0.7,
                thickness: 2,
                smoothing: 0.8
            }
        },

        effects: {
            enabled: true,
            active: ["glow", "beatPulse"],
            settings: {
                glow: { enabled: true, intensity: 0.7, color: "#ffffff" },
                bassPulse: { enabled: false, intensity: 0.5, color: "#ffffff" },
                beatPulse: { enabled: true, intensity: 0.5, color: "#ffffff" },
                particles: { enabled: false, intensity: 0.5, color: "#ffffff", count: 80 },
                dust: { enabled: false, intensity: 0.3, color: "#ffffff" },
                sparks: { enabled: false, intensity: 0.4, color: "#ffffff" },
                lightRays: { enabled: false, intensity: 0.4, color: "#ffffff" },
                lensFlare: { enabled: false, intensity: 0.4, color: "#ffffff" },
                bloom: { enabled: false, intensity: 0.5 },
                blur: { enabled: false, intensity: 0.2 },
                rgbSplit: { enabled: false, intensity: 0.2 },
                chromatic: { enabled: false, intensity: 0.2 },
                shake: { enabled: false, intensity: 0.2 },
                zoom: { enabled: false, intensity: 0.2 },
                flash: { enabled: false, intensity: 0.3, color: "#ffffff" },
                vignette: { enabled: false, intensity: 0.4 },
                grain: { enabled: false, intensity: 0.2 },
                scanlines: { enabled: false, intensity: 0.15 },
                noise: { enabled: false, intensity: 0.15 },
                trail: { enabled: false, intensity: 0.3 },
                echo: { enabled: false, intensity: 0.3 },
                distortion: { enabled: false, intensity: 0.2 },
                colorShift: { enabled: false, intensity: 0.2 },
                backgroundPulse: { enabled: false, intensity: 0.3 }
            }
        },

        background: {
            type: "gradient",
            source: "",
            opacity: 1,
            color: "#090909",
            gradient: {
                type: "linear",
                angle: 135,
                color1: "#090909",
                color2: "#171717"
            },
            effects: {
                blur: 0,
                brightness: 1,
                contrast: 1,
                saturation: 1
            },
            animation: {
                enabled: false,
                speed: 0.2
            }
        },

        text: {
            title: {
                text: "Your Song",
                visible: true,
                x: 50,
                y: 82,
                scale: 1,
                rotation: 0,
                opacity: 1,
                fontSize: 32,
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                color: "#ffffff",
                align: "center",
                animation: "none"
            },
            artist: {
                text: "Artist Name",
                visible: true,
                x: 50,
                y: 88,
                scale: 1,
                rotation: 0,
                opacity: 0.8,
                fontSize: 18,
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                color: "#bbbbbb",
                align: "center",
                animation: "none"
            }
        },

        lyrics: {
            enabled: false,
            text: "",
            lines: [],
            style: {
                fontSize: 24,
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                color: "#ffffff",
                x: 50,
                y: 75,
                align: "center",
                animation: "fade",
                animationDuration: 300
            },
            sync: {
                enabled: false,
                currentLine: -1,
                offset: 0
            }
        },

        scenes: {
            activeSceneId: "scene-1",
            list: [
                {
                    id: "scene-1",
                    name: "Scene 1",
                    start: 0,
                    end: 0,
                    background: {},
                    visualizer: {},
                    effects: {},
                    text: {},
                    transitionIn: "none",
                    transitionOut: "none"
                }
            ]
        },

        timeline: {
            zoom: 1,
            currentTime: 0,
            duration: 0,
            snap: true,
            snapValue: 0.1,
            markers: [],
            keyframes: []
        },

        preset: {
            active: "cinematic",
            custom: false
        },

        export: {
            format: "webm",
            quality: "high",
            resolution: "1920x1080",
            fps: 30,
            bitrate: "8M",
            audio: {
                enabled: true,
                bitrate: "192k"
            },
            filename: "music-visualizer"
        },

        ui: {
            selectedElement: null,
            selectedEffect: null,
            selectedScene: "scene-1",
            activePanel: null,
            isDragging: false,
            isExporting: false,
            isLoading: false,
            showLyrics: false,
            showTimeline: false
        }
    };

    /* =====================================================
       UTILITIES & SAFETY
       ===================================================== */
    function deepClone(value) {
        if (value === null || typeof value !== "object") return value;
        try {
            return structuredClone(value);
        } catch (e) {
            return JSON.parse(JSON.stringify(value));
        }
    }

    function isObject(val) {
        return val && typeof val === "object" && !Array.isArray(val);
    }

    // Prevents prototype pollution and clone array references safely
    function deepMerge(target, source) {
        if (!isObject(source)) return target;

        Object.keys(source).forEach(function (key) {
            if (key === "__proto__" || key === "constructor" || key === "prototype") return;

            const sourceVal = source[key];

            if (Array.isArray(sourceVal)) {
                target[key] = sourceVal.map(item => isObject(item) ? deepClone(item) : item);
            } else if (isObject(sourceVal)) {
                if (!isObject(target[key])) target[key] = {};
                deepMerge(target[key], sourceVal);
            } else {
                target[key] = sourceVal;
            }
        });

        return target;
    }

    // Normalizes effect names ("beat-pulse" -> "beatPulse")
    function toCamelCase(str) {
        return String(str || "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    /* =====================================================
       STATE CORE
       ===================================================== */
    let state = deepClone(defaultState);
    const listeners = new Set();

    function getState() {
        return state;
    }

    function getDefaultState() {
        return deepClone(defaultState);
    }

    function get(path) {
        if (!path) return state;
        const parts = path.split(".");
        let current = state;

        for (let i = 0; i < parts.length; i++) {
            if (current === undefined || current === null) return undefined;
            current = current[parts[i]];
        }
        return current;
    }

    function set(path, value, silent = false) {
        if (!path) return;
        const parts = path.split(".");
        let current = state;

        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (key === "__proto__" || key === "constructor" || key === "prototype") return;

            if (!isObject(current[key])) {
                current[key] = {};
            }
            current = current[key];
        }

        const finalKey = parts[parts.length - 1];
        if (finalKey === "__proto__" || finalKey === "constructor" || finalKey === "prototype") return;

        current[finalKey] = value;

        if (!silent) {
            notify(path, value);
        }
    }

    // Batch update: single notify call for multi-value updates
    function update(updates) {
        if (!isObject(updates)) return;

        Object.keys(updates).forEach(function (path) {
            set(path, updates[path], true);
        });

        notify("*", state);
    }

    function merge(data) {
        if (!isObject(data)) return;
        deepMerge(state, data);
        notify("*", state);
    }

    function reset() {
        state = deepClone(defaultState);
        state.project.createdAt = Date.now();
        state.project.updatedAt = Date.now();
        notify("*", state);
    }

    function resetSection(section) {
        if (!defaultState[section]) return;
        state[section] = deepClone(defaultState[section]);
        notify(section, state[section]);
    }

    function subscribe(callback) {
        if (typeof callback !== "function") return function () {};
        listeners.add(callback);
        return function unsubscribe() {
            listeners.delete(callback);
        };
    }

    function notify(path, value) {
        state.project.updatedAt = Date.now();
        listeners.forEach(function (callback) {
            try {
                callback({ path, value, state });
            } catch (error) {
                console.error("State listener error:", error);
            }
        });
    }

    /* =====================================================
       DOMAIN CONVENIENCE METHODS
       ===================================================== */
    function setProjectName(name) {
        set("project.name", String(name || "Untitled Project"));
    }

    function setAudio(data) {
        if (!data) return;
        merge({ audio: data });
    }

    // Accepts both "16:9" and "16-9"
    function setCanvasAspect(aspect) {
        const normalized = String(aspect || "").replace(":", "-");
        const sizes = {
            "16-9": { width: 1920, height: 1080 },
            "9-16": { width: 1080, height: 1920 },
            "1-1":  { width: 1080, height: 1080 }
        };

        if (!sizes[normalized]) return;

        update({
            "canvas.aspect": normalized,
            "canvas.width": sizes[normalized].width,
            "canvas.height": sizes[normalized].height
        });
    }

    function setVisualizerType(type) {
        set("visualizer.type", type);
    }

    function setVisualizerPosition(x, y) {
        update({
            "visualizer.position.x": Number(x) || 0,
            "visualizer.position.y": Number(y) || 0
        });
    }

    function setVisualizerTransform(transform) {
        merge({ visualizer: { transform } });
    }

    function setVisualizerAppearance(appearance) {
        merge({ visualizer: { appearance } });
    }

    // Effect Handlers (supports both kebab-case and camelCase safely)
    function enableEffect(rawName) {
        if (!rawName) return;
        const name = toCamelCase(rawName);

        if (!state.effects.active.includes(name)) {
            state.effects.active.push(name);
        }

        if (state.effects.settings[name]) {
            state.effects.settings[name].enabled = true;
        }

        notify("effects", state.effects);
    }

    function disableEffect(rawName) {
        if (!rawName) return;
        const name = toCamelCase(rawName);

        state.effects.active = state.effects.active.filter(item => item !== name);

        if (state.effects.settings[name]) {
            state.effects.settings[name].enabled = false;
        }

        notify("effects", state.effects);
    }

    function toggleEffect(rawName) {
        const name = toCamelCase(rawName);
        if (state.effects.active.includes(name)) {
            disableEffect(name);
        } else {
            enableEffect(name);
        }
    }

    function setEffectSetting(rawName, setting, value) {
        const name = toCamelCase(rawName);
        if (!state.effects.settings[name]) {
            state.effects.settings[name] = {};
        }

        state.effects.settings[name][setting] = value;
        notify(`effects.settings.${name}.${setting}`, value);
    }

    function setBackgroundType(type) {
        set("background.type", type);
    }

    function setBackgroundSource(source) {
        set("background.source", source);
    }

    function setBackgroundGradient(color1, color2, angle = 135) {
        merge({
            background: {
                gradient: { color1, color2, angle }
            }
        });
    }

    function setTitle(text) {
        set("text.title.text", String(text ?? ""));
    }

    function setArtist(text) {
        set("text.artist.text", String(text ?? ""));
    }

    function setTextPosition(target, x, y) {
        if (target !== "title" && target !== "artist") return;
        update({
            [`text.${target}.x`]: Number(x) || 0,
            [`text.${target}.y`]: Number(y) || 0
        });
    }

    function setLyrics(text) {
        set("lyrics.text", String(text ?? ""));
    }

    function setLyricsLines(lines) {
        set("lyrics.lines", Array.isArray(lines) ? lines : []);
    }

    function addScene(sceneData) {
        const scene = Object.assign({
            id: "scene-" + Date.now(),
            name: "Scene " + (state.scenes.list.length + 1),
            start: 0,
            end: state.timeline.duration,
            background: {},
            visualizer: {},
            effects: {},
            text: {},
            transitionIn: "none",
            transitionOut: "none"
        }, sceneData || {});

        state.scenes.list.push(scene);
        state.scenes.activeSceneId = scene.id;
        state.ui.selectedScene = scene.id;

        notify("scenes", state.scenes);
        return scene;
    }

    function removeScene(sceneId) {
        if (state.scenes.list.length <= 1) return false;

        state.scenes.list = state.scenes.list.filter(scene => scene.id !== sceneId);

        if (state.scenes.activeSceneId === sceneId) {
            state.scenes.activeSceneId = state.scenes.list[0].id;
            state.ui.selectedScene = state.scenes.list[0].id;
        }

        notify("scenes", state.scenes);
        return true;
    }

    function getActiveScene() {
        return state.scenes.list.find(scene => scene.id === state.scenes.activeSceneId);
    }

    function setCurrentTime(time) {
        const duration = state.timeline.duration;
        const current = Math.max(0, Math.min(Number(time) || 0, duration || Infinity));

        state.timeline.currentTime = current;
        state.audio.currentTime = current;
        notify("timeline.currentTime", current);
    }

    function setDuration(duration) {
        const value = Math.max(0, Number(duration) || 0);
        state.timeline.duration = value;
        state.audio.duration = value;
        notify("timeline.duration", value);
    }

    function setExportSettings(exportSettings) {
        merge({ export: exportSettings });
    }

    function serialize() {
        return deepClone(state);
    }

    function load(serializedState) {
        if (!isObject(serializedState)) return false;
        state = deepClone(defaultState);
        deepMerge(state, serializedState);
        notify("*", state);
        return true;
    }

    /* =====================================================
       PUBLIC API EXPOSURE
       ===================================================== */
    window.VisualizerState = {
        getState,
        getDefaultState,
        get,
        set,
        update,
        merge,
        reset,
        resetSection,
        subscribe,
        setProjectName,
        setAudio,
        setCanvasAspect,
        setVisualizerType,
        setVisualizerPosition,
        setVisualizerTransform,
        setVisualizerAppearance,
        enableEffect,
        disableEffect,
        toggleEffect,
        setEffectSetting,
        setBackgroundType,
        setBackgroundSource,
        setBackgroundGradient,
        setTitle,
        setArtist,
        setTextPosition,
        setLyrics,
        setLyricsLines,
        addScene,
        removeScene,
        getActiveScene,
        setCurrentTime,
        setDuration,
        setExportSettings,
        serialize,
        load
    };

    state.project.createdAt = Date.now();
    state.project.updatedAt = Date.now();

    console.log("VisualizerState initialized.");
})();
