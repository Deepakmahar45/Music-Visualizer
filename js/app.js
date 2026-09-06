// ============================================
// MUSIC VISUALIZER - MAIN APP (FULLY INTEGRATED)
// ============================================

document.addEventListener("DOMContentLoaded", () => {

    // --------------------------------------------
    // DOM ELEMENTS (Mapped exactly to index.html)
    // --------------------------------------------
    const audioFile = document.getElementById("audioFile");
    const audioPlayer = document.getElementById("audioPlayer");
    const audioUploadArea = document.getElementById("audioUploadArea");

    const playBtn = document.getElementById("playBtn");
    const progressBar = document.getElementById("progressBar");
    const progressFill = document.getElementById("progressFill");
    const currentTimeDisplay = document.getElementById("currentTime");
    const totalTimeDisplay = document.getElementById("totalTime");
    const volumeSlider = document.getElementById("volume");

    const visualizerCanvas = document.getElementById("visualizerCanvas");
    const canvasContext = visualizerCanvas.getContext("2d");
    const visualizerContainer = document.getElementById("visualizerContainer");
    const backgroundLayer = document.getElementById("backgroundLayer");
    const emptyState = document.getElementById("emptyState");

    // Controls
    const visualizerType = document.getElementById("visualizerType");
    const waveformSize = document.getElementById("waveformSize");
    const waveformOpacity = document.getElementById("waveformOpacity");
    const waveformColor = document.getElementById("waveformColor");
    const backgroundOverlay = document.getElementById("backgroundOverlay");

    // Toggles
    const glowToggle = document.getElementById("glowEffect");
    const beatToggle = document.getElementById("beatEffect");
    const particlesToggle = document.getElementById("particleEffect");
    const cameraToggle = document.getElementById("cameraEffect");

    // Text Elements
    const titleInput = document.getElementById("titleInput");
    const artistInput = document.getElementById("artistInput");
    const fontSizeInput = document.getElementById("fontSize");
    const songTitle = document.getElementById("songTitle");
    const songArtist = document.getElementById("songArtist");

    // Background Controls
    const backgroundImageBtn = document.getElementById("backgroundImageBtn");
    const backgroundVideoBtn = document.getElementById("backgroundVideoBtn");
    const backgroundGradientBtn = document.getElementById("backgroundGradientBtn");
    const backgroundFile = document.getElementById("backgroundFile");

    // Status Elements
    const previewStatus = document.getElementById("previewStatus");
    const systemStatus = document.getElementById("systemStatus");
    const audioStatus = document.getElementById("audioStatus");
    const fpsCounter = document.getElementById("fpsCounter");

    // --------------------------------------------
    // STATE
    // --------------------------------------------
    let audioURL = null;
    let bgURL = null;
    let animationFrame = null;
    let particles = [];
    let canvasWidth = 0;
    let canvasHeight = 0;

    let frameCount = 0;
    let fpsTime = performance.now();

    // --------------------------------------------
    // CANVAS RESIZE
    // --------------------------------------------
    function resizeCanvas() {
        const rect = visualizerContainer.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvasWidth = rect.width;
        canvasHeight = rect.height;

        visualizerCanvas.width = canvasWidth * dpr;
        visualizerCanvas.height = canvasHeight * dpr;

        canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (audioPlayer.paused && !animationFrame) {
            drawVisualizer();
        }
    }

    window.addEventListener("resize", resizeCanvas);
    setTimeout(resizeCanvas, 50);

    // --------------------------------------------
    // TIME FORMATTER
    // --------------------------------------------
    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    // --------------------------------------------
    // AUDIO LOAD
    // --------------------------------------------
    audioFile?.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        await loadAudio(file);
    });

    async function loadAudio(file) {
        if (!file.type.startsWith("audio/")) {
            alert("Please select a valid audio file.");
            return;
        }

        if (audioURL) URL.revokeObjectURL(audioURL);
        audioURL = URL.createObjectURL(file);
        audioPlayer.src = audioURL;
        audioPlayer.load();

        if (window.audioAnalyzer) {
            try {
                await window.audioAnalyzer.init(audioPlayer);
            } catch (error) {
                console.error("Audio analyzer failed:", error);
            }
        }

        // UI Update
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        if (titleInput) {
            titleInput.value = cleanName;
            songTitle.textContent = cleanName;
        }

        const audioTitleEl = document.querySelector(".audio-title");
        if (audioTitleEl) audioTitleEl.textContent = file.name;

        if (audioStatus) audioStatus.textContent = "Loaded";
        if (previewStatus) previewStatus.textContent = "Ready";
        if (systemStatus) systemStatus.textContent = "Audio Loaded";

        if (emptyState) emptyState.style.display = "none";

        audioPlayer.currentTime = 0;
        if (progressFill) progressFill.style.width = "0%";
    }

    // --------------------------------------------
    // PLAY / PAUSE
    // --------------------------------------------
    playBtn?.addEventListener("click", togglePlay);

    async function togglePlay() {
        if (!audioPlayer.src) {
            audioFile.click();
            return;
        }

        if (window.audioAnalyzer) {
            await window.audioAnalyzer.resume();
        }

        if (audioPlayer.paused) {
            try {
                await audioPlayer.play();
            } catch (error) {
                console.error("Playback error:", error);
            }
        } else {
            audioPlayer.pause();
        }
    }

    audioPlayer?.addEventListener("play", () => {
        if (playBtn) playBtn.textContent = "❚❚";
        if (previewStatus) previewStatus.textContent = "Playing";
        if (systemStatus) systemStatus.textContent = "Visualizing";
        startVisualizer();
    });

    audioPlayer?.addEventListener("pause", () => {
        if (playBtn) playBtn.textContent = "▶";
        if (previewStatus) previewStatus.textContent = "Paused";
        stopVisualizer();
    });

    audioPlayer?.addEventListener("ended", () => {
        if (playBtn) playBtn.textContent = "▶";
        if (previewStatus) previewStatus.textContent = "Finished";
        if (progressFill) progressFill.style.width = "100%";
        stopVisualizer();
    });

    audioPlayer?.addEventListener("loadedmetadata", () => {
        const formatted = formatTime(audioPlayer.duration);
        if (totalTimeDisplay) totalTimeDisplay.textContent = formatted;
        const audioDurationEl = document.querySelector(".audio-duration");
        if (audioDurationEl) audioDurationEl.textContent = formatted;
    });

    // --------------------------------------------
    // PROGRESS & SEEK (Custom Div Support)
    // --------------------------------------------
    audioPlayer?.addEventListener("timeupdate", () => {
        if (!audioPlayer.duration) return;
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
    });

    progressBar?.addEventListener("click", (event) => {
        if (!audioPlayer.duration) return;
        const rect = progressBar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        audioPlayer.currentTime = pos * audioPlayer.duration;
    });

    volumeSlider?.addEventListener("input", () => {
        audioPlayer.volume = Number(volumeSlider.value) / 100;
    });

    // --------------------------------------------
    // TEXT CUSTOMIZATION
    // --------------------------------------------
    titleInput?.addEventListener("input", () => {
        songTitle.textContent = titleInput.value.trim() || "Your Song";
    });

    artistInput?.addEventListener("input", () => {
        songArtist.textContent = artistInput.value.trim() || "Artist Name";
    });

    fontSizeInput?.addEventListener("input", () => {
        songTitle.style.fontSize = `${fontSizeInput.value}px`;
    });

    // --------------------------------------------
    // ASPECT RATIO CONTROLS
    // --------------------------------------------
    document.querySelectorAll(".aspect-btn").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".aspect-btn").forEach((btn) => btn.classList.remove("active"));
            button.classList.add("active");

            const aspect = button.dataset.aspect;
            visualizerContainer.classList.remove(
                "aspect-16-9", "aspect-9-16", "aspect-1-1",
                "ratio-16-9", "ratio-9-16", "ratio-1-1"
            );

            const classSuffix = aspect.replace(":", "-");
            visualizerContainer.classList.add(`aspect-${classSuffix}`, `ratio-${classSuffix}`);

            setTimeout(resizeCanvas, 50);
        });
    });

    // --------------------------------------------
    // BACKGROUND HANDLING
    // --------------------------------------------
    backgroundImageBtn?.addEventListener("click", () => {
        backgroundFile.accept = "image/*";
        backgroundFile.click();
    });

    backgroundVideoBtn?.addEventListener("click", () => {
        backgroundFile.accept = "video/*";
        backgroundFile.click();
    });

    backgroundFile?.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (bgURL) URL.revokeObjectURL(bgURL);
        bgURL = URL.createObjectURL(file);

        backgroundLayer.innerHTML = "";
        backgroundLayer.style.backgroundImage = "";

        if (file.type.startsWith("image/")) {
            backgroundLayer.style.backgroundImage = `url("${bgURL}")`;
            backgroundLayer.style.backgroundSize = "cover";
            backgroundLayer.style.backgroundPosition = "center";
            if (systemStatus) systemStatus.textContent = "Background image applied";
        } else if (file.type.startsWith("video/")) {
            const video = document.createElement("video");
            video.src = bgURL;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.style.width = "100%";
            video.style.height = "100%";
            video.style.objectFit = "cover";
            backgroundLayer.appendChild(video);
            video.play().catch(() => {});
            if (systemStatus) systemStatus.textContent = "Background video applied";
        }
    });

    backgroundGradientBtn?.addEventListener("click", () => {
        backgroundLayer.innerHTML = "";
        backgroundLayer.style.backgroundImage =
            "radial-gradient(circle at center, #242424 0%, #0b0b0b 55%, #000000 100%)";
        if (systemStatus) systemStatus.textContent = "Gradient applied";
    });

    // --------------------------------------------
    // MAIN RENDER LOOP
    // --------------------------------------------
    function startVisualizer() {
        if (!animationFrame) animate();
    }

    function stopVisualizer() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    }

    function animate() {
        animationFrame = requestAnimationFrame(animate);

        if (window.audioAnalyzer && window.audioAnalyzer.initialized) {
            window.audioAnalyzer.update();
        }

        drawVisualizer();
        updateFPS();
    }

    // --------------------------------------------
    // DRAW VISUALIZER
    // --------------------------------------------
    function drawVisualizer() {
        if (!canvasWidth || !canvasHeight) return;

        canvasContext.clearRect(0, 0, canvasWidth, canvasHeight);

        // Dark Overlay for background dimming
        const overlay = (backgroundOverlay?.value || 40) / 100;
        if (overlay > 0) {
            canvasContext.fillStyle = `rgba(0, 0, 0, ${overlay})`;
            canvasContext.fillRect(0, 0, canvasWidth, canvasHeight);
        }

        const analyzer = window.audioAnalyzer;
        const waveform = analyzer?.getWaveform();
        const frequency = analyzer?.getFrequencyData();
        const energy = analyzer?.getEnergy() || 0;
        const beatStrength = analyzer?.getBeatStrength() || 0;

        // Camera Shake effect
        if (cameraToggle?.checked && beatToggle?.checked) {
            const scale = 1 + beatStrength * 0.03;
            visualizerContainer.style.transform = `scale(${scale})`;
        } else {
            visualizerContainer.style.transform = "none";
        }

        const color = waveformColor?.value || "#ffffff";
        const opacity = (waveformOpacity?.value || 100) / 100;
        const sizeScale = (waveformSize?.value || 50) / 100;
        const currentType = visualizerType?.value || "waveform";

        // Render Style Selection
        switch (currentType) {
            case "bars":
                drawBars(canvasWidth, canvasHeight, frequency, color, opacity, energy);
                break;
            case "circle":
                drawCircle(canvasWidth, canvasHeight, frequency, color, opacity, energy);
                break;
            case "mirror":
                drawMirror(canvasWidth, canvasHeight, waveform, color, opacity, sizeScale, energy);
                break;
            case "waveform":
            default:
                drawWaveform(canvasWidth, canvasHeight, waveform, color, opacity, sizeScale, energy);
                break;
        }

        // Floating Particles
        if (particlesToggle?.checked) {
            updateAndDrawParticles(canvasWidth, canvasHeight, energy, color);
        }
    }

    // --------------------------------------------
    // STYLES: WAVEFORM, BARS, CIRCLE, MIRROR
    // --------------------------------------------
    function drawWaveform(width, height, waveform, color, opacity, sizeScale, energy) {
        if (!waveform) return;

        const centerY = height / 2;
        const amplitude = (height * 0.35) * sizeScale * (1 + (beatToggle?.checked ? energy * 0.5 : 0));

        if (glowToggle?.checked) {
            canvasContext.shadowBlur = 15 + energy * 25;
            canvasContext.shadowColor = color;
        }

        canvasContext.beginPath();
        const sliceWidth = width / waveform.length;
        let x = 0;

        for (let i = 0; i < waveform.length; i++) {
            const normalized = (waveform[i] - 128) / 128;
            const y = centerY + normalized * amplitude;

            if (i === 0) canvasContext.moveTo(x, y);
            else canvasContext.lineTo(x, y);

            x += sliceWidth;
        }

        canvasContext.strokeStyle = color;
        canvasContext.globalAlpha = opacity;
        canvasContext.lineWidth = 2.5;
        canvasContext.stroke();

        // Second softer stroke for bloom
        canvasContext.lineWidth = 6;
        canvasContext.globalAlpha = opacity * 0.25;
        canvasContext.stroke();

        canvasContext.globalAlpha = 1;
        canvasContext.shadowBlur = 0;
    }

    function drawMirror(width, height, waveform, color, opacity, sizeScale, energy) {
        if (!waveform) return;

        const centerY = height / 2;
        const amplitude = (height * 0.3) * sizeScale * (1 + (beatToggle?.checked ? energy * 0.5 : 0));

        if (glowToggle?.checked) {
            canvasContext.shadowBlur = 12 + energy * 25;
            canvasContext.shadowColor = color;
        }

        canvasContext.strokeStyle = color;
        canvasContext.lineWidth = 2;
        canvasContext.globalAlpha = opacity;

        // Top half
        canvasContext.beginPath();
        let x = 0;
        const sliceWidth = width / waveform.length;
        for (let i = 0; i < waveform.length; i++) {
            const normalized = (waveform[i] - 128) / 128;
            const y = centerY - Math.abs(normalized) * amplitude;
            if (i === 0) canvasContext.moveTo(x, y);
            else canvasContext.lineTo(x, y);
            x += sliceWidth;
        }
        canvasContext.stroke();

        // Bottom half
        canvasContext.beginPath();
        x = 0;
        for (let i = 0; i < waveform.length; i++) {
            const normalized = (waveform[i] - 128) / 128;
            const y = centerY + Math.abs(normalized) * amplitude;
            if (i === 0) canvasContext.moveTo(x, y);
            else canvasContext.lineTo(x, y);
            x += sliceWidth;
        }
        canvasContext.stroke();

        canvasContext.globalAlpha = 1;
        canvasContext.shadowBlur = 0;
    }

    function drawBars(width, height, frequency, color, opacity, energy) {
        if (!frequency) return;

        const bars = 64;
        const barWidth = width / bars;
        const centerY = height / 2;

        if (glowToggle?.checked) {
            canvasContext.shadowBlur = 8;
            canvasContext.shadowColor = color;
        }

        canvasContext.fillStyle = color;
        canvasContext.globalAlpha = opacity;

        for (let i = 0; i < bars; i++) {
            const index = Math.floor((i * frequency.length) / bars);
            const val = frequency[index] / 255;
            const barHeight = val * (height * 0.6) * (1 + (beatToggle?.checked ? energy * 0.4 : 0));
            const x = i * barWidth;

            canvasContext.fillRect(x + 1, centerY - barHeight / 2, Math.max(1, barWidth - 2), barHeight);
        }

        canvasContext.globalAlpha = 1;
        canvasContext.shadowBlur = 0;
    }

    function drawCircle(width, height, frequency, color, opacity, energy) {
        if (!frequency) return;

        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.18;
        const points = 160;

        if (glowToggle?.checked) {
            canvasContext.shadowBlur = 15 + energy * 25;
            canvasContext.shadowColor = color;
        }

        canvasContext.beginPath();
        for (let i = 0; i < points; i++) {
            const index = Math.floor((i * frequency.length) / points);
            const val = frequency[index] / 255;
            const angle = (i / points) * Math.PI * 2;
            const radius = baseRadius + val * (height * 0.2) * (1 + (beatToggle?.checked ? energy * 0.6 : 0));
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            if (i === 0) canvasContext.moveTo(x, y);
            else canvasContext.lineTo(x, y);
        }

        canvasContext.closePath();
        canvasContext.strokeStyle = color;
        canvasContext.lineWidth = 2.2;
        canvasContext.globalAlpha = opacity;
        canvasContext.stroke();

        canvasContext.globalAlpha = 1;
        canvasContext.shadowBlur = 0;
    }

    // --------------------------------------------
    // PARTICLES ENGINE
    // --------------------------------------------
    function updateAndDrawParticles(width, height, energy, color) {
        if (particles.length < 50) {
            particles.push({
                x: Math.random() * width,
                y: height + Math.random() * 20,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 1.2 + 0.4,
                alpha: Math.random() * 0.5 + 0.2
            });
        }

        canvasContext.fillStyle = color;

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.y -= p.speed * (1 + energy * 2);
            p.alpha -= 0.002;

            if (p.y < -10 || p.alpha <= 0) {
                particles.splice(i, 1);
                continue;
            }

            canvasContext.globalAlpha = p.alpha;
            canvasContext.beginPath();
            canvasContext.arc(p.x, p.y, p.size + energy, 0, Math.PI * 2);
            canvasContext.fill();
        }

        canvasContext.globalAlpha = 1;
    }

    // --------------------------------------------
    // PRESETS
    // --------------------------------------------
    const presets = {
        cinematic: { color: "#ffffff", size: 55, opacity: 100, glow: true, beat: true, particles: false, type: "waveform" },
        minimal: { color: "#ffffff", size: 35, opacity: 75, glow: false, beat: false, particles: false, type: "waveform" },
        neon: { color: "#00ffff", size: 65, opacity: 100, glow: true, beat: true, particles: true, type: "circle" },
        dark: { color: "#cccccc", size: 45, opacity: 70, glow: true, beat: true, particles: false, type: "mirror" }
    };

    document.querySelectorAll(".preset-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const preset = presets[button.dataset.preset];
            if (!preset) return;

            if (waveformColor) waveformColor.value = preset.color;
            if (waveformSize) waveformSize.value = preset.size;
            if (waveformOpacity) waveformOpacity.value = preset.opacity;
            if (glowToggle) glowToggle.checked = preset.glow;
            if (beatToggle) beatToggle.checked = preset.beat;
            if (particlesToggle) particlesToggle.checked = preset.particles;
            if (visualizerType) visualizerType.value = preset.type;

            document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
            button.classList.add("active");
            if (systemStatus) systemStatus.textContent = `${button.dataset.preset} preset applied`;
        });
    });

    // --------------------------------------------
    // FPS COUNTER
    // --------------------------------------------
    function updateFPS() {
        frameCount++;
        const now = performance.now();
        if (now - fpsTime >= 1000) {
            if (fpsCounter) fpsCounter.textContent = frameCount;
            frameCount = 0;
            fpsTime = now;
        }
    }

    // --------------------------------------------
    // KEYBOARD SHORTCUTS
    // --------------------------------------------
    document.addEventListener("keydown", (event) => {
        if (
            event.code === "Space" &&
            document.activeElement.tagName !== "INPUT" &&
            document.activeElement.tagName !== "TEXTAREA"
        ) {
            event.preventDefault();
            togglePlay();
        }
    });

    // --------------------------------------------
    // DRAG & DROP
    // --------------------------------------------
    audioUploadArea?.addEventListener("dragover", (e) => {
        e.preventDefault();
        audioUploadArea.classList.add("dragging");
    });

    audioUploadArea?.addEventListener("dragleave", () => {
        audioUploadArea.classList.remove("dragging");
    });

    audioUploadArea?.addEventListener("drop", (e) => {
        e.preventDefault();
        audioUploadArea.classList.remove("dragging");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("audio/")) {
            loadAudio(file);
        } else {
            alert("Please drop a valid audio file.");
        }
    });

    // Initialize Default View
    resizeCanvas();
    if (systemStatus) systemStatus.textContent = "Ready";
});
