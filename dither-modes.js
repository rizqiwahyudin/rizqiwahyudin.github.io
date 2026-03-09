(function () {
'use strict';

/* ========== Bayer 8×8 Matrix ========== */
const BAYER8 = new Float32Array([
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
]);
for (let i = 0; i < 64; i++) BAYER8[i] /= 64.0;

/* ========== Thermal Palette LUT ========== */
const THERMAL_R = new Uint8Array(256);
const THERMAL_G = new Uint8Array(256);
const THERMAL_B = new Uint8Array(256);
(function () {
    const stops = [
        [0, 0, 0, 0], [0.15, 0, 0, 140], [0.33, 128, 0, 128],
        [0.5, 200, 0, 0], [0.67, 255, 128, 0], [0.85, 255, 255, 0], [1, 255, 255, 255]
    ];
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let a = stops[0], b = stops[stops.length - 1];
        for (let j = 0; j < stops.length - 1; j++) {
            if (t >= stops[j][0] && t <= stops[j + 1][0]) { a = stops[j]; b = stops[j + 1]; break; }
        }
        const f = a[0] === b[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
        THERMAL_R[i] = Math.round(a[1] + (b[1] - a[1]) * f);
        THERMAL_G[i] = Math.round(a[2] + (b[2] - a[2]) * f);
        THERMAL_B[i] = Math.round(a[3] + (b[3] - a[3]) * f);
    }
})();

const ASCII_CHARS = ' .,:;+*?%S#@';
const ASCII_LEN = ASCII_CHARS.length;

/* ========== Helpers ========== */
function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

/* ========== MODE DEFINITIONS ========== */
const MODES = [

/* ---- 1  DITHER (default) ---- */
{
    id: 'dither', label: 'dither', pixelated: true,
    params: [
        { id: 'pixelSize',    label: 'pixel size',    min: 0.5, max: 6,    step: 0.1,    def: 1.2,    fmt: v => v.toFixed(1) },
        { id: 'blackFloor',   label: 'black floor',   min: 0,   max: 0.15, step: 0.0005, def: 0.0035, fmt: v => v.toFixed(4) },
        { id: 'colorBoost',   label: 'color boost',   min: 0.1, max: 3,    step: 0.05,   def: 0.8,    fmt: v => v.toFixed(2) },
        { id: 'ditherSpread', label: 'dither spread',  min: 0.1, max: 2,    step: 0.05,   def: 0.5,    fmt: v => v.toFixed(2) },
        { id: 'colorLevels',  label: 'color levels',  min: 2,   max: 32,   step: 1,      def: 2,      fmt: v => String(v) },
    ],
    render(e, p) {
        const ps = p.pixelSize, w = Math.floor(e.screenW / ps), h = Math.floor(e.screenH / ps);
        e.setupCanvas(w, h, true);
        const src = e.sampleVideo(w, h).data;
        const od = e.ctx.createImageData(w, h), out = od.data;
        const bf = p.blackFloor, cb = p.colorBoost, ds = p.ditherSpread, q = p.colorLevels - 1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                let r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
                if (lum(r, g, b) < bf) { out[i] = out[i + 1] = out[i + 2] = 0; out[i + 3] = 255; continue; }
                r = Math.min(1, r * cb); g = Math.min(1, g * cb); b = Math.min(1, b * cb);
                const t = BAYER8[(y & 7) * 8 + (x & 7)] * ds;
                const sr = r * q, sg = g * q, sb = b * q;
                out[i]     = Math.round(Math.min(q, Math.max(0, (sr - sr % 1) + ((sr % 1) > t ? 1 : 0))) * 255 / q);
                out[i + 1] = Math.round(Math.min(q, Math.max(0, (sg - sg % 1) + ((sg % 1) > t ? 1 : 0))) * 255 / q);
                out[i + 2] = Math.round(Math.min(q, Math.max(0, (sb - sb % 1) + ((sb % 1) > t ? 1 : 0))) * 255 / q);
                out[i + 3] = 255;
            }
        }
        e.ctx.putImageData(od, 0, 0);
    }
},

/* ---- 2  ASCII ---- */
{
    id: 'ascii', label: 'ascii', pixelated: false,
    params: [
        { id: 'cellSize',   label: 'cell size',   min: 6,   max: 28,  step: 1,    def: 14,  fmt: v => v + 'px' },
        { id: 'brightness',  label: 'brightness',  min: 0.3, max: 3,   step: 0.05, def: 1.5, fmt: v => v.toFixed(2) },
        { id: 'colorOn',     label: 'color',       min: 0,   max: 1,   step: 1,    def: 0,   fmt: v => v > 0.5 ? 'on' : 'off' },
    ],
    render(e, p) {
        const fs = p.cellSize, cw = fs * 0.6, ch = fs;
        const cols = Math.floor(e.screenW / cw), rows = Math.floor(e.screenH / ch);
        e.setupCanvas(e.screenW, e.screenH, false);
        const src = e.sampleVideo(cols, rows).data;
        const ctx = e.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, e.screenW, e.screenH);
        ctx.font = fs + 'px "DotGothic16",monospace';
        ctx.textBaseline = 'top';
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const si = (row * cols + col) * 4;
                const r = src[si], g = src[si + 1], b = src[si + 2];
                const l = lum(r, g, b) / 255;
                const bl = Math.min(1, l * p.brightness);
                const ci = Math.min(ASCII_LEN - 1, Math.floor(bl * ASCII_LEN));
                if (ci === 0) continue;
                if (p.colorOn > 0.5) {
                    const f = l > 0.01 ? bl / l : 1;
                    ctx.fillStyle = 'rgb(' + Math.min(255, r * f | 0) + ',' + Math.min(255, g * f | 0) + ',' + Math.min(255, b * f | 0) + ')';
                } else {
                    const v = bl * 255 | 0;
                    ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
                }
                ctx.fillText(ASCII_CHARS[ci], col * cw, row * ch);
            }
        }
    }
},

/* ---- 3  HALFTONE ---- */
{
    id: 'halftone', label: 'halftone', pixelated: false,
    params: [
        { id: 'dotSpacing', label: 'dot spacing', min: 4,   max: 28,  step: 1,    def: 8,    fmt: v => v + 'px' },
        { id: 'maxRadius',  label: 'max radius',  min: 0.2, max: 1.5, step: 0.05, def: 0.85, fmt: v => v.toFixed(2) },
        { id: 'colorOn',    label: 'color',        min: 0,   max: 1,   step: 1,    def: 0,    fmt: v => v > 0.5 ? 'on' : 'off' },
    ],
    render(e, p) {
        const sp = p.dotSpacing;
        const cols = Math.floor(e.screenW / sp), rows = Math.floor(e.screenH / sp);
        e.setupCanvas(e.screenW, e.screenH, false);
        const src = e.sampleVideo(cols, rows).data;
        const ctx = e.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, e.screenW, e.screenH);
        const maxR = sp * p.maxRadius * 0.5;
        const colored = p.colorOn > 0.5;
        if (!colored) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const si = (row * cols + col) * 4;
                    const rad = lum(src[si], src[si + 1], src[si + 2]) / 255 * maxR;
                    if (rad < 0.4) continue;
                    const cx = (col + 0.5) * sp, cy = (row + 0.5) * sp;
                    ctx.moveTo(cx + rad, cy);
                    ctx.arc(cx, cy, rad, 0, 6.2832);
                }
            }
            ctx.fill();
        } else {
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const si = (row * cols + col) * 4;
                    const r = src[si], g = src[si + 1], b = src[si + 2];
                    const rad = lum(r, g, b) / 255 * maxR;
                    if (rad < 0.4) continue;
                    const cx = (col + 0.5) * sp, cy = (row + 0.5) * sp;
                    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                    ctx.beginPath();
                    ctx.arc(cx, cy, rad, 0, 6.2832);
                    ctx.fill();
                }
            }
        }
    }
},

/* ---- 4  CROSSHATCH ---- */
{
    id: 'crosshatch', label: 'crosshatch', pixelated: false,
    params: [
        { id: 'cellSize',   label: 'cell size',   min: 3,   max: 24, step: 1,   def: 8,   fmt: v => v + 'px' },
        { id: 'lineWeight', label: 'line weight',  min: 0.3, max: 4,  step: 0.1, def: 1,   fmt: v => v.toFixed(1) },
        { id: 'layers',     label: 'layers',       min: 2,   max: 6,  step: 1,   def: 4,   fmt: v => String(v) },
        { id: 'contrast',   label: 'contrast',     min: 0.5, max: 3,  step: 0.1, def: 1.5, fmt: v => v.toFixed(1) },
    ],
    render(e, p) {
        const cs = p.cellSize;
        const cols = Math.floor(e.screenW / cs), rows = Math.floor(e.screenH / cs);
        e.setupCanvas(e.screenW, e.screenH, false);
        const src = e.sampleVideo(cols, rows).data;
        const ctx = e.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, e.screenW, e.screenH);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = p.lineWeight;
        const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI / 6, 5 * Math.PI / 6];
        const ml = p.layers, half = cs * 0.55;
        ctx.beginPath();
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const si = (row * cols + col) * 4;
                const l = lum(src[si], src[si + 1], src[si + 2]) / 255;
                const n = Math.min(ml, Math.floor(Math.pow(1 - l, p.contrast) * ml + 0.5));
                if (n === 0) continue;
                const cx = (col + 0.5) * cs, cy = (row + 0.5) * cs;
                for (let k = 0; k < n; k++) {
                    const a = angles[k % angles.length];
                    const dx = Math.cos(a) * half, dy = Math.sin(a) * half;
                    ctx.moveTo(cx - dx, cy - dy);
                    ctx.lineTo(cx + dx, cy + dy);
                }
            }
        }
        ctx.stroke();
    }
},

/* ---- 5  EDGE DETECT ---- */
{
    id: 'edge', label: 'edge detect', pixelated: true,
    params: [
        { id: 'pixelSize',  label: 'pixel size',  min: 0.5, max: 4, step: 0.1, def: 1.5, fmt: v => v.toFixed(1) },
        { id: 'threshold',  label: 'threshold',   min: 0.01, max: 0.5, step: 0.01, def: 0.1, fmt: v => v.toFixed(2) },
        { id: 'brightness', label: 'brightness',  min: 0.5, max: 5,  step: 0.1, def: 2.5, fmt: v => v.toFixed(1) },
        { id: 'colorOn',    label: 'color',        min: 0, max: 1, step: 1, def: 0, fmt: v => v > 0.5 ? 'on' : 'off' },
    ],
    render(e, p) {
        const ps = p.pixelSize, w = Math.floor(e.screenW / ps), h = Math.floor(e.screenH / ps);
        e.setupCanvas(w, h, true);
        const src = e.sampleVideo(w, h).data;
        const od = e.ctx.createImageData(w, h), out = od.data;
        for (let j = 3; j < out.length; j += 4) out[j] = 255;
        const gray = new Float32Array(w * h);
        for (let j = 0; j < w * h; j++) {
            const k = j * 4;
            gray[j] = lum(src[k], src[k + 1], src[k + 2]) / 255;
        }
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const tl = gray[(y - 1) * w + x - 1], tc = gray[(y - 1) * w + x], tr = gray[(y - 1) * w + x + 1];
                const ml = gray[y * w + x - 1], mr = gray[y * w + x + 1];
                const bl = gray[(y + 1) * w + x - 1], bc = gray[(y + 1) * w + x], br = gray[(y + 1) * w + x + 1];
                const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
                const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
                const mag = Math.sqrt(gx * gx + gy * gy);
                if (mag > p.threshold) {
                    const i = (y * w + x) * 4;
                    const ev = Math.min(1, mag * p.brightness);
                    if (p.colorOn > 0.5) {
                        out[i]     = Math.min(255, src[i]     / 255 * ev * 380 | 0);
                        out[i + 1] = Math.min(255, src[i + 1] / 255 * ev * 380 | 0);
                        out[i + 2] = Math.min(255, src[i + 2] / 255 * ev * 380 | 0);
                    } else {
                        const v = ev * 255 | 0;
                        out[i] = out[i + 1] = out[i + 2] = v;
                    }
                }
            }
        }
        e.ctx.putImageData(od, 0, 0);
    }
},

/* ---- 6  PIXEL SORT ---- */
{
    id: 'pixelsort', label: 'pixel sort', pixelated: true,
    params: [
        { id: 'pixelSize',  label: 'pixel size',  min: 0.5, max: 4, step: 0.1, def: 1.5, fmt: v => v.toFixed(1) },
        { id: 'threshLow',  label: 'thresh low',  min: 0, max: 0.5, step: 0.01, def: 0.1, fmt: v => v.toFixed(2) },
        { id: 'threshHigh', label: 'thresh high',  min: 0.5, max: 1,  step: 0.01, def: 0.8, fmt: v => v.toFixed(2) },
    ],
    render(e, p) {
        const ps = p.pixelSize, w = Math.floor(e.screenW / ps), h = Math.floor(e.screenH / ps);
        e.setupCanvas(w, h, true);
        const src = e.sampleVideo(w, h).data;
        const od = e.ctx.createImageData(w, h), out = od.data;
        for (let j = 0; j < src.length; j++) out[j] = src[j];
        const tLo = p.threshLow * 255, tHi = p.threshHigh * 255;
        for (let y = 0; y < h; y++) {
            let start = -1;
            for (let x = 0; x <= w; x++) {
                const i = (y * w + x) * 4;
                const l = x < w ? lum(src[i], src[i + 1], src[i + 2]) : -1;
                if (l >= tLo && l <= tHi) {
                    if (start < 0) start = x;
                } else if (start >= 0) {
                    const len = x - start;
                    if (len > 1) {
                        const idx = [], ls = [];
                        for (let j = 0; j < len; j++) {
                            const si = (y * w + start + j) * 4;
                            idx.push(si);
                            ls.push(lum(src[si], src[si + 1], src[si + 2]));
                        }
                        const ord = Array.from({ length: len }, (_, j) => j);
                        ord.sort((a, b) => ls[a] - ls[b]);
                        for (let j = 0; j < len; j++) {
                            const oi = (y * w + start + j) * 4, si = idx[ord[j]];
                            out[oi] = src[si]; out[oi + 1] = src[si + 1]; out[oi + 2] = src[si + 2]; out[oi + 3] = 255;
                        }
                    }
                    start = -1;
                }
            }
        }
        e.ctx.putImageData(od, 0, 0);
    }
},

/* ---- 7  CHROMATIC GLITCH ---- */
{
    id: 'glitch', label: 'glitch', pixelated: true,
    params: [
        { id: 'pixelSize',  label: 'pixel size',  min: 0.5, max: 4,  step: 0.1,  def: 1.5, fmt: v => v.toFixed(1) },
        { id: 'rgbOffset',  label: 'rgb offset',  min: 0,   max: 30, step: 1,    def: 8,   fmt: v => v + 'px' },
        { id: 'rowShift',   label: 'row shift',   min: 0,   max: 60, step: 1,    def: 15,  fmt: v => v + 'px' },
        { id: 'noise',      label: 'noise',        min: 0,   max: 0.3, step: 0.005, def: 0.05, fmt: v => v.toFixed(3) },
        { id: 'glitchRate', label: 'glitch rate',  min: 0.5, max: 12, step: 0.5,  def: 3,   fmt: v => v.toFixed(1) },
    ],
    render(e, p) {
        const ps = p.pixelSize, w = Math.floor(e.screenW / ps), h = Math.floor(e.screenH / ps);
        e.setupCanvas(w, h, true);
        const src = e.sampleVideo(w, h).data;
        const od = e.ctx.createImageData(w, h), out = od.data;
        const off = Math.max(1, Math.round(p.rgbOffset / ps));
        const shift = Math.round(p.rowShift / ps);
        const time = performance.now() / 1000;
        const tSeed = Math.floor(time * p.glitchRate);
        for (let y = 0; y < h; y++) {
            const rs = Math.sin(y * 12.9898 + tSeed * 78.233);
            const rr = rs - Math.floor(rs);
            const rowOff = rr > 0.82 ? Math.round((rr - 0.82) / 0.18 * shift * (rs > 0 ? 1 : -1)) : 0;
            for (let x = 0; x < w; x++) {
                const oi = (y * w + x) * 4;
                const sx = x + rowOff;
                const rx = Math.max(0, Math.min(w - 1, sx - off));
                const gx = Math.max(0, Math.min(w - 1, sx));
                const bx = Math.max(0, Math.min(w - 1, sx + off));
                out[oi]     = src[(y * w + rx) * 4];
                out[oi + 1] = src[(y * w + gx) * 4 + 1];
                out[oi + 2] = src[(y * w + bx) * 4 + 2];
                out[oi + 3] = 255;
                const ns = Math.sin(x * 127.1 + y * 311.7 + tSeed * 43.7);
                if ((ns - Math.floor(ns)) < p.noise) {
                    const nv = Math.abs((ns * 43758.5453 % 1) * 255) | 0;
                    out[oi] = out[oi + 1] = out[oi + 2] = nv;
                }
            }
        }
        e.ctx.putImageData(od, 0, 0);
    }
},

/* ---- 8  THERMAL ---- */
{
    id: 'thermal', label: 'thermal', pixelated: true,
    params: [
        { id: 'pixelSize',  label: 'pixel size',  min: 0.5, max: 4, step: 0.1, def: 1.5, fmt: v => v.toFixed(1) },
        { id: 'brightness', label: 'brightness',  min: 0.3, max: 2.5, step: 0.05, def: 1, fmt: v => v.toFixed(2) },
        { id: 'contrast',   label: 'contrast',    min: 0.5, max: 3, step: 0.1, def: 1.2, fmt: v => v.toFixed(1) },
    ],
    render(e, p) {
        const ps = p.pixelSize, w = Math.floor(e.screenW / ps), h = Math.floor(e.screenH / ps);
        e.setupCanvas(w, h, true);
        const src = e.sampleVideo(w, h).data;
        const od = e.ctx.createImageData(w, h), out = od.data;
        for (let j = 0; j < w * h; j++) {
            const k = j * 4;
            let l = lum(src[k], src[k + 1], src[k + 2]) / 255;
            l = ((l - 0.5) * p.contrast + 0.5) * p.brightness;
            const idx = Math.max(0, Math.min(255, l * 255 | 0));
            out[k] = THERMAL_R[idx]; out[k + 1] = THERMAL_G[idx]; out[k + 2] = THERMAL_B[idx]; out[k + 3] = 255;
        }
        e.ctx.putImageData(od, 0, 0);
    }
},

/* ---- 9  DISSOLVE ---- */
{
    id: 'dissolve', label: 'dissolve', pixelated: true,
    params: [
        { id: 'pixelSize',  label: 'pixel size',  min: 0.5, max: 4, step: 0.1, def: 1.5, fmt: v => v.toFixed(1) },
        { id: 'strength',   label: 'strength',    min: 0, max: 80, step: 1, def: 20, fmt: v => String(v) },
        { id: 'threshold',  label: 'threshold',   min: 0, max: 0.5, step: 0.01, def: 0.12, fmt: v => v.toFixed(2) },
        { id: 'drift',      label: 'drift speed',  min: 0.2, max: 6, step: 0.2, def: 2, fmt: v => v.toFixed(1) },
    ],
    render(e, p) {
        const ps = p.pixelSize, w = Math.floor(e.screenW / ps), h = Math.floor(e.screenH / ps);
        e.setupCanvas(w, h, true);
        const src = e.sampleVideo(w, h).data;
        const od = e.ctx.createImageData(w, h), out = od.data;
        for (let j = 3; j < out.length; j += 4) out[j] = 255;
        const time = performance.now() / 1000;
        const t1 = time * p.drift, t2 = time * p.drift * 0.6;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const si = (y * w + x) * 4;
                const l = lum(src[si], src[si + 1], src[si + 2]) / 255;
                const excess = Math.max(0, l - p.threshold);

                /* large-scale flow (two octaves for irregular blobs) */
                const a1 = Math.sin(x * 0.017 + y * 0.013 + t1)
                         + Math.sin(x * 0.009 - y * 0.021 + t2 * 1.3) * 0.7;
                const a2 = Math.cos(x * 0.015 - y * 0.025 + t1 * 0.8)
                         + Math.cos(y * 0.011 + x * 0.019 + t2) * 0.6;

                /* high-freq jitter so edges feel organic, not circular */
                const jx = Math.sin(x * 0.14 + y * 0.11 + t1 * 2.1) * 0.35;
                const jy = Math.cos(x * 0.12 - y * 0.16 + t2 * 1.7) * 0.35;

                /* per-pixel hash so nearby pixels scatter unevenly */
                const h1 = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
                const pxVar = (h1 - Math.floor(h1)) * 0.5 + 0.75;

                const angle = Math.atan2(a1 + jy, a2 + jx);
                const dist = excess * p.strength * pxVar;
                const dx = Math.round(x + Math.cos(angle) * dist);
                const dy = Math.round(y + Math.sin(angle) * dist);
                if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
                    const di = (dy * w + dx) * 4;
                    out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2];
                }
            }
        }
        e.ctx.putImageData(od, 0, 0);
    }
}

]; /* end MODES */


/* ========== ENGINE ========== */

window.initDitherEngine = function (canvasId, videoId) {
    const canvas = document.getElementById(canvasId);
    const ctx    = canvas.getContext('2d', { willReadFrequently: true });
    const video  = document.getElementById(videoId);
    const sampler    = document.createElement('canvas');
    const samplerCtx = sampler.getContext('2d', { willReadFrequently: true });

    let screenW = window.innerWidth, screenH = window.innerHeight;
    let canvasW = 0, canvasH = 0, curPixelated = null;
    let currentMode = MODES[0];
    let params = {};
    let speed = 2;

    function initParams(mode) {
        const p = {};
        mode.params.forEach(d => { p[d.id] = d.def; });
        return p;
    }
    params = initParams(currentMode);

    function setupCanvas(w, h, pixelated) {
        if (canvasW !== w || canvasH !== h) {
            canvas.width = w; canvas.height = h;
            canvas.style.width  = screenW + 'px';
            canvas.style.height = screenH + 'px';
            canvasW = w; canvasH = h;
        }
        if (curPixelated !== pixelated) {
            canvas.style.imageRendering = pixelated ? 'pixelated' : 'auto';
            curPixelated = pixelated;
        }
    }

    function sampleVideo(w, h) {
        if (sampler.width !== w || sampler.height !== h) {
            sampler.width = w; sampler.height = h;
        }
        const va = video.videoWidth / video.videoHeight;
        const ca = w / h;
        let dw, dh, dx, dy;
        if (va > ca) { dh = h; dw = h * va; dx = (w - dw) / 2; dy = 0; }
        else         { dw = w; dh = w / va;  dx = 0; dy = (h - dh) / 2; }
        samplerCtx.fillStyle = '#000';
        samplerCtx.fillRect(0, 0, w, h);
        samplerCtx.drawImage(video, dx, dy, dw, dh);
        return samplerCtx.getImageData(0, 0, w, h);
    }

    const engine = { canvas, ctx, video, screenW, screenH, setupCanvas, sampleVideo };

    /* ---- Mix state ---- */
    const BLEND_NAMES = ['mix', 'add', 'multiply', 'screen', 'overlay'];
    const BLEND_CSS   = ['source-over', 'lighter', 'multiply', 'screen', 'overlay'];
    let mixEnabled = false;
    let mixModeRef = MODES[0];
    let mixParams  = initParams(mixModeRef);
    let blendAmount = 0.5;
    let blendIdx = 0;

    const offA    = document.createElement('canvas');
    const offACtx = offA.getContext('2d', { willReadFrequently: true });
    const offB    = document.createElement('canvas');
    const offBCtx = offB.getContext('2d', { willReadFrequently: true });

    function renderToOff(mode, p, oc, ocCtx) {
        const tmp = {
            canvas: oc, ctx: ocCtx, video: video,
            screenW: screenW, screenH: screenH,
            setupCanvas: function (w, h) {
                if (oc.width !== w || oc.height !== h) { oc.width = w; oc.height = h; }
            },
            sampleVideo: sampleVideo
        };
        mode.render(tmp, p);
    }

    /* ---- Mode selector ---- */
    const modeSelect = document.getElementById('mode-select');
    MODES.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = m.label;
        modeSelect.appendChild(opt);
    });
    modeSelect.addEventListener('change', () => {
        currentMode = MODES[parseInt(modeSelect.value)];
        params = initParams(currentMode);
        canvasW = canvasH = 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        buildTunerSliders();
    });

    /* ---- Tuner panel ---- */
    const tunerToggle = document.getElementById('tuner-toggle');
    const tunerPanel  = document.getElementById('tuner-panel');
    const tunerSlots  = document.getElementById('tuner-mode-params');
    const speedSlider = document.getElementById('dt-speed');
    const speedLabel  = document.getElementById('dt-speed-val');

    tunerToggle.addEventListener('click', () => tunerPanel.classList.toggle('open'));

    speedSlider.addEventListener('input', () => {
        speed = parseFloat(speedSlider.value);
        video.playbackRate = speed;
        speedLabel.textContent = speed.toFixed(2) + 'x';
    });

    function buildTunerSliders() {
        tunerSlots.innerHTML = '';
        currentMode.params.forEach(def => {
            const row = document.createElement('div');
            row.className = 'dt-row';

            const label = document.createElement('div');
            label.className = 'dt-label';
            const nameEl = document.createElement('span');
            nameEl.textContent = def.label;
            const valEl = document.createElement('span');
            valEl.className = 'dt-val';
            valEl.textContent = def.fmt(params[def.id]);
            label.appendChild(nameEl);
            label.appendChild(valEl);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = def.min; slider.max = def.max;
            slider.step = def.step; slider.value = params[def.id];
            slider.addEventListener('input', () => {
                params[def.id] = parseFloat(slider.value);
                if (def.step >= 1 && Number.isInteger(def.step)) params[def.id] = Math.round(params[def.id]);
                valEl.textContent = def.fmt(params[def.id]);
            });

            row.appendChild(label);
            row.appendChild(slider);
            tunerSlots.appendChild(row);
        });
    }
    buildTunerSliders();

    /* ---- Mix controls ---- */
    const mixToggleSlider = document.getElementById('mix-toggle');
    const mixStatusVal    = document.getElementById('mix-status-val');
    const mixControlsDiv  = document.getElementById('mix-controls');
    const mixModeSelect   = document.getElementById('mix-mode-select');
    const mixAmountSlider = document.getElementById('mix-amount');
    const mixAmountLabel  = document.getElementById('mix-amount-val');
    const mixBlendSlider  = document.getElementById('mix-blend');
    const mixBlendLabel   = document.getElementById('mix-blend-val');
    const mixParamsSlots  = document.getElementById('mix-mode-params');

    MODES.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = m.label;
        mixModeSelect.appendChild(opt);
    });

    mixToggleSlider.addEventListener('input', () => {
        mixEnabled = parseInt(mixToggleSlider.value) > 0;
        mixStatusVal.textContent = mixEnabled ? 'on' : 'off';
        mixControlsDiv.style.display = mixEnabled ? 'block' : 'none';
        canvasW = canvasH = 0;
    });

    mixModeSelect.addEventListener('change', () => {
        mixModeRef = MODES[parseInt(mixModeSelect.value)];
        mixParams = initParams(mixModeRef);
        buildMixSliders();
    });

    mixAmountSlider.addEventListener('input', () => {
        blendAmount = parseFloat(mixAmountSlider.value);
        mixAmountLabel.textContent = blendAmount.toFixed(2);
    });

    mixBlendSlider.addEventListener('input', () => {
        blendIdx = parseInt(mixBlendSlider.value);
        mixBlendLabel.textContent = BLEND_NAMES[blendIdx];
    });

    function buildMixSliders() {
        mixParamsSlots.innerHTML = '';
        mixModeRef.params.forEach(def => {
            const row = document.createElement('div');
            row.className = 'dt-row';
            const label = document.createElement('div');
            label.className = 'dt-label';
            const nameEl = document.createElement('span');
            nameEl.textContent = def.label;
            const valEl = document.createElement('span');
            valEl.className = 'dt-val';
            valEl.textContent = def.fmt(mixParams[def.id]);
            label.appendChild(nameEl);
            label.appendChild(valEl);
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = def.min; slider.max = def.max;
            slider.step = def.step; slider.value = mixParams[def.id];
            slider.addEventListener('input', () => {
                mixParams[def.id] = parseFloat(slider.value);
                if (def.step >= 1 && Number.isInteger(def.step)) mixParams[def.id] = Math.round(mixParams[def.id]);
                valEl.textContent = def.fmt(mixParams[def.id]);
            });
            row.appendChild(label);
            row.appendChild(slider);
            mixParamsSlots.appendChild(row);
        });
    }
    buildMixSliders();

    /* ---- Reset ---- */
    document.getElementById('dt-reset').addEventListener('click', () => {
        params = initParams(currentMode);
        speed = 2; video.playbackRate = speed;
        speedSlider.value = speed;
        speedLabel.textContent = speed.toFixed(2) + 'x';
        buildTunerSliders();
        mixEnabled = false;
        mixToggleSlider.value = 0;
        mixStatusVal.textContent = 'off';
        mixControlsDiv.style.display = 'none';
        blendAmount = 0.5; blendIdx = 0;
        mixAmountSlider.value = 0.5;
        mixAmountLabel.textContent = '0.50';
        mixBlendSlider.value = 0;
        mixBlendLabel.textContent = 'mix';
        mixModeRef = MODES[0];
        mixModeSelect.value = 0;
        mixParams = initParams(mixModeRef);
        buildMixSliders();
        canvasW = canvasH = 0;
    });

    /* ---- Copy config ---- */
    document.getElementById('dt-copy').addEventListener('click', () => {
        let cfg = '// Mode: ' + currentMode.label;
        if (mixEnabled) cfg += ' + ' + mixModeRef.label + ' (' + BLEND_NAMES[blendIdx] + ' ' + blendAmount.toFixed(2) + ')';
        cfg += '\n';
        cfg += 'const PLAYBACK_SPEED = ' + speed.toFixed(2) + ';\n';
        currentMode.params.forEach(def => {
            const v = params[def.id];
            const name = def.id.replace(/([A-Z])/g, '_$1').toUpperCase();
            cfg += 'const ' + name + ' = ' + (Number.isInteger(v) ? v : v.toFixed(4)) + ';\n';
        });
        if (mixEnabled) {
            cfg += '\n// Layer: ' + mixModeRef.label + '\n';
            cfg += 'const BLEND_AMOUNT = ' + blendAmount.toFixed(2) + ';\n';
            cfg += 'const BLEND_MODE = "' + BLEND_NAMES[blendIdx] + '";\n';
            mixModeRef.params.forEach(def => {
                const v = mixParams[def.id];
                const name = 'LAYER_' + def.id.replace(/([A-Z])/g, '_$1').toUpperCase();
                cfg += 'const ' + name + ' = ' + (Number.isInteger(v) ? v : v.toFixed(4)) + ';\n';
            });
        }
        navigator.clipboard.writeText(cfg).then(() => {
            const msg = document.getElementById('dt-copied');
            msg.classList.add('show');
            setTimeout(() => msg.classList.remove('show'), 1600);
        });
    });

    /* ---- Render loop ---- */
    function frame() {
        requestAnimationFrame(frame);
        if (video.readyState < 2) return;
        engine.screenW = screenW;
        engine.screenH = screenH;

        if (!mixEnabled) {
            currentMode.render(engine, params);
        } else {
            renderToOff(currentMode, params, offA, offACtx);
            renderToOff(mixModeRef, mixParams, offB, offBCtx);

            setupCanvas(screenW, screenH, false);
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, screenW, screenH);

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(offA, 0, 0, screenW, screenH);

            ctx.globalAlpha = blendAmount;
            ctx.globalCompositeOperation = BLEND_CSS[blendIdx];
            ctx.drawImage(offB, 0, 0, screenW, screenH);

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    /* ---- Resize ---- */
    window.addEventListener('resize', () => {
        screenW = window.innerWidth;
        screenH = window.innerHeight;
        canvasW = canvasH = 0;
    });

    /* ---- Start video ---- */
    video.playbackRate = speed;
    video.play().then(() => {
        requestAnimationFrame(frame);
    }).catch(() => {
        document.addEventListener('click',      () => { video.play(); requestAnimationFrame(frame); }, { once: true });
        document.addEventListener('touchstart',  () => { video.play(); requestAnimationFrame(frame); }, { once: true });
    });

    /* ---- Hide UI in iframe ---- */
    if (window !== window.top) {
        const btn = document.getElementById('back-btn');
        if (btn) btn.style.display = 'none';
        tunerToggle.style.display = 'none';
        modeSelect.style.display = 'none';
    }
};

})();
