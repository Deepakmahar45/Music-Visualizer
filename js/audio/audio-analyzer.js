/* =========================================================
   AUDIO ANALYZER ENGINE (OPTIMIZED)
   Music Visualizer
========================================================= */

class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.audioElement = null;

        // 2048 FFT gives instant beat response with low latency (~46ms)
        this.fftSize = 2048;
        this.smoothing = 0.82;

        // Pre-allocate typed arrays to prevent null pointer exceptions
        this.timeData = new Uint8Array(this.fftSize);
        this.frequencyData = new Uint8Array(this.fftSize / 2);

        this.energy = 0;
        this.previousEnergy = 0;

        this.bass = 0;
        this.mid = 0;
        this.treble = 0;

        this.beat = false;
        this.beatStrength = 0;

        this.lastBeatTime = 0;
        this.beatCooldown = 130;

        this.initialized = false;
    }

    // --------------------------------
    // INITIALIZE
    // --------------------------------
    async init(audioElement) {
        if (!audioElement) {
            console.error("Audio element not provided.");
            return;
        }

        this.audioElement = audioElement;

        // Resume existing context if already initialized
        if (this.initialized && this.audioContext) {
            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.error("Web Audio API is not supported.");
            return;
        }

        if (!this.audioContext) {
            this.audioContext = new AudioContextClass();
        }

        if (!this.analyser) {
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = this.smoothing;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
        }

        // Prevent InvalidStateError by reusing cached MediaElementSourceNode
        if (!this.source) {
            if (this.audioElement._mediaSourceNode) {
                this.source = this.audioElement._mediaSourceNode;
            } else {
                this.source = this.audioContext.createMediaElementSource(this.audioElement);
                this.audioElement._mediaSourceNode = this.source;
            }
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
        }

        this.timeData = new Uint8Array(this.analyser.fftSize);
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        this.initialized = true;

        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        console.log("Audio Analyzer initialized.");
    }

    // --------------------------------
    // UPDATE (Render Loop)
    // --------------------------------
    update() {
        if (!this.initialized || !this.analyser) {
            return;
        }

        this.analyser.getByteTimeDomainData(this.timeData);
        this.analyser.getByteFrequencyData(this.frequencyData);

        this.calculateFrequencyBands();
        this.calculateEnergy();
        this.detectBeat();
    }

    // --------------------------------
    // ACCURATE FREQUENCY BANDS
    // --------------------------------
    calculateFrequencyBands() {
        const sampleRate = this.audioContext ? this.audioContext.sampleRate : 44100;
        const binWidth = sampleRate / this.fftSize;
        const totalBins = this.frequencyData.length;

        // Hz frequency thresholds: Sub/Kick Bass (20-250Hz), Mid (250-4000Hz), Treble (4000-16000Hz)
        const bassMinBin = Math.max(1, Math.floor(20 / binWidth));
        const bassMaxBin = Math.min(totalBins, Math.floor(250 / binWidth));
        const midMaxBin = Math.min(totalBins, Math.floor(4000 / binWidth));
        const trebleMaxBin = Math.min(totalBins, Math.floor(16000 / binWidth));

        let bassSum = 0;
        for (let i = bassMinBin; i < bassMaxBin; i++) {
            bassSum += this.frequencyData[i];
        }
        const rawBass = bassSum / ((bassMaxBin - bassMinBin) * 255 || 1);

        let midSum = 0;
        for (let i = bassMaxBin; i < midMaxBin; i++) {
            midSum += this.frequencyData[i];
        }
        const rawMid = midSum / ((midMaxBin - bassMaxBin) * 255 || 1);

        let trebleSum = 0;
        for (let i = midMaxBin; i < trebleMaxBin; i++) {
            trebleSum += this.frequencyData[i];
        }
        const rawTreble = trebleSum / ((trebleMaxBin - midMaxBin) * 255 || 1);

        // Smooth bands to prevent high-frequency jitter
        this.bass = this.bass * 0.7 + rawBass * 0.3;
        this.mid = this.mid * 0.7 + rawMid * 0.3;
        this.treble = this.treble * 0.7 + rawTreble * 0.3;
    }

    // --------------------------------
    // ENERGY
    // --------------------------------
    calculateEnergy() {
        const newEnergy = (this.bass * 0.55) + (this.mid * 0.30) + (this.treble * 0.15);
        this.energy = this.energy * 0.75 + newEnergy * 0.25;
    }

    // --------------------------------
    // BEAT DETECTION & DECAY
    // --------------------------------
    detectBeat() {
        const now = performance.now();
        const rise = this.energy - this.previousEnergy;
        const cooldownPassed = (now - this.lastBeatTime) > this.beatCooldown;

        if (rise > 0.045 && this.bass > 0.15 && cooldownPassed) {
            this.beat = true;
            this.beatStrength = Math.min(1, rise * 7);
            this.lastBeatTime = now;
        } else {
            this.beat = false;
        }

        // Smooth exponential decay for animations
        this.beatStrength *= 0.88;
        this.previousEnergy = this.energy;
    }

    // --------------------------------
    // GETTERS
    // --------------------------------
    getWaveform() {
        return this.timeData;
    }

    getFrequencyData() {
        return this.frequencyData;
    }

    getEnergy() {
        return this.energy;
    }

    getBass() {
        return this.bass;
    }

    getMid() {
        return this.mid;
    }

    getTreble() {
        return this.treble;
    }

    getBeat() {
        return this.beat;
    }

    getBeatStrength() {
        return this.beatStrength;
    }

    // --------------------------------
    // RESUME AUDIO
    // --------------------------------
    async resume() {
        if (this.audioContext && this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
    }

    // --------------------------------
    // DESTROY / RESET
    // --------------------------------
    destroy() {
        if (this.source) {
            try {
                this.source.disconnect();
            } catch (error) {}
        }

        if (this.analyser) {
            try {
                this.analyser.disconnect();
            } catch (error) {}
        }

        this.initialized = false;
    }
}

// Global Singleton Instance
window.audioAnalyzer = new AudioAnalyzer();
