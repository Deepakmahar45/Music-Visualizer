/* =========================================================
   MUSIC VISUALIZER - MAIN APPLICATION
========================================================= */

// DOM Elements - Audio & Upload
const audioFile = document.getElementById("audioFile");
const audioPlayer = document.getElementById("audioPlayer");
const audioUploadArea = document.getElementById("audioUploadArea");
const audioInfo = document.getElementById("audioInfo");
const audioTitle = document.querySelector(".audio-title");
const audioDuration = document.querySelector(".audio-duration");

// DOM Elements - Canvas & Workspace
const canvas = document.getElementById("visualizerCanvas");
const ctx = canvas.getContext("2d");
const visualizerContainer = document.getElementById("visualizerContainer");
const backgroundLayer = document.getElementById("backgroundLayer");
const emptyState = document.getElementById("emptyState");
const loadingOverlay = document.getElementById("loadingOverlay");

// DOM Elements - Status
const previewStatus = document.getElementById("previewStatus");
const systemStatus = document.getElementById("systemStatus");
const audioStatus = document.getElementById("audioStatus");
const fpsCounter = document.getElementById("fpsCounter");

// DOM Elements - Player
const playBtn = document.getElementById("playBtn");
const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const currentTime = document.getElementById("currentTime");
const totalTime = document.getElementById("totalTime");
const volume = document.getElementById("volume");

// DOM Elements - Text & Appearance
const titleInput = document.getElementById("titleInput");
const artistInput = document.getElementById("artistInput");
const fontSizeInput = document.getElementById("fontSize");
const songTitle = document.getElementById("songTitle");
const songArtist = document.getElementById("songArtist");

// DOM Elements - Visualizer Controls
const visualizerType = document.getElementById("visualizerType");
const waveformSize = document.getElementById("waveformSize");
const waveformOpacity = document.getElementById("waveformOpacity");
const waveformColor = document.getElementById("waveformColor");
const backgroundOverlay = document.getElementById("backgroundOverlay");

// DOM Elements - Effects
const glowEffect = document.getElementById("glowEffect");
const beatEffect = document.getElementById("beatEffect");
const particleEffect = document.getElementById("particleEffect");
const cameraEffect = document.getElementById("cameraEffect");

// DOM Elements - Background Options
const backgroundImageBtn = document.getElementById("backgroundImageBtn");
const backgroundVideoBtn = document.getElementById("backgroundVideoBtn");
const backgroundGradientBtn = document.getElementById("backgroundGradientBtn");
const backgroundFile = document.getElementById("backgroundFile");

// DOM Elements - Lyrics & Actions
const showLyrics = document.getElementById("showLyrics");
const lyricsInput = document.getElementById("lyricsInput");
const syncLyricsBtn = document.getElementById("syncLyricsBtn");
const newProjectBtn = document.getElementById("newProjectBtn");
const exportBtn = document.getElementById("exportBtn");

/* =========================================================
   AUDIO ENGINE & SETTINGS
========================================================= */
let audioContext = null;
let analyser = null;
let sourceNode = null;
let animationFrame = null;
let audioObjectURL = null;
let backgroundObjectURL = null;

let frequencyData = null;
let waveformData = null;

// Cached Dimensions for Performance
let canvasWidth = 0;
let canvasHeight = 0;

const settings = {
    waveformColor: "#ffffff",
    waveformSize: 50,
    waveformOpacity: 100,
    glow: true,
    beatReaction: true,
    particles: false,
    cameraMotion: false,
    visualizerType: "waveform",
    backgroundOverlay: 40
};

let particles = [];
let frameCount = 0;
let fpsTime = performance.now();

/* =========================================================
   CANVAS RESIZING
========================================================= */
function resizeCanvas() {
    const rect = visualizerContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvasWidth = rect.width;
    canvasHeight = rect.height;

    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
setTimeout(resizeCanvas, 50);

/* =========================================================
   TIME FORMATTER
========================================================= */
function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/* =========================================================
   AUDIO CONTEXT INITIALIZATION
========================================================= */
function createAudioEngine() {
    if (audioContext) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        alert("Your browser does not support Web Audio API.");
        return;
    }

    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;

    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    waveformData = new Uint8Array(analyser.fftSize);

    try {
        sourceNode = audioContext.createMediaElementSource(audioPlayer);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
    } catch (e) {
        console.warn("Audio source already connected or failed:", e);
    }
}

/* =========================================================
   AUDIO FILE HANDLING
========================================================= */
audioFile.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    if (audioObjectURL) URL.revokeObjectURL(audioObjectURL);
    audioObjectURL = URL.createObjectURL(file);
    audioPlayer.src = audioObjectURL;

    audioTitle.textContent = file.name;
    audioStatus.textContent = "Loaded";
    previewStatus.textContent = "Audio Loaded";
    systemStatus.textContent = "Audio ready";

    audioInfo.classList.add("loaded");
    audioUploadArea.classList.add("loaded");
    emptyState.style.display = "none";

    createAudioEngine();

    audioPlayer.currentTime = 0;
    progressFill.style.width = "0%";
    currentTime.textContent = "00:00";
    totalTime.textContent = "00:00";
});

audioPlayer.addEventListener("loadedmetadata", function () {
    const durationFormatted = formatTime(audioPlayer.duration);
    totalTime.textContent = durationFormatted;
    audioDuration.textContent = durationFormatted;
});

/* =========================================================
   PLAYBACK CONTROLS
========================================================= */
async function togglePlay() {
    if (!audioPlayer.src) {
        audioFile.click();
        return;
    }

    createAudioEngine();

    if (audioContext && audioContext.state === "suspended") {
        await audioContext.resume();
    }

    if (audioPlayer.paused) {
        await audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

playBtn.addEventListener("click", togglePlay);

audioPlayer.addEventListener("play", function () {
    playBtn.textContent = "❚❚";
    previewStatus.textContent = "Playing";
    systemStatus.textContent = "Visualizing";
    startVisualizer();
});

audioPlayer.addEventListener("pause", function () {
    playBtn.textContent = "▶";
    previewStatus.textContent = "Paused";
    stopVisualizer();
});

audioPlayer.addEventListener("ended", function () {
    playBtn.textContent = "▶";
    previewStatus.textContent = "Finished";
    systemStatus.textContent = "Song finished";
    progressFill.style.width = "100%";
    stopVisualizer();
});

audioPlayer.addEventListener("timeupdate", function () {
    if (!Number.isFinite(audioPlayer.duration)) return;
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressFill.style.width = `${progress}%`;
    currentTime.textContent = formatTime(audioPlayer.currentTime);
});

progressBar.addEventListener("click", function (event) {
    if (!Number.isFinite(audioPlayer.duration)) return;
    const rect = progressBar.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audioPlayer.currentTime = position * audioPlayer.duration;
});

volume.addEventListener("input", function () {
    audioPlayer.volume = Number(this.value) / 100;
});

/* =========================================================
   VISUALIZER RENDER LOOP
========================================================= */
function startVisualizer() {
    if (!animationFrame) {
        drawVisualizer();
    }
}

function stopVisualizer() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

function drawVisualizer() {
    animationFrame = requestAnimationFrame(drawVisualizer);

    // Clear previous frame
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Get Audio Data
    if (analyser) {
        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(waveformData);
    }

    // Draw dark overlay (lets background image/video show through)
    drawOverlay(canvasWidth, canvasHeight);

    // Render chosen style
    switch (settings.visualizerType) {
        case "bars":
            drawFrequencyBars(canvasWidth, canvasHeight);
            break;
        case "circle":
            drawCircularVisualizer(canvasWidth, canvasHeight);
            break;
        case "mirror":
            drawMirrorWaveform(canvasWidth, canvasHeight);
            break;
        case "waveform":
        default:
            drawWaveform(canvasWidth, canvasHeight);
            break;
    }

    // Draw effects
    if (settings.particles) {
        drawParticles(canvasWidth, canvasHeight);
    }

    updateFPS();
}

function drawOverlay(width, height) {
    const overlay = settings.backgroundOverlay / 100;
    if (overlay > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${overlay})`;
        ctx.fillRect(0, 0, width, height);
    }
}

/* =========================================================
   RENDERERS: WAVEFORM, BARS, CIRCLE, MIRROR
========================================================= */
function getAudioEnergy() {
    if (!frequencyData) return 0;
    let total = 0;
    const limit = Math.floor(frequencyData.length * 0.35);
    for (let i = 0; i < limit; i++) {
        total += frequencyData[i];
    }
    return total / (limit * 255);
}

function drawWaveform(width, height) {
    if (!waveformData) return;
    const centerY = height / 2;
    const amplitude = 0.15 + (settings.waveformSize / 100) * 0.85;
    const energy = getAudioEnergy();

    if (settings.glow) {
        ctx.shadowBlur = 15 + energy * 35;
        ctx.shadowColor = settings.waveformColor;
    }

    ctx.beginPath();
    const sliceWidth = width / waveformData.length;
    let x = 0;

    for (let i = 0; i < waveformData.length; i++) {
        const normalized = (waveformData[i] - 128) / 128;
        let y = centerY + normalized * centerY * amplitude;

        if (settings.beatReaction) {
            y = centerY + (y - centerY) * (1 + energy * 0.8);
        }

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
    }

    ctx.strokeStyle = settings.waveformColor;
    ctx.globalAlpha = settings.waveformOpacity / 100;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glow layer
    ctx.globalAlpha = (settings.waveformOpacity / 100) * 0.25;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

function drawMirrorWaveform(width, height) {
    if (!waveformData) return;
    const centerY = height / 2;
    const energy = getAudioEnergy();
    const amplitude = 0.15 + (settings.waveformSize / 100) * 0.8;

    ctx.strokeStyle = settings.waveformColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = settings.waveformOpacity / 100;

    if (settings.glow) {
        ctx.shadowBlur = 12 + energy * 30;
        ctx.shadowColor = settings.waveformColor;
    }

    // Top Wave
    ctx.beginPath();
    const sliceWidth = width / waveformData.length;
    let x = 0;

    for (let i = 0; i < waveformData.length; i++) {
        const normalized = (waveformData[i] - 128) / 128;
        const offset = normalized * centerY * amplitude * (1 + energy);
        const y = centerY - offset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();

    // Bottom Mirrored Wave
    ctx.beginPath();
    x = 0;
    for (let i = 0; i < waveformData.length; i++) {
        const normalized = (waveformData[i] - 128) / 128;
        const offset = normalized * centerY * amplitude * (1 + energy);
        const y = centerY + offset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

function drawFrequencyBars(width, height) {
    if (!frequencyData) return;
    const bars = 70;
    const barWidth = width / bars;
    const centerY = height / 2;
    const energy = getAudioEnergy();

    if (settings.glow) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = settings.waveformColor;
    }

    ctx.fillStyle = settings.waveformColor;
    ctx.globalAlpha = settings.waveformOpacity / 100;

    for (let i = 0; i < bars; i++) {
        const index = Math.floor((i * frequencyData.length) / bars);
        const value = frequencyData[index] / 255;
        const barHeight = value * height * 0.65 * (1 + energy * 0.35);
        const x = i * barWidth;

        ctx.fillRect(x + 1, centerY - barHeight / 2, Math.max(1, barWidth - 2), barHeight);
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

function drawCircularVisualizer(width, height) {
    if (!frequencyData) return;
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.18;
    const energy = getAudioEnergy();

    ctx.beginPath();
    const points = 160;

    for (let i = 0; i < points; i++) {
        const index = Math.floor((i * frequencyData.length) / points);
        const value = frequencyData[index] / 255;
        const angle = (i / points) * Math.PI * 2;
        const radius = baseRadius + value * height * 0.22 * (1 + energy);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.strokeStyle = settings.waveformColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = settings.waveformOpacity / 100;

    if (settings.glow) {
        ctx.shadowBlur = 15 + energy * 30;
        ctx.shadowColor = settings.waveformColor;
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

/* =========================================================
   PARTICLES SYSTEM
========================================================= */
function createParticles(width, height) {
    particles = [];
    for (let i = 0; i < 45; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 0.4 + 0.1,
            alpha: Math.random() * 0.5 + 0.1
        });
    }
}

function drawParticles(width, height) {
    if (particles.length === 0) createParticles(width, height);
    const energy = getAudioEnergy();

    for (const p of particles) {
        p.y -= p.speed * (1 + energy * 3);
        if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + energy * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = settings.waveformColor;
        ctx.globalAlpha = p.alpha * (1 + energy);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function updateFPS() {
    frameCount++;
    const now = performance.now();
    if (now - fpsTime >= 1000) {
        fpsCounter.textContent = frameCount;
        frameCount = 0;
        fpsTime = now;
    }
}

/* =========================================================
   CONTROLS & SETTINGS EVENT LISTENERS
========================================================= */
titleInput.addEventListener("input", function () {
    songTitle.textContent = this.value.trim() || "Your Song";
});

artistInput.addEventListener("input", function () {
    songArtist.textContent = this.value.trim() || "Artist Name";
});

if (fontSizeInput) {
    fontSizeInput.addEventListener("input", function () {
        songTitle.style.fontSize = `${this.value}px`;
    });
}

visualizerType.addEventListener("change", function () {
    settings.visualizerType = this.value;
});

waveformSize.addEventListener("input", function () {
    settings.waveformSize = Number(this.value);
});

waveformOpacity.addEventListener("input", function () {
    settings.waveformOpacity = Number(this.value);
});

waveformColor.addEventListener("input", function () {
    settings.waveformColor = this.value;
});

backgroundOverlay.addEventListener("input", function () {
    settings.backgroundOverlay = Number(this.value);
});

glowEffect.addEventListener("change", function () {
    settings.glow = this.checked;
});

beatEffect.addEventListener("change", function () {
    settings.beatReaction = this.checked;
});

particleEffect.addEventListener("change", function () {
    settings.particles = this.checked;
    if (!this.checked) particles = [];
});

cameraEffect.addEventListener("change", function () {
    settings.cameraMotion = this.checked;
    visualizerContainer.classList.toggle("camera-active", this.checked);
});

/* =========================================================
   BACKGROUND HANDLERS (Image, Video, Gradient)
========================================================= */
backgroundImageBtn.addEventListener("click", () => {
    backgroundFile.accept = "image/*";
    backgroundFile.click();
});

backgroundVideoBtn.addEventListener("click", () => {
    backgroundFile.accept = "video/*";
    backgroundFile.click();
});

backgroundFile.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    if (backgroundObjectURL) URL.revokeObjectURL(backgroundObjectURL);
    backgroundObjectURL = URL.createObjectURL(file);

    // Clear existing background
    backgroundLayer.innerHTML = "";
    backgroundLayer.style.backgroundImage = "";

    if (file.type.startsWith("image/")) {
        backgroundLayer.style.backgroundImage = `url("${backgroundObjectURL}")`;
        backgroundLayer.style.backgroundSize = "cover";
        backgroundLayer.style.backgroundPosition = "center";
        systemStatus.textContent = "Background image loaded";
    } else if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.src = backgroundObjectURL;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
        backgroundLayer.appendChild(video);
        systemStatus.textContent = "Background video loaded";
    }
});

backgroundGradientBtn.addEventListener("click", () => {
    backgroundLayer.innerHTML = "";
    backgroundLayer.style.backgroundImage = "radial-gradient(circle at 50% 45%, #3a3a3a 0%, #171717 35%, #050505 100%)";
    systemStatus.textContent = "Gradient background applied";
});

/* =========================================================
   ASPECT RATIO TOGGLE
========================================================= */
document.querySelectorAll(".aspect-btn").forEach((button) => {
    button.addEventListener("click", function () {
        document.querySelectorAll(".aspect-btn").forEach((btn) => btn.classList.remove("active"));
        this.classList.add("active");

        const aspect = this.dataset.aspect;
        visualizerContainer.classList.remove(
            "aspect-16-9", "aspect-9-16", "aspect-1-1",
            "ratio-16-9", "ratio-9-16", "ratio-1-1"
        );

        const classSuffix = aspect.replace(":", "-");
        visualizerContainer.classList.add(`aspect-${classSuffix}`, `ratio-${classSuffix}`);

        setTimeout(resizeCanvas, 50);
    });
});

/* =========================================================
   PRESETS
========================================================= */
const presets = {
    cinematic: { color: "#ffffff", size: 55, opacity: 100, glow: true, beat: true, particles: false, type: "waveform" },
    minimal: { color: "#ffffff", size: 35, opacity: 75, glow: false, beat: false, particles: false, type: "waveform" },
    neon: { color: "#00ffff", size: 65, opacity: 100, glow: true, beat: true, particles: true, type: "circle" },
    dark: { color: "#cccccc", size: 45, opacity: 70, glow: true, beat: true, particles: false, type: "mirror" }
};

document.querySelectorAll(".preset-btn").forEach((button) => {
    button.addEventListener("click", function () {
        const preset = presets[this.dataset.preset];
        if (!preset) return;

        settings.waveformColor = preset.color;
        settings.waveformSize = preset.size;
        settings.waveformOpacity = preset.opacity;
        settings.glow = preset.glow;
        settings.beatReaction = preset.beat;
        settings.particles = preset.particles;
        settings.visualizerType = preset.type;

        waveformColor.value = settings.waveformColor;
        waveformSize.value = settings.waveformSize;
        waveformOpacity.value = settings.waveformOpacity;
        glowEffect.checked = settings.glow;
        beatEffect.checked = settings.beatReaction;
        particleEffect.checked = settings.particles;
        visualizerType.value = settings.visualizerType;

        document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        systemStatus.textContent = `${this.dataset.preset} preset applied`;
    });
});

/* =========================================================
   DRAG & DROP
========================================================= */
audioUploadArea.addEventListener("dragover", function (e) {
    e.preventDefault();
    this.classList.add("dragging");
});

audioUploadArea.addEventListener("dragleave", function () {
    this.classList.remove("dragging");
});

audioUploadArea.addEventListener("drop", function (e) {
    e.preventDefault();
    this.classList.remove("dragging");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio/")) {
        const dt = new DataTransfer();
        dt.items.add(file);
        audioFile.files = dt.files;
        audioFile.dispatchEvent(new Event("change"));
    } else {
        alert("Please drop a valid audio file.");
    }
});

/* =========================================================
   NEW PROJECT & EXPORT
========================================================= */
newProjectBtn.addEventListener("click", () => {
    if (!confirm("Start a new project?")) return;

    audioPlayer.pause();
    stopVisualizer();
    audioPlayer.removeAttribute("src");
    audioPlayer.load();

    audioFile.value = "";
    titleInput.value = "";
    artistInput.value = "";
    songTitle.textContent = "Your Song";
    songArtist.textContent = "Artist Name";
    audioTitle.textContent = "No audio selected";
    audioDuration.textContent = "00:00";
    audioStatus.textContent = "Not Loaded";
    currentTime.textContent = "00:00";
    totalTime.textContent = "00:00";
    progressFill.style.width = "0%";
    emptyState.style.display = "flex";
    backgroundLayer.innerHTML = "";
    backgroundLayer.style.backgroundImage = "";
    particles = [];

    systemStatus.textContent = "New project";
    previewStatus.textContent = "Ready";
});

exportBtn.addEventListener("click", () => {
    alert("Video export engine will be added in the next update.");
});

// Initial volume and setup
audioPlayer.volume = 1;
systemStatus.textContent = "Ready";
previewStatus.textContent = "Ready";
