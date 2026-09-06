/* =========================================================
   BEAT DETECTOR (PRECISION TRANSIENT & DECAY ENGINE)
   js/audio/beat-detector.js
   ========================================================= */

(function () {
    "use strict";

    class BeatDetector {
        constructor() {
            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
            this.enabled = true;

            /* Instantaneous & Smoothed Energy */
            this.instantEnergy = 0;
            this.instantBass = 0;
            this.smoothedEnergy = 0;
            this.smoothedBass = 0;
            this.energyDelta = 0;

            /* Beat Output & Smooth Decay */
            this.isBeat = false;
            this.beatStrength = 0;
            this.decayRate = 0.88; // Smooth beat fade-out for visualizer
            this.lastBeatTime = 0;

            /* Dynamic Thresholds */
            this.sensitivity = 0.65;
            this.cooldown = 130; // Minimum ms between consecutive beats
            this.bassThreshold = 0.12;
            this.energyThreshold = 0.04;
            this.riseThreshold = 0.015;

            /* Circular History Buffer (Prevents GC pauses) */
            this.historySize = 60;
            this.energyHistory = new Float32Array(this.historySize);
            this.historyIndex = 0;
            this.historyCount = 0;

            this.averageEnergy = 0;
            this.energyVariance = 0;

            /* BPM Tracker */
            this.beatTimes = [];
            this.bpm = 0;
            this.maxBeatHistory = 10;
        }

        /* -----------------------------------------------------
           CONNECT TO AUDIO ENGINES
        ----------------------------------------------------- */

        connect(audioAnalyzer, frequencyAnalyzer = null) {
            this.audioAnalyzer = audioAnalyzer || null;
            this.frequencyAnalyzer = frequencyAnalyzer || null;
            return !!this.audioAnalyzer;
        }

        /* -----------------------------------------------------
           CORE UPDATE LOOP
        ----------------------------------------------------- */

        update(currentTime = performance.now()) {
            if (!this.enabled) {
                this.resetFrame();
                return false;
            }

            if (!this.audioAnalyzer && !this.frequencyAnalyzer) {
                this.tryAutoConnect();
            }

            // Apply exponential decay to beat strength from previous frame
            this.beatStrength *= this.decayRate;
            if (this.beatStrength < 0.01) this.beatStrength = 0;

            this.isBeat = false;

            const hasAudio = this.readAudioData();
            if (!hasAudio) {
                return false;
            }

            this.updateHistory();
            this.updateAdaptiveThreshold();

            const detected = this.detectBeat(currentTime);
            if (detected) {
                this.registerBeat(currentTime);
            }

            return this.isBeat;
        }

        /* -----------------------------------------------------
           AUTO-DETECT GLOBAL ENGINES
        ----------------------------------------------------- */

        tryAutoConnect() {
            if (window.frequencyAnalyzer) {
                this.frequencyAnalyzer = window.frequencyAnalyzer;
            }
            if (window.audioAnalyzer) {
                this.audioAnalyzer = window.audioAnalyzer;
            }
        }

        /* -----------------------------------------------------
           READ INSTANT AUDIO DATA (No Redundant FFT Calls)
        ----------------------------------------------------- */

        readAudioData() {
            let rawEnergy = 0;
            let rawBass = 0;

            // Read directly without re-triggering .update()
            if (this.frequencyAnalyzer) {
                rawEnergy = typeof this.frequencyAnalyzer.getEnergy === "function"
                    ? this.frequencyAnalyzer.getEnergy()
                    : 0;

                if (typeof this.frequencyAnalyzer.getBand === "function") {
                    rawBass = this.frequencyAnalyzer.getBand("subBass") * 0.45 +
                              this.frequencyAnalyzer.getBand("bass") * 0.55;
                }
            }

            // Fallback to primary analyzer
            if (rawEnergy === 0 && this.audioAnalyzer) {
                rawEnergy = typeof this.audioAnalyzer.getEnergy === "function"
                    ? this.audioAnalyzer.getEnergy()
                    : 0;
                rawBass = typeof this.audioAnalyzer.getBass === "function"
                    ? this.audioAnalyzer.getBass()
                    : 0;
            }

            if (rawEnergy === 0 && rawBass === 0) {
                return false;
            }

            this.instantEnergy = rawEnergy;
            this.instantBass = rawBass;

            // Delta measured against running smoothed energy
            this.energyDelta = Math.max(0, this.instantEnergy - this.smoothedEnergy);

            // Fast attack, slow release smoothing
            this.smoothedEnergy = this.smoothedEnergy * 0.75 + this.instantEnergy * 0.25;
            this.smoothedBass = this.smoothedBass * 0.70 + this.instantBass * 0.30;

            return true;
        }

        /* -----------------------------------------------------
           CIRCULAR BUFFER HISTORY
        ----------------------------------------------------- */

        updateHistory() {
            this.energyHistory[this.historyIndex] = this.instantEnergy;
            this.historyIndex = (this.historyIndex + 1) % this.historySize;
            if (this.historyCount < this.historySize) {
                this.historyCount++;
            }
        }

        /* -----------------------------------------------------
           VARIANCE & RUNNING THRESHOLD
        ----------------------------------------------------- */

        updateAdaptiveThreshold() {
            if (this.historyCount === 0) {
                this.averageEnergy = 0;
                this.energyVariance = 0;
                return;
            }

            let sum = 0;
            for (let i = 0; i < this.historyCount; i++) {
                sum += this.energyHistory[i];
            }
            this.averageEnergy = sum / this.historyCount;

            let varianceSum = 0;
            for (let i = 0; i < this.historyCount; i++) {
                const diff = this.energyHistory[i] - this.averageEnergy;
                varianceSum += diff * diff;
            }
            this.energyVariance = varianceSum / this.historyCount;
        }

        /* -----------------------------------------------------
           TRANSIENT ONSET DETECTION
        ----------------------------------------------------- */

        detectBeat(currentTime) {
            const timeSinceBeat = currentTime - this.lastBeatTime;
            if (timeSinceBeat < this.cooldown) {
                return false;
            }

            // Adaptive threshold based on recent dynamic range
            const dynamicMultiplier = 1.0 + (1 - this.sensitivity) * 0.8;
            const threshold = this.averageEnergy + Math.sqrt(this.energyVariance) * dynamicMultiplier;

            const minEnergy = Math.max(this.energyThreshold, threshold * 0.7);
            const reqBass = Math.max(this.bassThreshold - (this.sensitivity - 0.5) * 0.06, 0.05);

            const hasRise = this.energyDelta > this.riseThreshold;
            const hasEnergy = this.instantEnergy > minEnergy;
            const hasBass = this.instantBass > reqBass;

            // Condition 1: Direct punchy kick/bass transient
            if (hasRise && hasEnergy && hasBass) {
                return true;
            }

            // Condition 2: Massive sudden energy spike
            if (this.instantEnergy > threshold * 1.35 && this.energyDelta > this.riseThreshold * 2) {
                return true;
            }

            return false;
        }

        /* -----------------------------------------------------
           BEAT REGISTRATION & PEAK STRENGTH
        ----------------------------------------------------- */

        registerBeat(currentTime) {
            this.isBeat = true;
            this.lastBeatTime = currentTime;

            // Calculate peak strength [0.3 - 1.0]
            const strength = (this.instantBass * 0.5) + (this.energyDelta * 12 * 0.3) + (this.instantEnergy * 0.2);
            this.beatStrength = Math.min(1.0, Math.max(0.35, strength * (0.8 + this.sensitivity * 0.4)));

            // Reset beat history if song was paused for more than 2 seconds
            if (this.beatTimes.length > 0 && (currentTime - this.beatTimes[this.beatTimes.length - 1]) > 2000) {
                this.beatTimes = [];
            }

            this.beatTimes.push(currentTime);
            if (this.beatTimes.length > this.maxBeatHistory) {
                this.beatTimes.shift();
            }

            this.calculateBPM();
        }

        /* -----------------------------------------------------
           ROBUST BPM ESTIMATION
        ----------------------------------------------------- */

        calculateBPM() {
            if (this.beatTimes.length < 4) return;

            const intervals = [];
            for (let i = 1; i < this.beatTimes.length; i++) {
                const interval = this.beatTimes[i] - this.beatTimes[i - 1];
                // Limit interval between 240ms (250 BPM) and 1500ms (40 BPM)
                if (interval >= 240 && interval <= 1500) {
                    intervals.push(interval);
                }
            }

            if (intervals.length < 3) return;

            // Sort intervals to discard outlier jitter
            intervals.sort((a, b) => a - b);
            const trimmed = intervals.slice(1, intervals.length - 1);

            const avgInterval = trimmed.reduce((acc, val) => acc + val, 0) / trimmed.length;
            const computedBPM = Math.round(60000 / avgInterval);

            if (computedBPM >= 50 && computedBPM <= 220) {
                this.bpm = computedBPM;
            }
        }

        /* -----------------------------------------------------
           SETTERS & GETTERS
        ----------------------------------------------------- */

        setSensitivity(value) {
            this.sensitivity = Math.max(0.1, Math.min(1.0, Number(value) || 0.65));
        }

        setCooldown(ms) {
            this.cooldown = Math.max(60, Number(ms) || 130);
        }

        setEnabled(value) {
            this.enabled = Boolean(value);
            if (!this.enabled) this.resetFrame();
        }

        getBeat() { return this.isBeat; }
        getStrength() { return this.beatStrength; }
        getEnergy() { return this.instantEnergy; }
        getBassEnergy() { return this.instantBass; }
        getEnergyDelta() { return this.energyDelta; }
        getBPM() { return this.bpm; }

        getState() {
            return {
                beat: this.isBeat,
                strength: this.beatStrength,
                energy: this.instantEnergy,
                bass: this.instantBass,
                energyDelta: this.energyDelta,
                bpm: this.bpm
            };
        }

        resetFrame() {
            this.isBeat = false;
            this.beatStrength = 0;
        }

        reset() {
            this.instantEnergy = 0;
            this.instantBass = 0;
            this.smoothedEnergy = 0;
            this.smoothedBass = 0;
            this.energyDelta = 0;
            this.isBeat = false;
            this.beatStrength = 0;
            this.lastBeatTime = 0;
            this.historyIndex = 0;
            this.historyCount = 0;
            this.beatTimes = [];
            this.bpm = 0;
        }

        destroy() {
            this.reset();
            this.audioAnalyzer = null;
            this.frequencyAnalyzer = null;
        }
    }

    /* ---------------------------------------------------------
       GLOBAL REGISTRATION
    --------------------------------------------------------- */
    window.BeatDetector = BeatDetector;
    window.beatDetector = new BeatDetector();

    console.log("BeatDetector initialized.");
})();
