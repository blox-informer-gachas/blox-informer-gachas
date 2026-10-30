// Overview map (top-right of the View)
const MINIMAP_MAX_W = 190,
    MINIMAP_MAX_H = 130;
const MINIMAP_EASE_MS = 90;
let minimapDrag = false;
let minimapGoal = null,
    minimapRaf = 0,
    minimapLast = 0;

// Clicking or dragging on the minimap sets a goal
function minimapFollow(now) {
    minimapRaf = 0;
    const lmap = cam.lmap;
    const dt = Math.min(50, now - minimapLast);
    minimapLast = now;
    const goal = lmap.project(minimapGoal),
        cur = lmap.project(lmap.getCenter());
    const rest = goal.subtract(cur);
    if (Math.abs(rest.x) < 0.5 && Math.abs(rest.y) < 0.5) return;
    const step = rest.multiplyBy(1 - Math.exp(-dt / MINIMAP_EASE_MS));
    const sx = Math.abs(step.x) < 1 ? Math.sign(rest.x) * Math.min(1, Math.abs(rest.x)) : step.x;
    const sy = Math.abs(step.y) < 1 ? Math.sign(rest.y) * Math.min(1, Math.abs(rest.y)) : step.y;
    lmap.panBy([sx, sy], { animate: false, noMoveStart: true });
    minimapRaf = requestAnimationFrame(minimapFollow);
}

function initMinimap() {
    const box = byId('view-minimap');
    const lmap = cam.lmap;
    lmap.on('move zoom moveend', updateMinimapBox);
    lmap.on('dragstart zoomstart', () => {
        if (minimapRaf && !minimapDrag) {
            cancelAnimationFrame(minimapRaf);
            minimapRaf = 0;
        }
    });
    const moveTo = (e) => {
        const r = box.getBoundingClientRect();
        const layer = activeLayer();
        if (!layer) return;
        const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * layer.backgroundWidth;
        const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * layer.backgroundHeight;
        minimapGoal = toLatLng(x, y);
        if (!minimapRaf) {
            lmap.stop();
            minimapLast = performance.now();
            minimapRaf = requestAnimationFrame(minimapFollow);
        }
    };
    box.addEventListener('pointerdown', (e) => {
        minimapDrag = true;
        box.setPointerCapture(e.pointerId);
        moveTo(e);
        e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
        if (minimapDrag) moveTo(e);
    });
    box.addEventListener('pointerup', () => {
        minimapDrag = false;
    });
    box.addEventListener('pointercancel', () => {
        minimapDrag = false;
    });
    box.addEventListener('wheel', (e) => e.stopPropagation());
}

function updateMinimapLayer(layer) {
    const box = byId('view-minimap'),
        img = byId('view-minimap-img');
    const k = Math.min(MINIMAP_MAX_W / layer.backgroundWidth, MINIMAP_MAX_H / layer.backgroundHeight);
    box.style.width = Math.round(layer.backgroundWidth * k) + 'px';
    box.style.height = Math.round(layer.backgroundHeight * k) + 'px';
    if (layer.backgroundUrl) {
        img.src = layer.backgroundUrl;
        img.classList.remove('hidden');
    } else {
        img.removeAttribute('src');
        img.classList.add('hidden');
    }
    updateMinimapBox();
}

function updateMinimapBox() {
    const layer = activeLayer();
    const box = byId('view-minimap');
    if (!layer || !cam) return;
    const b = cam.lmap.getBounds();
    const w = layer.backgroundWidth,
        h = layer.backgroundHeight;
    const left = Math.max(0, b.getWest()),
        right = Math.min(w, b.getEast());
    const top = Math.max(0, -b.getNorth()),
        bottom = Math.min(h, -b.getSouth());
    const zoomedIn = cam.lmap.getZoom() > cam.fitZoom + 0.3;
    box.classList.toggle('hidden', !zoomedIn);
    const vp = byId('view-minimap-box');
    vp.style.left = (left / w) * 100 + '%';
    vp.style.top = (top / h) * 100 + '%';
    vp.style.width = (Math.max(0, right - left) / w) * 100 + '%';
    vp.style.height = (Math.max(0, bottom - top) / h) * 100 + '%';
}
