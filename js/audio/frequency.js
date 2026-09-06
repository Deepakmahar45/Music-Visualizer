/* =========================================================
   FREQUENCY ANALYSIS ENGINE (OPTIMIZED & PERCEPTUALLY BALANCED)
   js/audio/frequency.js
   ========================================================= */

(function () {
    "use strict";

    class FrequencyAnalyzer {
        constructor() {
            this.analyzer = null;

            this.frequencyData = null;
            this.smoothedData = null;

            this.sampleRate = 44100;
            this.fftSize = 2048;
            this.frequencyBinCount = 1024;

            this.smoothing = 0.75;

            this.bands = {
                subBass: 0,
                bass: 0,
                lowMid: 0,
                mid: 0,
                highMid: 0,
                presence: 0,
                treble: 0,
                air: 0
            };

            this.peakFrequency = 0;
            this.peakValue = 0;
            this.totalEnergy = 0;
        }

        /* -----------------------------------------------------
           CONNECT ANALYSER NODE
        ----------------------------------------------------- */

        connect(analyserNode) {
            if (!analyserNode) return false;

            this.analyzer = analyserNode;
            this.fftSize = analyserNode.fftSize || 2048;
            this.frequencyBinCount = analyserNode.frequencyBinCount || this.fftSize / 2;

            this.frequencyData = new Uint8Array(this.frequencyBinCount);
            this.smoothedData = new Float32Array(this.frequencyBinCount);

            if (analyserNode.context && analyserNode.context.sampleRate) {
                this.sampleRate = analyserNode.context.sampleRate;
            }

            return true;
        }

        /* -----------------------------------------------------
           CONNECT FROM AUDIO ENGINE WRAPPER
        ----------------------------------------------------- */

        connectFromAudioAnalyzer(audioAnalyzer) {
            if (!audioAnalyzer) return false;

            if (audioAnalyzer.analyser) {
                return this.connect(audioAnalyzer.analyser);
            }
            if (audioAnalyzer.analyserNode) {
                return this.connect(audioAnalyzer.analyserNode);
            }
            if (typeof audioAnalyzer.getAnalyserNode === "function") {
                return this.connect(audioAnalyzer.getAnalyserNode());
            }

            return false;
        }

        /* -----------------------------------------------------
           CORE UPDATE LOOP
        ----------------------------------------------------- */

        update() {
            if (!this.analyzer) return this.bands;

            const currentBinCount = this.analyzer.frequencyBinCount;

            // Auto-resync if analyser node size changes dynamically
            if (!this.frequencyData || this.frequencyData.length !== currentBinCount) {
                this.frequencyBinCount = currentBinCount;
                this.fftSize = this.analyzer.fftSize;
                this.frequencyData = new Uint8Array(currentBinCount);
                this.smoothedData = new Float32Array(currentBinCount);
            }

            this.analyzer.getByteFrequencyData(this.frequencyData);

            this.updateSmoothing();
            this.calculateBands();
            this.calculatePeak();
            this.calculateTotalEnergy();

            return this.bands;
        }

        /* -----------------------------------------------------
           SMOOTHING ENGINE
        ----------------------------------------------------- */

        updateSmoothing() {
            if (!this.frequencyData || !this.smoothedData) return;

            const amount = Math.max(0, Math.min(0.99, this.smoothing));
            const len = this.frequencyData.length;

            for (let i = 0; i < len; i++) {
                const current = this.frequencyData[i] / 255;
                this.smoothedData[i] = this.smoothedData[i] * amount + current * (1 - amount);
            }
        }

        /* -----------------------------------------------------
           ACCURATE FREQUENCY BIN MAPPING
        ----------------------------------------------------- */

        frequencyToBin(frequency) {
            if (!this.sampleRate || !this.fftSize) return 0;
            const bin = (frequency * this.fftSize) / this.sampleRate;
            return Math.floor(bin);
        }

        binToFrequency(bin) {
            if (!this.sampleRate || !this.fftSize) return 0;
            return (bin * this.sampleRate) / this.fftSize;
        }

        /* -----------------------------------------------------
           BAND VALUE EXTRACTION (With Nyquist Safety)
        ----------------------------------------------------- */

        getBandValue(minFrequency, maxFrequency) {
            if (!this.smoothedData || !this.smoothedData.length) return 0;

            const totalBins = this.smoothedData.length;
            let start = this.frequencyToBin(minFrequency);
            let end = this.frequencyToBin(maxFrequency);

            start = Math.max(0, Math.min(totalBins - 1, start));
            end = Math.max(start + 1, Math.min(totalBins, end));

            let sum = 0;
            let count = 0;

            for (let i = start; i < end; i++) {
                sum += this.smoothedData[i];
                count++;
            }

            return count > 0 ? sum / count : 0;
        }

        /* -----------------------------------------------------
           OCTAVE BAND CALCULATION (Perceptually Weighted)
        ----------------------------------------------------- */

        calculateBands() {
            this.bands.subBass  = this.getBandValue(20, 60);
            this.bands.bass     = this.getBandValue(60, 250);
            this.bands.lowMid   = this.getBandValue(250, 500);
            this.bands.mid      = this.getBandValue(500, 2000);
            this.bands.highMid  = this.getBandValue(2000, 4000) * 1.1;  // High-mid presence boost
            this.bands.presence = this.getBandValue(4000, 6000) * 1.25; // Acoustic compensation
            this.bands.treble   = this.getBandValue(6000, 12000) * 1.4; // Air/sparkle boost
            this.bands.air      = this.getBandValue(12000, 20000) * 1.6;

            // Clamp all bands to [0, 1]
            for (const key in this.bands) {
                if (this.bands[key] > 1) this.bands[key] = 1;
            }
        }

        /* -----------------------------------------------------
           PEAK FREQUENCY (DC-Offset Filtered)
        ----------------------------------------------------- */

        calculatePeak() {
            if (!this.smoothedData || !this.smoothedData.length) {
                this.peakFrequency = 0;
                this.peakValue = 0;
                return;
            }

            let maxValue = 0;
            let maxIndex = 0;

            // Start searching from 25 Hz bin to avoid DC bias / electrical hum
            const minSearchBin = Math.max(1, this.frequencyToBin(25));
            const maxSearchBin = Math.min(this.smoothedData.length - 1, this.frequencyToBin(16000));

            for (let i = minSearchBin; i <= maxSearchBin; i++) {
                if (this.smoothedData[i] > maxValue) {
                    maxValue = this.smoothedData[i];
                    maxIndex = i;
                }
            }

            this.peakValue = maxValue;
            this.peakFrequency = this.binToFrequency(maxIndex);
        }

        /* -----------------------------------------------------
           TOTAL ENERGY (Musical Weighted Average)
        ----------------------------------------------------- */

        calculateTotalEnergy() {
            if (!this.smoothedData || !this.smoothedData.length) {
                this.totalEnergy = 0;
                return;
            }

            // Calculate energy predominantly from audible musical range (20 Hz - 10 kHz)
            const upperAudibleBin = Math.min(this.smoothedData.length, this.frequencyToBin(10000));
            const lowerAudibleBin = this.frequencyToBin(20);

            let sum = 0;
            let count = 0;

            for (let i = lowerAudibleBin; i < upperAudibleBin; i++) {
                sum += this.smoothedData[i];
                count++;
            }

            // Normalizes value so visualizer effects trigger smoothly
            const rawEnergy = count > 0 ? sum / count : 0;
            this.totalEnergy = Math.min(1, rawEnergy * 1.5);
        }

        /* -----------------------------------------------------
           GETTERS & VISUALIZER HELPERS
        ----------------------------------------------------- */

        getBand(name) {
            return this.bands[name] || 0;
        }

        getBands() {
            return Object.assign({}, this.bands);
        }

        getFrequencyData() {
            return this.frequencyData;
        }

        getSmoothedData() {
            return this.smoothedData;
        }

        getPeakFrequency() {
            return Math.round(this.peakFrequency);
        }

        getPeakValue() {
            return this.peakValue;
        }

        getEnergy() {
            return this.totalEnergy;
        }

        getBass() {
            return Math.min(1, this.bands.subBass * 0.4 + this.bands.bass * 0.6);
        }

        getMids() {
            return Math.min(1, this.bands.lowMid * 0.25 + this.bands.mid * 0.5 + this.bands.highMid * 0.25);
        }

        getHighs() {
            return Math.min(1, this.bands.presence * 0.35 + this.bands.treble * 0.45 + this.bands.air * 0.2);
        }

        getActivity() {
            return {
                bass: this.getBass(),
                mids: this.getMids(),
                highs: this.getHighs(),
                energy: this.totalEnergy
            };
        }

        setSmoothing(value) {
            this.smoothing = Math.max(0, Math.min(0.99, Number(value) || 0));
        }

        getFrequencyAt(position) {
            if (!this.smoothedData || !this.smoothedData.length) return 0;
            const pos = Math.max(0, Math.min(1, position));
            const index = Math.min(this.smoothedData.length - 1, Math.floor(pos * (this.smoothedData.length - 1)));
            return this.smoothedData[index] || 0;
        }

        getValueAtFrequency(frequency) {
            if (!this.smoothedData || !this.smoothedData.length) return 0;
            const index = this.frequencyToBin(frequency);
            if (index < 0 || index >= this.smoothedData.length) return 0;
            return this.smoothedData[index] || 0;
        }

        /* -----------------------------------------------------
           CLEANUP
        ----------------------------------------------------- */

        reset() {
            this.frequencyData = null;
            this.smoothedData = null;
            this.bands = {
                subBass: 0, bass: 0, lowMid: 0, mid: 0,
                highMid: 0, presence: 0, treble: 0, air: 0
            };
            this.peakFrequency = 0;
            this.peakValue = 0;
            this.totalEnergy = 0;
        }

        destroy() {
            this.analyzer = null;
            this.reset();
        }
    }

    /* ---------------------------------------------------------
       GLOBAL REGISTRATION
    --------------------------------------------------------- */
    window.FrequencyAnalyzer = FrequencyAnalyzer;
    window.frequencyAnalyzer = new FrequencyAnalyzer();

    console.log("FrequencyAnalyzer initialized.");
})();
