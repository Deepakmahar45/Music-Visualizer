/* =========================================================
   UTILITY FUNCTIONS (COMPLETE & OPTIMIZED)
   Music Visualizer - js/utils.js
   ========================================================= */

(function () {
    "use strict";

    /* =====================================================
       Number Utilities
       ===================================================== */
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function lerp(start, end, amount) {
        return start + (end - start) * amount;
    }

    function inverseLerp(start, end, value) {
        if (start === end) return 0;
        return (value - start) / (end - start);
    }

    function mapRange(value, inMin, inMax, outMin, outMax) {
        const normalized = inverseLerp(inMin, inMax, value);
        return lerp(outMin, outMax, normalized);
    }

    function normalize(value, min, max) {
        return clamp(mapRange(value, min, max, 0, 1), 0, 1);
    }

    function random(min = 0, max = 1) {
        return Math.random() * (max - min) + min;
    }

    function randomInt(min, max) {
        return Math.floor(random(min, max + 1));
    }

    function randomItem(array) {
        if (!Array.isArray(array) || array.length === 0) return null;
        return array[randomInt(0, array.length - 1)];
    }

    /* =====================================================
       Time Utilities
       ===================================================== */
    function formatTime(seconds) {
        seconds = Math.max(0, Number(seconds) || 0);
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
    }

    function formatTimeLong(seconds) {
        seconds = Math.max(0, Number(seconds) || 0);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remaining = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
        }
        return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
    }

    function parseTime(time) {
        if (typeof time === "number") return Math.max(0, time);
        if (typeof time !== "string" || !time.trim()) return 0;

        const parts = time.trim().split(":").map(Number);
        if (parts.some(Number.isNaN)) return 0;

        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }

    /* =====================================================
       DOM Utilities
       ===================================================== */
    function $(selector, parent = document) {
        return parent.querySelector(selector);
    }

    function $$(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    }

    function createElement(tag, className, attributes = {}) {
        const element = document.createElement(tag);
        if (className) element.className = className;

        Object.keys(attributes).forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
        return element;
    }

    function removeElement(element) {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    function showElement(element) {
        if (!element) return;
        element.hidden = false;
        element.style.display = "";
    }

    function hideElement(element) {
        if (!element) return;
        element.hidden = true;
    }

    function toggleElement(element, visible) {
        if (!element) return;
        element.hidden = !visible;
    }

    /* =====================================================
       Event Utilities
       ===================================================== */
    function on(element, event, handler, options) {
        if (!element || typeof handler !== "function") return function () {};
        element.addEventListener(event, handler, options);
        return function () {
            element.removeEventListener(event, handler, options);
        };
    }

    function once(element, event, handler) {
        return on(element, event, handler, { once: true });
    }

    function debounce(callback, delay = 250) {
        let timeout = null;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => callback.apply(this, args), delay);
        };
    }

    function throttle(callback, interval = 100) {
        let lastTime = 0;
        let timeout = null;

        return function (...args) {
            const now = performance.now();
            const remaining = interval - (now - lastTime);

            if (remaining <= 0) {
                clearTimeout(timeout);
                timeout = null;
                lastTime = now;
                callback.apply(this, args);
            } else if (!timeout) {
                timeout = setTimeout(() => {
                    lastTime = performance.now();
                    timeout = null;
                    callback.apply(this, args);
                }, remaining);
            }
        };
    }

    /* =====================================================
       Object Utilities & Safe Merging
       ===================================================== */
    function deepClone(object) {
        if (object === null || typeof object !== "object") return object;
        try {
            return structuredClone(object);
        } catch {
            return JSON.parse(JSON.stringify(object));
        }
    }

    function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function deepMerge(target, source) {
        if (!isObject(target) || !isObject(source)) return target;

        Object.keys(source).forEach(key => {
            if (key === "__proto__" || key === "constructor" || key === "prototype") return;

            const sourceValue = source[key];
            if (isObject(sourceValue)) {
                if (!isObject(target[key])) target[key] = {};
                deepMerge(target[key], sourceValue);
            } else {
                target[key] = sourceValue;
            }
        });
        return target;
    }

    function getNestedValue(object, path, fallback = undefined) {
        if (!object || !path) return fallback;
        const parts = path.split(".");
        let current = object;

        for (let i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) return fallback;
            current = current[parts[i]];
        }
        return current === undefined ? fallback : current;
    }

    function setNestedValue(object, path, value) {
        if (!object || !path) return object;
        const parts = path.split(".");
        let current = object;

        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (key === "__proto__" || key === "constructor" || key === "prototype") return object;

            if (!isObject(current[key])) current[key] = {};
            current = current[key];
        }

        const lastKey = parts[parts.length - 1];
        if (lastKey !== "__proto__" && lastKey !== "constructor" && lastKey !== "prototype") {
            current[lastKey] = value;
        }
        return object;
    }

    function generateId(prefix = "id") {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /* =====================================================
       Color Utilities
       ===================================================== */
    function hexToRgb(hex) {
        if (typeof hex !== "string") return null;
        let value = hex.trim().replace("#", "");

        if (value.length === 3) {
            value = value.split("").map(c => c + c).join("");
        }
        if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;

        return {
            r: parseInt(value.substring(0, 2), 16),
            g: parseInt(value.substring(2, 4), 16),
            b: parseInt(value.substring(4, 6), 16)
        };
    }

    function rgbToHex(r, g, b) {
        const hex = [r, g, b].map(val => {
            return clamp(Math.round(Number(val) || 0), 0, 255).toString(16).padStart(2, "0");
        });
        return `#${hex.join("")}`;
    }

    function hexToRgba(hex, alpha = 1) {
        const rgb = hexToRgb(hex);
        if (!rgb) return `rgba(255,255,255,${alpha})`;
        return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp(alpha, 0, 1)})`;
    }

    function mixColors(color1, color2, amount = 0.5) {
        const a = hexToRgb(color1);
        const b = hexToRgb(color2);
        if (!a || !b) return color1;

        amount = clamp(amount, 0, 1);
        return rgbToHex(
            lerp(a.r, b.r, amount),
            lerp(a.g, b.g, amount),
            lerp(a.b, b.b, amount)
        );
    }

    function randomHexColor() {
        return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
    }

    /* =====================================================
       Canvas Utilities
       ===================================================== */
    function resizeCanvas(canvas, width, height, pixelRatio = window.devicePixelRatio || 1) {
        if (!canvas) return;
        pixelRatio = Math.max(1, pixelRatio);

        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const context = canvas.getContext("2d");
        if (context) {
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        }
    }

    function clearCanvas(context, width, height) {
        if (context) {
            context.clearRect(0, 0, width, height);
        }
    }

    /* =====================================================
       Easing Functions
       ===================================================== */
    function easeLinear(t) { return t; }
    function easeInQuad(t) { return t * t; }
    function easeOutQuad(t) { return t * (2 - t); }
    function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
    function easeInCubic(t) { return t * t * t; }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function easeOutElastic(t) {
        const c4 = (2 * Math.PI) / 3;
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }

    /* =====================================================
       Geometry & Math
       ===================================================== */
    function degToRad(degrees) { return (degrees * Math.PI) / 180; }
    function radToDeg(radians) { return (radians * 180) / Math.PI; }
    function distance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
    function angleBetween(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

    /* =====================================================
       Browser & Device Utilities
       ===================================================== */
    function isMobile() { return window.innerWidth <= 650; }
    function isTouchDevice() { return "ontouchstart" in window || navigator.maxTouchPoints > 0; }
    function getDevicePixelRatio() { return window.devicePixelRatio || 1; }
    function requestFrame(callback) { return window.requestAnimationFrame(callback); }
    function cancelFrame(id) { window.cancelAnimationFrame(id); }

    /* =====================================================
       Audio Conversions
       ===================================================== */
    function dbToLinear(db) { return Math.pow(10, db / 20); }
    function linearToDb(value) { return value <= 0 ? -Infinity : 20 * Math.log10(value); }

    /* =====================================================
       File & Binary Utilities (Completed)
       ===================================================== */
    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    function getFileExtension(filename) {
        if (typeof filename !== "string") return "";
        return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    function downloadBlob(blob, filename = "file") {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    /* =====================================================
       Global Export
       ===================================================== */
    window.VisualizerUtils = {
        clamp, lerp, inverseLerp, mapRange, normalize,
        random, randomInt, randomItem,
        formatTime, formatTimeLong, parseTime,
        $, $$, createElement, removeElement, showElement, hideElement, toggleElement,
        on, once, debounce, throttle,
        deepClone, isObject, deepMerge, getNestedValue, setNestedValue, generateId,
        hexToRgb, rgbToHex, hexToRgba, mixColors, randomHexColor,
        resizeCanvas, clearCanvas,
        easeLinear, easeInQuad, easeOutQuad, easeInOutQuad, easeInCubic, easeOutCubic, easeInOutCubic, easeOutElastic,
        degToRad, radToDeg, distance, angleBetween,
        isMobile, isTouchDevice, getDevicePixelRatio, requestFrame, cancelFrame,
        dbToLinear, linearToDb,
        formatFileSize, getFileExtension, readFileAsDataURL, readFileAsArrayBuffer, downloadBlob
    };

    window.Utils = window.VisualizerUtils;
    console.log("VisualizerUtils initialized.");
})();
