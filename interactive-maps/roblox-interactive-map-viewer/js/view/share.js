// Links, embeds and reports
function viewUrl(params) {
    const url = new URL(window.location.href);
    ['layer', 'marker', 'embed', 'route'].forEach((k) => url.searchParams.delete(k));
    if (activeRouteId) url.searchParams.set('route', activeRouteId);
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v) url.searchParams.set(k, v);
    });
    return url.toString();
}

function syncUrlToElement(elId) {
    const embed = isEmbedMode() ? '1' : '';
    const layer = activeLayerId !== (map.defaultLayerId || map.layers[0].id) ? activeLayerId : '';
    history.replaceState(null, '', viewUrl({ layer, marker: elId || '', embed }));
}

function copyText(text, okMsg) {
    const done = () => showToast(okMsg, 'fa-link');
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
}

function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        done();
    } catch (e) {
        showToast('Copy failed. Copy the address bar instead', 'fa-triangle-exclamation');
    }
    ta.remove();
}

function copyElementLink(elId) {
    const hit = findElement(elId);
    if (!hit) return;
    const layer = hit.layer.id !== (map.defaultLayerId || map.layers[0].id) ? hit.layer.id : '';
    copyText(viewUrl({ layer, marker: elId }), 'Link copied');
}

function initialLayerFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const markerId = params.get('marker');
    const hit = markerId ? findElement(markerId) : null;
    if (hit) return hit.layer.id;
    const layerId = params.get('layer');
    if (layerId && map.layers.some((l) => l.id === layerId)) return layerId;
    return map.defaultLayerId || map.layers[0].id;
}

function openDeepLinkedElement(markerId) {
    if (markerId && findElement(markerId)) setTimeout(() => goToElement(markerId), 150);
}

// Embed

function isEmbedMode() {
    return new URLSearchParams(window.location.search).get('embed') === '1';
}

function initEmbedMode() {
    if (!isEmbedMode()) return;
    document.body.classList.add('embed');
    // GitHub build: links would send people to GitHub instead of the site
    if (document.body.classList.contains('static')) return;
    const link = byId('embed-open-full');
    link.href = viewUrl({});
    link.classList.remove('hidden');
}

// Embedded in someone's article, the map mustn't trap the page
function initEmbedGestureGuard() {
    // the GitHub build's maps fill their iframe: the wheel zooms them, like the older maps
    if (!isEmbedMode() || document.body.classList.contains('static')) return;
    const lmap = cam.lmap,
        el = lmap.getContainer(),
        hint = byId('gesture-hint');
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
    let timer = 0,
        touchStart = null;
    const show = (text) => {
        hint.textContent = text;
        hint.classList.add('show');
        clearTimeout(timer);
        timer = setTimeout(() => hint.classList.remove('show'), 1300);
    };
    lmap.wheelGuard = (e) => {
        if (e.ctrlKey || e.metaKey) {
            hint.classList.remove('show');
            return false;
        }
        show('Use ' + mod + ' + scroll to zoom the map');
        return true;
    };
    el.classList.add('gesture-guard');
    el.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length === 1) {
                lmap.dragging.disable();
                touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else {
                lmap.dragging.enable();
                touchStart = null;
                hint.classList.remove('show');
            }
        },
        { capture: true, passive: true }
    );
    el.addEventListener(
        'touchmove',
        (e) => {
            if (e.touches.length !== 1 || !touchStart) return;
            const t = e.touches[0];
            if (Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) > 12) {
                show('Use two fingers to move the map');
                touchStart = null;
            }
        },
        { passive: true }
    );
    el.addEventListener(
        'touchend',
        (e) => {
            if (!e.touches.length) lmap.dragging.enable();
        },
        { passive: true }
    );
}

function openEmbedModal() {
    const src = viewUrl({ embed: '1' });
    byId('embed-code').value =
        '<iframe src="' +
        src +
        '" width="100%" height="600" style="border:0;border-radius:12px" loading="lazy" allowfullscreen title="' +
        escapeHtml(map.title || 'Interactive map') +
        '"></iframe>';
    openModal('embedModal');
}

// Report

const MAP_REPORT_REASONS = {
    outdated: 'Outdated',
    wrong: 'Wrong info',
    inappropriate: 'Inappropriate',
    other: 'Other',
};
const ELEMENT_FIX_REASONS = {
    'wrong-spot': 'Wrong spot',
    'wrong-info': 'Wrong info',
    gone: 'Not in the game anymore',
    other: 'Other',
};
let reportReason = 'outdated';
let reportElementId = null;

function openReportModal(elementId) {
    const hit = typeof elementId === 'string' ? findElement(elementId) : null;
    reportElementId = hit ? elementId : null;
    const reasons = hit ? ELEMENT_FIX_REASONS : MAP_REPORT_REASONS;
    reportReason = Object.keys(reasons)[0];
    byId('report-title').textContent = hit ? 'Suggest a fix' : 'Report this map';
    byId('report-intro').innerHTML = hit
        ? 'What’s wrong with <b>' + escapeHtml(hit.el.name || 'this spot') + '</b>? The map’s author gets your note.'
        : 'What’s wrong with it?';
    byId('report-reasons').innerHTML = Object.entries(reasons)
        .map(
            ([k, label]) =>
                '<button type="button" class="report-reason-btn h-[34px] px-3.5 rounded-full border border-border bg-input-bg text-[#ccc] text-[0.8rem] font-semibold cursor-pointer hover:text-white [&.text-accent]:border-accent [&.text-accent]:text-accent [&.text-accent]:bg-accent/10" data-reason="' +
                k +
                '">' +
                label +
                '</button>'
        )
        .join('');
    setSegmentedButtons('report-reason-btn', 'reason', reportReason);
    byId('report-details').value = '';
    byId('report-details').placeholder = hit
        ? 'e.g. it’s by the bridge now, or the drop changed (optional)'
        : 'Details help, e.g. which marker is wrong (optional)';
    byId('report-done-text').textContent = hit ? 'The map’s author will see it.' : 'We’ll take a look.';
    byId('report-form').classList.remove('hidden');
    byId('report-done').classList.add('hidden');
    openModal('reportModal');
}

function wireShareControls() {
    byId('view-embed-btn').addEventListener('click', openEmbedModal);
    byId('embed-copy').addEventListener('click', () => copyText(byId('embed-code').value, 'Embed code copied'));
    byId('view-report-btn').addEventListener('click', () => openReportModal(null));
    byId('report-reasons').addEventListener('click', (e) => {
        const b = e.target.closest('.report-reason-btn');
        if (!b) return;
        reportReason = b.dataset.reason;
        setSegmentedButtons('report-reason-btn', 'reason', reportReason);
    });
    byId('report-submit').addEventListener('click', () => {
        const details = byId('report-details').value.trim();
        const hit = reportElementId && findElement(reportElementId);
        const sent = hit
            ? submitElementFeedback({
                  mapId: map.id,
                  elementId: reportElementId,
                  layerId: hit.layer.id,
                  elementName: hit.el.name || '',
                  reason: reportReason,
                  details,
              })
            : submitMapReport({ mapId: map.id, reason: reportReason, details });
        sent.then(() => {
            byId('report-form').classList.add('hidden');
            byId('report-done').classList.remove('hidden');
        });
    });
    qsa('[data-close-modal]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.closeModal)));
    document.addEventListener('keydown', (e) => {
        const open = qs('.modal-overlay:not(.hidden)');
        if (e.key === 'Escape' && open) closeModal(open.id);
    });
}
