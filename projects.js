/**
 * Project data — edit this array to add/remove/reorder cards.
 * 
 * type: "sim" for live ASCII simulation
 * sim: path to simulation HTML
 * classification: displayed in the badge area
 */
const projects = [
    {
        type: "sim",
        title: "black hole",
        subtitle: "gravitational lensing simulation",
        desc: "",
        classification: "webgl // glsl",
        sim: "blackhole.html",
        tags: ["three.js", "raymarching", "shaders"]
    },
    {
        type: "sim",
        title: "milky way",
        subtitle: "volumetric galaxy simulation",
        desc: "",
        classification: "webgl // glsl",
        sim: "milkyway.html",
        tags: ["three.js", "volumetric", "shaders"]
    }
];

/**
 * Render all project cards into the grid.
 */
function renderCards() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    grid.innerHTML = '';

    projects.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'card card-sim';
        card.dataset.project = p.title.replace(/\s+/g, '-').toLowerCase();

        const num = String(i + 1).padStart(3, '0');

        card.innerHTML = `
            <iframe src="${p.sim}" loading="lazy" title="${p.title}" allow="accelerometer"></iframe>
            <a class="sim-fullscreen" href="${p.sim}" target="_blank">↗ open</a>
            <span class="sim-interact-hint">press, click, drag!</span>
            ${p.classification ? `<span class="card-badge">${p.classification}</span>` : ''}
            <div class="card-body">
                <div class="card-body-inner">
                    <div class="card-num">${num} //</div>
                    <div class="card-title">${p.title}</div>
                    <div class="card-subtitle">${p.subtitle}</div>
                    ${p.desc ? `<div class="card-desc">${p.desc}</div>` : ''}
                    ${renderTags(p.tags)}
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
}

function renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    return `<div class="card-tags">${tags.map(t => `<span class="card-tag">${t}</span>`).join('')}</div>`;
}

// ===== Typewriter Footer =====
function typewriter() {
    const el = document.getElementById('typewriter-text');
    if (!el) return;

    // Segments: type each phrase with a swing, pause between them
    const segments = ['end_of_file', ' // ', 'no_further_data'];
    const fullText = segments.join('');

    // Swing easing: slow → fast → slow across a segment
    function swingDelay(progress) {
        // progress 0→1 within a segment
        // U-shaped speed: fast in middle, slow at edges
        const speed = 1 - Math.sin(progress * Math.PI); // 0 at middle, 1 at edges
        return 35 + speed * 90 + Math.random() * 20;
    }

    let phase = 'typing'; // 'typing' | 'selecting' | 'clearing'
    let segIdx = 0;       // current segment
    let charIdx = 0;      // char within current segment
    let printed = '';      // total printed so far
    let selCount = 0;      // how many chars are selected (from right)

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

                const progress = charIdx / seg.length;
                setTimeout(tick, swingDelay(progress));
            } else {
                // Segment done — move to next or finish
                charIdx = 0;
                segIdx++;

                if (segIdx < segments.length) {
                    // Pause between segments
                    const pause = segments[segIdx] === ' // ' ? 300 : 600;
                    setTimeout(tick, pause);
                } else {
                    // All typed — pause then start selecting
                    setTimeout(() => {
                        phase = 'selecting';
                        selCount = 0;
                        cursor.classList.add('selecting');
                        tick();
                    }, 1800);
                }
            }
        } else if (phase === 'selecting') {
            // Instant select-all, like Ctrl+A
            selCount = printed.length;
            render();
            phase = 'clearing';
            setTimeout(tick, 500);
        } else {
            // Clearing — delete all at once, reset
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

    setTimeout(tick, 1200); // Initial delay
}

// Render on load
document.addEventListener('DOMContentLoaded', () => {
    renderCards();
    typewriter();
});
