/* =========================================================
   WAVEFORM ENGINE (HIGH-PERFORMANCE & PHASE-CORRECTED)
   js/audio/waveform.js
   ========================================================= */

(function () {
    "use strict";

    class WaveformEngine {
        constructor() {
            this.source = null;
            this.rawData = null;
            this.processedData = null;
            this.peaks = null;
            this.rms = null;

            this.sampleRate = 44100;
            this.duration = 0;
            this.defaultResolution = 1024;

            this.realtimeData = new Float32Array(0);
            this.smoothing = 0.15;
            this.normalized = true;
        }

        /* -----------------------------------------------------
           SOURCE & AUDIO BUFFER EXTRACTION
        ----------------------------------------------------- */

        setSource(audioBuffer) {
            if (!audioBuffer) {
                this.reset();
                return false;
            }

            this.source = audioBuffer;
            this.sampleRate = audioBuffer.sampleRate || 44100;
            this.duration = audioBuffer.duration || 0;

            this.rawData = this.extractMonoData(audioBuffer);
            this.processedData = null;
            this.peaks = null;
            this.rms = null;

            return true;
        }

        // Direct decoding from File or ArrayBuffer
        async loadFromFile(file, audioContext) {
            if (!file || !audioContext) {
                throw new Error("File and AudioContext are required.");
            }

            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            this.setSource(audioBuffer);
            return audioBuffer;
        }

        extractMonoData(audioBuffer) {
            if (!audioBuffer || !audioBuffer.numberOfChannels) {
                return new Float32Array(0);
            }

            const channels = audioBuffer.numberOfChannels;
            const length = audioBuffer.length;
            const mono = new Float32Array(length);

            // Fast path for mono audio
            if (channels === 1) {
                mono.set(audioBuffer.getChannelData(0));
                return mono;
            }

            // Downmix multi-channel to mono
            for (let c = 0; c < channels; c++) {
                const channelData = audioBuffer.getChannelData(c);
                for (let i = 0; i < length; i++) {
                    mono[i] += channelData[i] / channels;
                }
            }

            return mono;
        }

        /* -----------------------------------------------------
           DOWNSAMPLE (Fixed Phase Cancellation Bug)
        ----------------------------------------------------- */

        downsample(data, targetLength = this.defaultResolution) {
            if (!data || !data.length) return new Float32Array(0);

            targetLength = Math.max(1, Math.floor(targetLength));
            if (data.length <= targetLength) return new Float32Array(data);

            const result = new Float32Array(targetLength);
            const blockSize = data.length / targetLength;

            for (let i = 0; i < targetLength; i++) {
                const start = Math.floor(i * blockSize);
                const end = Math.min(data.length, Math.floor((i + 1) * blockSize));

                let sum = 0;
                let count = 0;

                for (let j = start; j < end; j++) {
                    // Rectified sum prevents waves from cancelling out
                    sum += Math.abs(data[j]);
                    count++;
                }

                result[i] = count ? sum / count : 0;
            }

            return result;
        }

        /* -----------------------------------------------------
           PEAK WAVEFORM GENERATION
        ----------------------------------------------------- */

        generatePeaks(targetLength = this.defaultResolution) {
            if (!this.rawData || !this.rawData.length) return new Float32Array(0);

            targetLength = Math.max(1, Math.floor(targetLength));
            const result = new Float32Array(targetLength);
            const blockSize = this.rawData.length / targetLength;

            for (let i = 0; i < targetLength; i++) {
                const start = Math.floor(i * blockSize);
                const end = Math.min(this.rawData.length, Math.floor((i + 1) * blockSize));

                let peak = 0;
                for (let j = start; j < end; j++) {
                    const absVal = Math.abs(this.rawData[j]);
                    if (absVal > peak) peak = absVal;
                }

                result[i] = peak;
            }

            this.peaks = result;
            return result;
        }

        /* -----------------------------------------------------
           MIN / MAX PEAKS (For Professional DAW Waveforms)
        ----------------------------------------------------- */

        generateMinMaxPeaks(targetLength = this.defaultResolution) {
            if (!this.rawData || !this.rawData.length) {
                return { min: new Float32Array(0), max: new Float32Array(0) };
            }

            targetLength = Math.max(1, Math.floor(targetLength));
            const minArr = new Float32Array(targetLength);
            const maxArr = new Float32Array(targetLength);
            const blockSize = this.rawData.length / targetLength;

            for (let i = 0; i < targetLength; i++) {
                const start = Math.floor(i * blockSize);
                const end = Math.min(this.rawData.length, Math.floor((i + 1) * blockSize));

                let min = 0;
                let max = 0;

                for (let j = start; j < end; j++) {
                    const val = this.rawData[j];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }

                minArr[i] = min;
                maxArr[i] = max;
            }

            return { min: minArr, max: maxArr };
        }

        /* -----------------------------------------------------
           RMS WAVEFORM GENERATION
        ----------------------------------------------------- */

        generateRMS(targetLength = this.defaultResolution) {
            if (!this.rawData || !this.rawData.length) return new Float32Array(0);

            targetLength = Math.max(1, Math.floor(targetLength));
            const result = new Float32Array(targetLength);
            const blockSize = this.rawData.length / targetLength;

            for (let i = 0; i < targetLength; i++) {
                const start = Math.floor(i * blockSize);
                const end = Math.min(this.rawData.length, Math.floor((i + 1) * blockSize));

                let sumSquares = 0;
                let count = 0;

                for (let j = start; j < end; j++) {
                    const val = this.rawData[j];
                    sumSquares += val * val;
                    count++;
                }

                result[i] = count ? Math.sqrt(sumSquares / count) : 0;
            }

            this.rms = result;
            return result;
        }

        /* -----------------------------------------------------
           NORMALIZATION & SMOOTHING
        ----------------------------------------------------- */

        normalize(data) {
            if (!data || !data.length) return new Float32Array(0);

            let max = 0;
            for (let i = 0; i < data.length; i++) {
                const abs = Math.abs(data[i]);
                if (abs > max) max = abs;
            }

            if (max === 0) return new Float32Array(data);

            const result = new Float32Array(data.length);
            for (let i = 0; i < data.length; i++) {
                result[i] = data[i] / max;
            }

            return result;
        }

        smooth(data, amount = this.smoothing) {
            if (!data || !data.length) return new Float32Array(0);

            amount = Math.max(0, Math.min(1, amount));
            const result = new Float32Array(data.length);
            result[0] = data[0];

            for (let i = 1; i < data.length; i++) {
                result[i] = result[i - 1] * amount + data[i] * (1 - amount);
            }

            return result;
        }

        /* -----------------------------------------------------
           BUILD STATIC PIPELINE
        ----------------------------------------------------- */

        build(options = {}) {
            const resolution = options.resolution || this.defaultResolution;
            const mode = options.mode || "peak";
            let data;

            if (mode === "rms") {
                data = this.generateRMS(resolution);
            } else if (mode === "average") {
                data = this.downsample(this.rawData, resolution);
            } else {
                data = this.generatePeaks(resolution);
            }

            if (options.normalize !== false) {
                data = this.normalize(data);
            }

            if (options.smoothing && options.smoothing > 0) {
                data = this.smooth(data, options.smoothing);
            }

            this.processedData = data;
            return data;
        }

        /* -----------------------------------------------------
           REAL-TIME SYNC (Handles Uint8 & Float32 Data)
        ----------------------------------------------------- */

        updateRealtime(analyzer) {
            if (!analyzer) return this.realtimeData;

            let data = null;
            if (typeof analyzer.getWaveform === "function") {
                data = analyzer.getWaveform();
            }

            if (!data || !data.length) return this.realtimeData;

            if (!this.realtimeData || this.realtimeData.length !== data.length) {
                this.realtimeData = new Float32Array(data.length);
            }

            // Handles Uint8 byte data (0..255 center 128) vs Float32 [-1..1]
            if (data instanceof Uint8Array) {
                for (let i = 0; i < data.length; i++) {
                    this.realtimeData[i] = (data[i] - 128) / 128;
                }
            } else {
                this.realtimeData.set(data);
            }

            return this.realtimeData;
        }

        getRealtime() {
            return this.realtimeData;
        }

        getData() {
            return this.processedData;
        }

        getPeaks() {
            return this.peaks;
        }

        getRMS() {
            return this.rms;
        }

        /* -----------------------------------------------------
           SAFE RANGE & SAMPLE ACCESS
        ----------------------------------------------------- */

        getSampleAt(position) {
            const data = this.processedData || this.rawData;
            if (!data || !data.length) return 0;

            const clampedPos = Math.max(0, Math.min(1, position));
            const index = Math.min(data.length - 1, Math.floor(clampedPos * (data.length - 1)));
            return data[index] || 0;
        }

        getRange(start, end) {
            const data = this.processedData || this.rawData;
            if (!data || !data.length) return new Float32Array(0);

            start = Math.max(0, Math.min(1, start));
            end = Math.max(0, Math.min(1, end));
            if (end < start) [start, end] = [end, start];

            const startIndex = Math.min(data.length - 1, Math.floor(start * data.length));
            const endIndex = Math.min(data.length, Math.floor(end * data.length));

            return data.slice(startIndex, Math.max(startIndex + 1, endIndex));
        }

        /* -----------------------------------------------------
           CANVAS RENDER HELPER (For Timeline/Tracks)
        ----------------------------------------------------- */

        drawToCanvas(canvas, options = {}) {
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            const width = canvas.width;
            const height = canvas.height;
            const color = options.color || "#4a78c4";
            const data = this.processedData || this.build({ resolution: width });

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = color;

            const midY = height / 2;
            const barWidth = Math.max(1, width / data.length);

            for (let i = 0; i < data.length; i++) {
                const amp = data[i] * (height / 2);
                ctx.fillRect(i * barWidth, midY - amp, Math.max(1, barWidth - 0.5), amp * 2);
            }
        }

        /* -----------------------------------------------------
           CLEANUP
        ----------------------------------------------------- */

        reset() {
            this.source = null;
            this.rawData = null;
            this.processedData = null;
            this.peaks = null;
            this.rms = null;
            this.sampleRate = 44100;
            this.duration = 0;
            this.realtimeData = new Float32Array(0);
        }

        destroy() {
            this.reset();
        }
    }

    /* ---------------------------------------------------------
       GLOBAL REGISTRATION
    --------------------------------------------------------- */
    window.WaveformEngine = WaveformEngine;
    window.waveformEngine = new WaveformEngine();

    console.log("WaveformEngine initialized.");
})();
