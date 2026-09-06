/* =========================================================
   AUDIO LOADER (OPTIMIZED & BULLETPROOF)
   Music Visualizer - js/audio/audio-loader.js
   ========================================================= */

(function () {
    "use strict";

    // Dynamic getters to prevent undefined issues if scripts load asynchronously
    function getState() {
        return window.VisualizerState || null;
    }

    function getUtils() {
        return window.VisualizerUtils || null;
    }

    /* =====================================================
       Configuration
       ===================================================== */
    const CONFIG = {
        maxFileSize: 500 * 1024 * 1024, // 500 MB

        supportedTypes: [
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/x-wav",
            "audio/wave",
            "audio/vnd.wave",
            "audio/ogg",
            "audio/webm",
            "audio/mp4",
            "audio/aac",
            "audio/flac",
            "audio/x-flac",
            "audio/m4a",
            "audio/x-m4a"
        ],

        supportedExtensions: [
            "mp3",
            "wav",
            "ogg",
            "webm",
            "mp4",
            "aac",
            "flac",
            "m4a"
        ]
    };

    /* =====================================================
       Internal State
       ===================================================== */
    let audioElement = null;
    let currentFile = null;
    let currentObjectUrl = null;
    let initialized = false;

    // Helper: Local fallback for extension extraction
    function extractExtension(filename) {
        if (typeof filename !== "string") return "";
        return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
    }

    // Helper: Local fallback for clamping values
    function clampValue(val, min, max) {
        return Math.min(Math.max(Number(val) || 0, min), max);
    }

    /* =====================================================
       Initialization & Teardown
       ===================================================== */
    function init(element) {
        if (!element) {
            console.error("AudioLoader: Audio element is required.");
            return false;
        }

        // Clean previous listeners if already bound
        if (audioElement) {
            removeEvents();
        }

        audioElement = element;
        setupEvents();
        initialized = true;

        console.log("AudioLoader initialized.");
        return true;
    }

    /* =====================================================
       Event Listeners Binding
       ===================================================== */
    function setupEvents() {
        if (!audioElement) return;

        audioElement.addEventListener("loadedmetadata", handleMetadata);
        audioElement.addEventListener("loadeddata", handleLoadedData);
        audioElement.addEventListener("canplay", handleCanPlay);
        audioElement.addEventListener("error", handleAudioError);
        audioElement.addEventListener("ended", handleEnded);
        audioElement.addEventListener("timeupdate", handleTimeUpdate);
        audioElement.addEventListener("play", handlePlay);
        audioElement.addEventListener("pause", handlePause);
        audioElement.addEventListener("volumechange", handleVolumeChange);
    }

    function removeEvents() {
        if (!audioElement) return;

        audioElement.removeEventListener("loadedmetadata", handleMetadata);
        audioElement.removeEventListener("loadeddata", handleLoadedData);
        audioElement.removeEventListener("canplay", handleCanPlay);
        audioElement.removeEventListener("error", handleAudioError);
        audioElement.removeEventListener("ended", handleEnded);
        audioElement.removeEventListener("timeupdate", handleTimeUpdate);
        audioElement.removeEventListener("play", handlePlay);
        audioElement.removeEventListener("pause", handlePause);
        audioElement.removeEventListener("volumechange", handleVolumeChange);
    }

    /* =====================================================
       Load File Workflow
       ===================================================== */
    function load(file) {
        if (!initialized || !audioElement) {
            return Promise.reject(new Error("AudioLoader is not initialized with an audio element."));
        }

        const validation = validateFile(file);
        if (!validation.valid) {
            return Promise.reject(new Error(validation.message));
        }

        // Clean previous audio URL to prevent memory leaks
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        currentFile = file;
        currentObjectUrl = URL.createObjectURL(file);

        audioElement.src = currentObjectUrl;
        audioElement.load();

        const State = getState();
        if (State) {
            State.setAudio({
                loaded: false,
                name: file.name,
                url: currentObjectUrl,
                duration: 0,
                currentTime: 0,
                playing: false,
                volume: audioElement.volume
            });
        }

        return waitForMetadata();
    }

    /* =====================================================
       Metadata Resolver (With readyState Race Fix)
       ===================================================== */
    function waitForMetadata() {
        return new Promise(function (resolve, reject) {
            if (!audioElement) {
                return reject(new Error("Audio element unavailable."));
            }

            // If metadata is already loaded by the browser, resolve immediately!
            if (audioElement.readyState >= 1 && Number.isFinite(audioElement.duration)) {
                syncStateOnLoaded();
                return resolve(getMetadata());
            }

            let timeoutId = null;

            function cleanupListeners() {
                if (timeoutId) clearTimeout(timeoutId);
                audioElement.removeEventListener("loadedmetadata", onMetadata);
                audioElement.removeEventListener("error", onError);
            }

            function syncStateOnLoaded() {
                const metadata = getMetadata();
                const State = getState();
                if (State) {
                    State.setDuration(metadata.duration);
                    State.setAudio({
                        loaded: true,
                        name: currentFile ? currentFile.name : "",
                        url: currentObjectUrl,
                        duration: metadata.duration,
                        currentTime: audioElement.currentTime,
                        playing: !audioElement.paused
                    });
                }
            }

            function onMetadata() {
                cleanupListeners();
                syncStateOnLoaded();
                resolve(getMetadata());
            }

            function onError() {
                cleanupListeners();
                reject(new Error("Unable to load audio file into HTML5 Audio element."));
            }

            timeoutId = setTimeout(function () {
                cleanupListeners();
                // If it's playable despite timeout, allow it
                if (audioElement.readyState >= 1) {
                    syncStateOnLoaded();
                    resolve(getMetadata());
                } else {
                    reject(new Error("Audio metadata loading timed out."));
                }
            }, 10000);

            audioElement.addEventListener("loadedmetadata", onMetadata);
            audioElement.addEventListener("error", onError);
        });
    }

    /* =====================================================
       File Validation
       ===================================================== */
    function validateFile(file) {
        if (!file) {
            return { valid: false, message: "No audio file selected." };
        }

        if (!(file instanceof File) && !(file instanceof Blob)) {
            return { valid: false, message: "Invalid file object." };
        }

        if (file.size <= 0) {
            return { valid: false, message: "The selected file is empty (0 bytes)." };
        }

        if (file.size > CONFIG.maxFileSize) {
            return { valid: false, message: "Audio file is too large. Maximum size is 500 MB." };
        }

        const Utils = getUtils();
        const extension = Utils ? Utils.getFileExtension(file.name) : extractExtension(file.name);
        const typeSupported = file.type ? CONFIG.supportedTypes.includes(file.type.toLowerCase()) : false;
        const extensionSupported = CONFIG.supportedExtensions.includes(extension.toLowerCase());

        // File must match either valid MIME or recognized audio extension
        if (!typeSupported && !extensionSupported) {
            return {
                valid: false,
                message: `Unsupported audio format (.${extension || "unknown"}). Supported: MP3, WAV, OGG, FLAC, AAC, M4A, WEBM.`
            };
        }

        return { valid: true, message: "" };
    }

    /* =====================================================
       Metadata Extraction
       ===================================================== */
    function getMetadata() {
        if (!audioElement) {
            return { name: "", size: 0, type: "", duration: 0, currentTime: 0 };
        }

        const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
        const currentTime = Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0;

        return {
            name: currentFile ? currentFile.name : "",
            size: currentFile ? currentFile.size : 0,
            type: currentFile ? currentFile.type : "",
            duration: duration,
            currentTime: currentTime
        };
    }

    /* =====================================================
       Audio Native Event Handlers
       ===================================================== */
    function handleMetadata() {
        if (!audioElement) return;
        const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
        const State = getState();
        if (State) {
            State.setDuration(duration);
            State.set("audio.duration", duration);
        }
    }

    function handleLoadedData() {
        const State = getState();
        if (State) State.set("audio.loaded", true);
    }

    function handleCanPlay() {
        const State = getState();
        if (State) State.set("audio.loaded", true);
    }

    function handleAudioError(event) {
        console.error("Audio element error encountered:", event);
        const State = getState();
        if (State) {
            State.setAudio({ loaded: false, playing: false });
        }
    }

    function handleEnded() {
        const State = getState();
        if (State) {
            State.set("audio.playing", false);
            State.setCurrentTime(audioElement ? audioElement.duration : 0);
        }
    }

    function handleTimeUpdate() {
        if (!audioElement || !Number.isFinite(audioElement.currentTime)) return;
        const State = getState();
        if (State) {
            State.setCurrentTime(audioElement.currentTime);
        }
    }

    function handlePlay() {
        const State = getState();
        if (State) State.set("audio.playing", true);
    }

    function handlePause() {
        const State = getState();
        if (State) State.set("audio.playing", false);
    }

    function handleVolumeChange() {
        if (!audioElement) return;
        const State = getState();
        if (State) State.set("audio.volume", audioElement.volume);
    }

    /* =====================================================
       Playback API (Autoplay Safe)
       ===================================================== */
    async function play() {
        if (!audioElement || !audioElement.src) {
            throw new Error("Cannot play: No audio source loaded.");
        }

        try {
            return await audioElement.play();
        } catch (err) {
            console.warn("Audio play prevented or interrupted:", err.message);
            const State = getState();
            if (State) State.set("audio.playing", false);
            throw err;
        }
    }

    function pause() {
        if (audioElement && !audioElement.paused) {
            audioElement.pause();
        }
    }

    function stop() {
        if (!audioElement) return;
        audioElement.pause();
        audioElement.currentTime = 0;
        const State = getState();
        if (State) State.setCurrentTime(0);
    }

    function seek(time) {
        if (!audioElement) return;
        const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
        const target = clampValue(time, 0, duration);

        audioElement.currentTime = target;
        const State = getState();
        if (State) State.setCurrentTime(target);
    }

    function setVolume(value) {
        if (!audioElement) return;
        const vol = clampValue(value, 0, 1);
        audioElement.volume = vol;
        const State = getState();
        if (State) State.set("audio.volume", vol);
    }

    async function togglePlay() {
        if (!audioElement) return;
        if (audioElement.paused) {
            return await play();
        } else {
            pause();
        }
    }

    /* =====================================================
       Cleanup & Reset
       ===================================================== */
    function cleanup() {
        if (audioElement) {
            audioElement.pause();
            audioElement.removeAttribute("src");
            audioElement.load();
        }

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        currentFile = null;

        const State = getState();
        if (State) {
            State.setAudio({
                loaded: false,
                name: "",
                url: "",
                duration: 0,
                currentTime: 0,
                playing: false
            });
        }
    }

    function destroy() {
        cleanup();
        removeEvents();
        audioElement = null;
        initialized = false;
    }

    /* =====================================================
       Public API Exposure
       ===================================================== */
    window.AudioLoader = {
        init,
        load,
        validateFile,
        getMetadata,
        getFile: () => currentFile,
        getObjectUrl: () => currentObjectUrl,
        getAudioElement: () => audioElement,
        isLoaded: () => Boolean(currentFile && audioElement && audioElement.readyState >= 1),
        getDuration: () => (audioElement && Number.isFinite(audioElement.duration) ? audioElement.duration : 0),
        getCurrentTime: () => (audioElement && Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0),
        play,
        pause,
        stop,
        seek,
        setVolume,
        togglePlay,
        cleanup,
        destroy
    };

    console.log("AudioLoader loaded and registered.");
})();
