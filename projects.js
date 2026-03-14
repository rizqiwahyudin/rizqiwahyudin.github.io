/**
 * Project data — edit this array to add/remove/reorder cards.
 */
const projects = [
    {
        type: "sim",
        title: "black hole",
        subtitle: "ASCII gravitational lensing simulation",
        desc: "",
        classification: "webgl // glsl",
        sim: "blackhole.html",
        tags: ["three.js", "raymarching", "shaders"]
    },
    {
        type: "sim",
        title: "milky way",
        subtitle: "ASCII volumetric galaxy simulation",
        desc: "",
        classification: "webgl // glsl",
        sim: "milkyway.html",
        tags: ["three.js", "volumetric", "shaders"]
    },
    {
        type: "sim",
        title: "memento mori",
        subtitle: "don't forget to live :)",
        desc: "",
        classification: "canvas // dither",
        sim: "nebula.html",
        tags: ["canvas 2d", "bayer dither", "video"]
    },
    {
        type: "sim",
        title: "vanitas",
        subtitle: "all is fleeting",
        desc: "",
        classification: "canvas // dither",
        sim: "vanitas.html?mode=dissolve&pixelSize=1.8&strength=40&threshold=0.2&drift=2&speed=2&mixMode=thermal&blendAmount=0.45&blendMode=multiply&mix_pixelSize=1.5&mix_brightness=1&mix_contrast=1.2",
        tags: ["canvas 2d", "bayer dither", "video"]
    },
    {
        type: "sim",
        title: "strange attractor",
        subtitle: "chaos made visible",
        desc: "",
        classification: "canvas // ascii",
        sim: "attractor.html",
        tags: ["canvas 2d", "lorenz system", "dynamical systems"]
    },
    {
        type: "sim",
        title: "reaction diffusion",
        subtitle: "patterns from noise",
        desc: "",
        classification: "canvas // gray-scott",
        sim: "reaction-diffusion.html",
        tags: ["canvas 2d", "gray-scott", "turing patterns"]
    },
    {
        type: "sim",
        title: "n-body",
        subtitle: "gravity at scale",
        desc: "",
        classification: "canvas // physics",
        sim: "n-body.html",
        tags: ["canvas 2d", "gravity", "orbital mechanics"]
    },
    {
        type: "sim",
        title: "fourier",
        subtitle: "circles all the way down",
        desc: "",
        classification: "canvas // mathematics",
        sim: "fourier.html",
        tags: ["canvas 2d", "fourier series", "epicycles"]
    },
    {
        type: "sim",
        title: "city",
        subtitle: "point cloud city",
        desc: "",
        classification: "webgl // point cloud",
        sim: "city.html",
        tags: ["three.js", "point cloud", "procedural"]
    },
    {
        type: "sim",
        title: "citywatch",
        subtitle: "real-time navigation // riga",
        desc: "",
        classification: "webgl // navigation",
        sim: "citywatch.html",
        tags: ["three.js", "osm", "gps", "real-time"]
    }
];

function renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    return '<div class="card-tags">' + tags.map(t => '<span class="card-tag">' + t + '</span>').join('') + '</div>';
}

/* ========== Carousel ========== */

let currentIdx = 0;

function renderCards() {
    const track = document.getElementById('project-grid');
    const dots  = document.getElementById('carousel-dots');
    if (!track) return;

    track.innerHTML = '';
    dots.innerHTML = '';

    projects.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'card card-sim';
        card.dataset.project = p.title.replace(/\s+/g, '-').toLowerCase();

        const num = String(i + 1).padStart(3, '0');

        card.innerHTML =
            '<iframe data-src="' + p.sim + '" loading="lazy" title="' + p.title + '" allow="accelerometer; autoplay"></iframe>' +
            '<a class="sim-fullscreen" href="' + p.sim + '" target="_blank">\u2197 open</a>' +
            (p.classification ? '<span class="card-badge">' + p.classification + '</span>' : '') +
            '<div class="card-body"><div class="card-body-inner">' +
                '<div class="card-num">' + num + ' //</div>' +
                '<div class="card-title">' + p.title + '</div>' +
                '<div class="card-subtitle">' + p.subtitle + '</div>' +
                (p.desc ? '<div class="card-desc">' + p.desc + '</div>' : '') +
                renderTags(p.tags) +
            '</div></div>';

        track.appendChild(card);

        const dot = document.createElement('button');
        dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => goTo(i));
        dots.appendChild(dot);
    });

    updateIframes();
}

function goTo(idx) {
    const total = projects.length;
    currentIdx = Math.max(0, Math.min(total - 1, idx));
    const track = document.getElementById('project-grid');
    track.style.transition = 'transform 0.4s ease';
    track.style.transform = 'translateX(-' + (currentIdx * 100) + '%)';
    updateDots();
    updateIframes();
}

function updateDots() {
    document.querySelectorAll('.carousel-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentIdx);
    });
}

function updateIframes() {
    const cards = document.querySelectorAll('#project-grid .card-sim');
    cards.forEach((card, i) => {
        const iframe = card.querySelector('iframe');
        const dist = Math.abs(i - currentIdx);
        const wantSrc = projects[i].sim;
        if (dist <= 1) {
            if (iframe.getAttribute('src') !== wantSrc) {
                iframe.src = wantSrc;
            }
        } else {
            if (iframe.getAttribute('src') && iframe.getAttribute('src') !== 'about:blank') {
                iframe.src = 'about:blank';
            }
        }
    });
}

/* ---- Nav buttons ---- */
function initNavButtons() {
    const prev = document.querySelector('.carousel-prev');
    const next = document.querySelector('.carousel-next');
    if (prev) prev.addEventListener('click', () => goTo(currentIdx - 1));
    if (next) next.addEventListener('click', () => goTo(currentIdx + 1));
}

/* ---- Touch swipe ---- */
function initSwipe() {
    const track = document.getElementById('project-grid');
    const carousel = track.parentElement;
    let startX = 0, deltaX = 0, swiping = false;

    track.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        deltaX = 0;
        swiping = true;
        track.style.transition = 'none';
    }, { passive: true });

    track.addEventListener('touchmove', e => {
        if (!swiping) return;
        deltaX = e.touches[0].clientX - startX;
        const pct = (deltaX / carousel.offsetWidth) * 100;
        track.style.transform = 'translateX(' + (-currentIdx * 100 + pct) + '%)';
    }, { passive: true });

    track.addEventListener('touchend', () => {
        if (!swiping) return;
        swiping = false;
        const threshold = carousel.offsetWidth * 0.15;
        if (deltaX > threshold && currentIdx > 0) {
            goTo(currentIdx - 1);
        } else if (deltaX < -threshold && currentIdx < projects.length - 1) {
            goTo(currentIdx + 1);
        } else {
            goTo(currentIdx);
        }
    });
}

/* ---- Keyboard ---- */
function initKeyboard() {
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft')  goTo(currentIdx - 1);
        if (e.key === 'ArrowRight') goTo(currentIdx + 1);
    });
}

/* ========== Typewriter Footer ========== */

function typewriter() {
    const el = document.getElementById('typewriter-text');
    if (!el) return;

    const segments = ['end_of_file', ' // ', 'no_further_data'];

    function swingDelay(progress) {
        const speed = 1 - Math.sin(progress * Math.PI);
        return 35 + speed * 90 + Math.random() * 20;
    }

    let phase = 'typing';
    let segIdx = 0;
    let charIdx = 0;
    let printed = '';
    let selCount = 0;

    const cursor = document.querySelector('.footer-cursor');

    function render() {
        if (selCount > 0 && printed.length > 0) {
            const normal = printed.slice(0, printed.length - selCount);
            const selected = printed.slice(printed.length - selCount);
            el.innerHTML = escapeHtml(normal) + '<span class="footer-sel">' + escapeHtml(selected) + '</span>';
        } else {
            el.textContent = printed;
        }
    }

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function tick() {
        if (phase === 'typing') {
            const seg = segments[segIdx];
            if (charIdx < seg.length) {
                printed += seg[charIdx];
                render();
                charIdx++;
                setTimeout(tick, swingDelay(charIdx / seg.length));
            } else {
                charIdx = 0;
                segIdx++;
                if (segIdx < segments.length) {
                    setTimeout(tick, segments[segIdx] === ' // ' ? 300 : 600);
                } else {
                    setTimeout(() => {
                        phase = 'selecting';
                        selCount = 0;
                        cursor.classList.add('selecting');
                        tick();
                    }, 1800);
                }
            }
        } else if (phase === 'selecting') {
            selCount = printed.length;
            render();
            phase = 'clearing';
            setTimeout(tick, 500);
        } else {
            printed = '';
            selCount = 0;
            el.textContent = '';
            cursor.classList.remove('selecting');
            phase = 'typing';
            segIdx = 0;
            charIdx = 0;
            setTimeout(tick, 1000);
        }
    }

    setTimeout(tick, 1200);
}

/* ========== Init ========== */

document.addEventListener('DOMContentLoaded', () => {
    renderCards();
    initNavButtons();
    initSwipe();
    initKeyboard();
    typewriter();
});
