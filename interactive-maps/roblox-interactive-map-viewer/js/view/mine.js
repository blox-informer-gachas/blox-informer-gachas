// My markers: the viewer's own markers and routes
const MAX_MINE_ITEMS = 300;
const MINE_DEFAULT_COLOR = '#fcb900';
const MINE_MARKER_SIZES = [
    ['Small', 60],
    ['Medium', 80],
    ['Large', 110],
    ['Huge', 150],
];
const MINE_ROUTE_WIDTHS = [
    ['Thin', 60],
    ['Normal', 100],
    ['Thick', 160],
    ['Bold', 240],
];
const MINE_SHAPES = [
    ['drop', 'Pin'],
    ['circle', 'Circle'],
    ['square', 'Square'],
    ['none', 'Icon only'],
];
let mineIconPicker = null;

let mine = { markers: [], routes: [] };
let mineGroup = null;
const mineLayers = new Map();
let mineMode = null;
let mineEdit = null;

function initMine() {
    const layerIds = new Set(map.layers.map((l) => l.id));
    const data = loadViewerMarks(map.id);
    mine = {
        markers: data.markers.filter((m) => m && layerIds.has(m.layerId)),
        routes: data.routes.filter((r) => r && layerIds.has(r.layerId)),
    };
    mineGroup = L.layerGroup().addTo(cam.lmap);
    const lmap = cam.lmap;
    lmap.on('click', (e) => {
        if (!mineMode) return;
        const P = fromLatLng(e.latlng);
        if (mineMode.kind === 'marker') placeMineMarker(P);
        else addMineRoutePoint(P);
    });
    lmap.on('mousemove', (e) => {
        if (mineMode && mineMode.kind === 'route' && mineMode.points.length) {
            const last = mineMode.points[mineMode.points.length - 1];
            mineMode.rubber.setLatLngs([toLatLng(last.x, last.y), e.latlng]);
        }
    });
    lmap.on('dblclick', () => {
        if (mineMode && mineMode.kind === 'route') finishMineRoute();
    });

    byId('mine-add-marker').addEventListener('click', () =>
        mineMode && mineMode.kind === 'marker' ? cancelMineDrawing() : startMineMode('marker')
    );
    byId('mine-add-route').addEventListener('click', () =>
        mineMode && mineMode.kind === 'route' ? cancelMineDrawing() : startMineMode('route')
    );
    const list = byId('mine-list');
    list.addEventListener('click', handleMineListClick);
    list.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-mine-go]')) {
            e.preventDefault();
            handleMineListClick(e);
        }
    });
    byId('map-hint-bar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mine-draw]');
        if (!b) return;
        if (b.dataset.mineDraw === 'undo') undoMineRoutePoint();
        if (b.dataset.mineDraw === 'cancel') cancelMineDrawing();
        if (b.dataset.mineDraw === 'finish') finishMineRoute();
    });
    document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mine-edit]');
        if (b) {
            cam.lmap.closePopup();
            openMineEditor(b.dataset.mineKind, b.dataset.mineEdit);
        }
    });
    document.addEventListener('keydown', (e) => {
        if (!mineMode || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || qs('.modal-overlay:not(.hidden)'))
            return;
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelMineDrawing();
        } else if (e.key === 'Enter' && mineMode.kind === 'route') {
            e.preventDefault();
            finishMineRoute();
        } else if (e.key === 'Backspace' && mineMode.kind === 'route') {
            e.preventDefault();
            undoMineRoutePoint();
        }
    });
    initMineEditor();
}

function persistMine() {
    if (!saveViewerMarks(map.id, mine))
        showToast('Your browser storage is full, so this could not be saved', 'fa-triangle-exclamation');
}

function mineItem(kind, id) {
    return (kind === 'route' ? mine.routes : mine.markers).find((x) => x.id === id) || null;
}

// On the map

function mineMarkerStyle(m) {
    const color = m.color || MINE_DEFAULT_COLOR,
        shape = m.shape || 'drop';
    const c = cpHexToRgb(color);
    const light = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 165;
    return Object.assign({}, DEFAULT_STYLE, {
        icon: m.icon || DEFAULT_MARKER_ICON,
        color: shape === 'none' ? color : light ? '#141414' : '#ffffff',
        bgColor: color,
        markerShape: shape,
        outlineColor: '#111111',
        size: m.size || 80,
        shadow: true,
    });
}

function renderMine() {
    if (!mineGroup) return;
    renderMineLayers();
    renderMineList();
}

function renderMineLayers() {
    mineGroup.clearLayers();
    mineLayers.clear();
    mine.routes.filter((r) => r.layerId === activeLayerId && !r.hidden).forEach(addMineRouteLayer);
    mine.markers.filter((m) => m.layerId === activeLayerId && !m.hidden).forEach(addMineMarkerLayer);
}

function addMineMarkerLayer(m) {
    const s = mineMarkerStyle(m);
    const lay = new SubpixelMarker(toLatLng(m.x, m.y), {
        draggable: true,
        keyboard: true,
        title: m.name || 'Your marker',
        zIndexOffset: 4000000,
        icon: L.divIcon({
            className: 'lf-marker lf-mine',
            html: markerHtml({}, s),
            iconSize: [0, 0],
            popupAnchor: [0, -markerTopOffsetPx(s) + 4],
        }),
    });
    lay._openPopup = function (e) {
        if (mineMode && mineMode.kind === 'route') {
            addMineRoutePoint({ x: m.x, y: m.y });
            return;
        }
        L.Layer.prototype._openPopup.call(this, e);
    };
    lay.bindPopup(() => minePopupHtml('marker', m), {
        className: 'map-popup mine-popup',
        maxWidth: 300,
        minWidth: 220,
        autoPan: false,
    });
    if (canHover)
        lay.bindTooltip(escapeHtml(m.name || 'Your marker'), {
            className: 'map-hover-label',
            direction: 'top',
            offset: [0, -markerTopOffsetPx(s) + 4],
            opacity: 1,
        });
    lay.on('popupopen', () => lay.closeTooltip?.());
    lay.on('dragend', () => {
        const p = fromLatLng(lay.getLatLng());
        m.x = Math.round(p.x);
        m.y = Math.round(p.y);
        persistMine();
    });
    mineLayers.set(m.id, lay);
    mineGroup.addLayer(lay);
}

function addMineRouteLayer(r) {
    const o = createRouteOverlay(map, r, { interactive: true });
    if (o.hit) {
        o.hit.bindPopup(() => minePopupHtml('route', r), {
            className: 'map-popup mine-popup',
            maxWidth: 300,
            minWidth: 220,
            autoPan: false,
        });
        if (canHover)
            o.hit.bindTooltip(escapeHtml(r.name || 'Your route'), {
                className: 'map-hover-label',
                sticky: true,
                direction: 'top',
                offset: [0, -8],
                opacity: 1,
            });
    }
    o.paths.forEach((p) => p.on('add', () => p.getElement()?.classList.add('lf-mine-route')));
    mineLayers.set(r.id, o);
    mineGroup.addLayer(o.group);
}

function minePopupHtml(kind, item) {
    const note = (item.note || '').trim();
    return (
        '<div class="mine-popup-head"><i class="fas fa-user"></i> Your ' +
        kind +
        '</div>' +
        '<h3 class="map-tooltip-name">' +
        escapeHtml(item.name || (kind === 'route' ? 'Your route' : 'Your marker')) +
        '</h3>' +
        (note ? '<div class="map-tooltip-desc mine-note">' + escapeHtml(note) + '</div>' : '') +
        '<div class="popup-actions">' +
        '<button type="button" class="popup-btn primary" data-mine-edit="' +
        escapeHtml(item.id) +
        '" data-mine-kind="' +
        kind +
        '"><i class="fas fa-pen"></i> Edit</button>' +
        (kind === 'marker' ? '<span class="mine-popup-hint">Drag the pin to move it</span>' : '') +
        '</div>'
    );
}

// Adding

function mineCount() {
    return mine.markers.length + mine.routes.length;
}

function startMineMode(kind) {
    cancelMineDrawing();
    if (mineCount() >= MAX_MINE_ITEMS) {
        showToast(
            'You can keep up to ' + MAX_MINE_ITEMS + ' of your own markers and routes on one map',
            'fa-triangle-exclamation'
        );
        return;
    }
    cam.lmap.closePopup();
    mineMode = { kind };
    if (kind === 'route') {
        Object.assign(mineMode, {
            points: [],
            targetId: null,
            preview: L.polyline([], {
                interactive: false,
                color: MINE_DEFAULT_COLOR,
                weight: 3,
                dashArray: '7 6',
            }).addTo(cam.lmap),
            rubber: L.polyline([], {
                interactive: false,
                color: MINE_DEFAULT_COLOR,
                weight: 1.5,
                dashArray: '3 5',
                opacity: 0.8,
            }).addTo(cam.lmap),
            dots: L.layerGroup().addTo(cam.lmap),
        });
        cam.lmap.doubleClickZoom.disable();
    }
    byId('map-viewport').classList.add('mine-placing');
    if (isNarrowStage()) viewPanels.setOpen('left', false);
    renderMineModeUi();
}

function startMineRedraw(id) {
    const r = mineItem('route', id);
    if (!r) return;
    if (r.layerId !== activeLayerId) switchLayer(r.layerId);
    startMineMode('route');
    if (mineMode) mineMode.targetId = id;
    renderMineModeUi();
}

function cancelMineDrawing() {
    if (!mineMode) return;
    ['preview', 'rubber', 'dots'].forEach((k) => mineMode[k] && mineMode[k].remove());
    mineMode = null;
    cam.lmap.doubleClickZoom.enable();
    byId('map-viewport').classList.remove('mine-placing');
    renderMineModeUi();
}

const HINT_BAR_BTN =
    'h-7 px-3 rounded-full border text-[0.75rem] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-default flex-none enabled:hover:border-amber enabled:hover:text-white border-[#333] bg-input-bg text-[#ddd]';
const HINT_BAR_PRIMARY =
    'h-7 px-3 rounded-full border text-[0.75rem] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-default flex-none enabled:hover:border-amber enabled:hover:text-white bg-amber border-amber text-[#111]';

// The hint bar over the map and the two add buttons follow the current mode
function renderMineModeUi() {
    const bar = byId('map-hint-bar');
    const kind = mineMode && mineMode.kind;
    byId('mine-add-marker').classList.toggle('active', kind === 'marker');
    byId('mine-add-route').classList.toggle('active', kind === 'route');
    byId('mine-add-marker').innerHTML =
        kind === 'marker' ? '<i class="fas fa-xmark"></i> Cancel' : '<i class="fas fa-plus"></i> Marker';
    byId('mine-add-route').innerHTML =
        kind === 'route' ? '<i class="fas fa-xmark"></i> Cancel' : '<i class="fas fa-plus"></i> Route';
    if (!kind) {
        bar.innerHTML = '';
        bar.classList.add('hidden');
        return;
    }
    if (kind === 'marker') {
        bar.innerHTML =
            '<i class="fas fa-location-dot"></i><span>' +
            (IS_TOUCH ? 'Tap' : 'Click') +
            ' the map to place your marker</span>' +
            '<button type="button" class="' +
            HINT_BAR_BTN +
            '" data-mine-draw="cancel">Cancel</button>';
    } else {
        const n = mineMode.points.length,
            stops = mineMode.points.filter((p) => p.elementId).length;
        bar.innerHTML =
            '<i class="fas fa-route"></i><span>' +
            (n
                ? n +
                  ' point' +
                  (n === 1 ? '' : 's') +
                  (stops ? ' (' + stops + ' stop' + (stops === 1 ? '' : 's') + ')' : '') +
                  ' · '
                : '') +
            (n < 2
                ? (IS_TOUCH ? 'Tap' : 'Click') + ' along the way · a marker becomes a stop'
                : (IS_TOUCH ? 'Finish' : 'Double-click or Finish') + ' when done') +
            '</span>' +
            (n
                ? '<button type="button" class="' +
                  HINT_BAR_BTN +
                  '" data-mine-draw="undo" title="Remove the last point (Backspace)"><i class="fas fa-rotate-left"></i></button>'
                : '') +
            '<button type="button" class="' +
            HINT_BAR_BTN +
            '" data-mine-draw="cancel">Cancel</button>' +
            '<button type="button" class="' +
            HINT_BAR_PRIMARY +
            '" data-mine-draw="finish"' +
            (n < 2 ? ' disabled' : '') +
            '>Finish</button>';
    }
    bar.classList.remove('hidden');
}

function insideActiveLayer(P) {
    const l = activeLayer();
    return !!l && P.x >= 0 && P.y >= 0 && P.x <= l.backgroundWidth && P.y <= l.backgroundHeight;
}

function placeMineMarker(P) {
    if (!insideActiveLayer(P)) {
        showToast('Put it somewhere on the map image', 'fa-triangle-exclamation');
        return;
    }
    cancelMineDrawing();
    const m = {
        id: uid('mine-'),
        layerId: activeLayerId,
        x: Math.round(P.x),
        y: Math.round(P.y),
        name: 'My marker ' + (mine.markers.length + 1),
        note: '',
        color: MINE_DEFAULT_COLOR,
        icon: DEFAULT_MARKER_ICON,
        createdAt: new Date().toISOString(),
    };
    mine.markers.push(m);
    persistMine();
    addMineMarkerLayer(m);
    renderMineList();
    openMineEditor('marker', m.id);
}

function mineClickElement(el, e) {
    if (!mineMode) return false;
    if (mineMode.kind === 'marker') {
        placeMineMarker(e && e.latlng ? fromLatLng(e.latlng) : elementAnchor(el));
        return true;
    }
    const a = elementAnchor(el);
    addMineRoutePoint({ x: a.x, y: a.y, elementId: el.id });
    return true;
}

function addMineRoutePoint(P) {
    if (!mineMode || mineMode.kind !== 'route') return;
    const pts = mineMode.points;
    const last = pts[pts.length - 1];
    const near =
        last &&
        cam.lmap
            .latLngToContainerPoint(toLatLng(last.x, last.y))
            .distanceTo(cam.lmap.latLngToContainerPoint(toLatLng(P.x, P.y))) < 6;
    if (near) return;
    if (!P.elementId && !insideActiveLayer(P)) return;
    pts.push(P.elementId ? { x: P.x, y: P.y, elementId: P.elementId } : { x: Math.round(P.x), y: Math.round(P.y) });
    mineMode.preview.setLatLngs(pts.map((p) => toLatLng(p.x, p.y)));
    L.circleMarker(toLatLng(P.x, P.y), {
        radius: P.elementId ? 7 : 4,
        color: MINE_DEFAULT_COLOR,
        weight: 2,
        fillColor: P.elementId ? MINE_DEFAULT_COLOR : '#181818',
        fillOpacity: 1,
        interactive: false,
    }).addTo(mineMode.dots);
    renderMineModeUi();
}

function undoMineRoutePoint() {
    if (!mineMode || mineMode.kind !== 'route' || !mineMode.points.length) return;
    mineMode.points.pop();
    mineMode.preview.setLatLngs(mineMode.points.map((p) => toLatLng(p.x, p.y)));
    const dots = mineMode.dots.getLayers();
    if (dots.length) mineMode.dots.removeLayer(dots[dots.length - 1]);
    mineMode.rubber.setLatLngs([]);
    renderMineModeUi();
}

function finishMineRoute() {
    if (!mineMode || mineMode.kind !== 'route') return;
    const pts = mineMode.points.map((p) => (p.elementId ? { elementId: p.elementId } : { x: p.x, y: p.y }));
    if (pts.length < 2) {
        showToast('Add at least 2 points first', 'fa-triangle-exclamation');
        return;
    }
    const targetId = mineMode.targetId;
    cancelMineDrawing();
    const existing = targetId && mineItem('route', targetId);
    if (existing) {
        existing.points = pts;
        persistMine();
        renderMine();
        showToast('Route redrawn', 'fa-route');
        return;
    }
    const r = {
        id: uid('mine-'),
        layerId: activeLayerId,
        name: 'My route ' + (mine.routes.length + 1),
        note: '',
        color: MINE_DEFAULT_COLOR,
        width: 100,
        loop: false,
        points: pts,
        createdAt: new Date().toISOString(),
    };
    mine.routes.push(r);
    persistMine();
    renderMine();
    openMineEditor('route', r.id);
}

// Filter panel list

function mineIconHtml(kind, item) {
    return kind === 'route'
        ? '<span class="w-3.5 h-3.5 rounded flex-none inline-block" style="background:' +
              escapeHtml(item.color || MINE_DEFAULT_COLOR) +
              '"></span>'
        : iconSpecHtml(item.icon || DEFAULT_MARKER_ICON, '', 'color:' + (item.color || MINE_DEFAULT_COLOR));
}

function mineRowHtml(kind, item) {
    const on = !item.hidden,
        name = item.name || (kind === 'route' ? 'Your route' : 'Your marker');
    return (
        '<div class="ft-row ft-item ft-mine ' +
        FT_ROW_ITEM +
        (on ? '' : ' is-off') +
        '" role="button" tabindex="0" data-mine-go="' +
        escapeHtml(item.id) +
        '" data-mine-kind="' +
        kind +
        '" title="Go to ' +
        escapeHtml(name) +
        '">' +
        '<span class="' +
        FT_ICON +
        '">' +
        mineIconHtml(kind, item) +
        '</span>' +
        '<span class="' +
        FT_NAME +
        '">' +
        escapeHtml(name) +
        '</span>' +
        '<button type="button" class="flex-none w-[26px] h-[26px] border-none rounded-[7px] bg-transparent text-[#777] text-[0.68rem] cursor-pointer hover:text-white hover:bg-white/[0.08]" data-mine-edit="' +
        escapeHtml(item.id) +
        '" data-mine-kind="' +
        kind +
        '" title="Edit" aria-label="Edit ' +
        escapeHtml(name) +
        '"><i class="fas fa-pen"></i></button>' +
        '<button type="button" class="' +
        FT_SWITCH +
        (on ? ' on' : '') +
        '" role="switch" aria-checked="' +
        on +
        '" data-mine-toggle="' +
        escapeHtml(item.id) +
        '" data-mine-kind="' +
        kind +
        '" title="' +
        (on ? 'Hide' : 'Show') +
        ' on the map" aria-label="Show ' +
        escapeHtml(name) +
        ' on the map">' +
        FT_SWITCH_KNOB +
        '</button>' +
        '</div>'
    );
}

function renderMineList() {
    const host = byId('mine-list');
    const markers = mine.markers.filter((m) => m.layerId === activeLayerId);
    const routes = mine.routes.filter((r) => r.layerId === activeLayerId);
    const elsewhere = mineCount() - markers.length - routes.length;
    byId('mine-count').textContent = mineCount() ? String(mineCount()) : '';
    host.innerHTML =
        routes.map((r) => mineRowHtml('route', r)).join('') +
        markers.map((m) => mineRowHtml('marker', m)).join('') +
        (!mineCount()
            ? '<p class="text-[#777] text-[0.75rem] leading-[1.4] px-1 py-0.5">Add your own markers and routes: spots to come back to, your farming loop. Only you can see them.</p>'
            : '') +
        (elsewhere
            ? '<p class="text-[#777] text-[0.75rem] leading-[1.4] px-1 py-0.5">' +
              elsewhere +
              ' more on other layers</p>'
            : '');
}

function setMineHiddenOnLayer(hidden) {
    let changed = false;
    mine.markers.concat(mine.routes).forEach((x) => {
        if (x.layerId !== activeLayerId || !!x.hidden === hidden) return;
        if (hidden) x.hidden = true;
        else delete x.hidden;
        changed = true;
    });
    if (!changed) return;
    persistMine();
    renderMine();
}

function handleMineListClick(e) {
    if (e.target.closest('[data-mine-edit]')) return;
    const sw = e.target.closest('[data-mine-toggle]');
    if (sw) {
        const item = mineItem(sw.dataset.mineKind, sw.dataset.mineToggle);
        if (!item) return;
        item.hidden = !item.hidden;
        if (!item.hidden) delete item.hidden;
        persistMine();
        renderMineLayers();
        const on = !item.hidden;
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-checked', on);
        sw.title = (on ? 'Hide' : 'Show') + ' on the map';
        sw.closest('[data-mine-go]')?.classList.toggle('is-off', !on);
        return;
    }
    const row = e.target.closest('[data-mine-go]');
    if (row) goToMine(row.dataset.mineKind, row.dataset.mineGo);
}

function goToMine(kind, id) {
    const item = mineItem(kind, id);
    if (!item) return;
    if (item.layerId !== activeLayerId) switchLayer(item.layerId);
    if (item.hidden) {
        delete item.hidden;
        persistMine();
        renderMine();
    }
    if (isNarrowStage()) viewPanels.setOpen('left', false);
    const lay = mineLayers.get(id);
    if (kind === 'marker') {
        cam.lmap.setView(toLatLng(item.x, item.y), Math.max(cam.lmap.getZoom(), cam.fitZoom + 1), { animate: true });
        setTimeout(() => lay && lay.openPopup(), 280);
        return;
    }
    if (!lay || !lay.bounds) return;
    const pad = cam.padding();
    cam.lmap.fitBounds(lay.bounds, {
        paddingTopLeft: [pad.paddingTopLeft[0] + 40, 60],
        paddingBottomRight: [pad.paddingBottomRight[0] + 40, 60],
        maxZoom: cam.fitZoom + 1.5,
        animate: true,
    });
    const pts = routeCoords(map, item);
    const mid = pts[Math.floor(pts.length / 2)];
    if (lay.hit && mid) setTimeout(() => lay.hit.openPopup(toLatLng(mid.x, mid.y)), 320);
}

// Editor modal

let mineDraft = null;

function initMineEditor() {
    attachColorPicker(byId('mine-color'), {
        onChange: (hex) => {
            if (mineDraft) mineDraft.color = hex;
        },
    });
    mineIconPicker = attachIconPicker(
        byId('mine-icon-search'),
        byId('mine-icons'),
        () => mineDraft && mineDraft.icon,
        'data-mine-icon'
    );
    byId('mine-icons').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mine-icon]');
        if (!b || !mineDraft) return;
        mineDraft.icon = b.dataset.mineIcon;
        qsa('[data-mine-icon]', byId('mine-icons')).forEach((x) => x.classList.toggle('active', x === b));
    });
    [
        ['mine-sizes', 'size'],
        ['mine-shapes', 'shape'],
    ].forEach(([id, key]) =>
        byId(id).addEventListener('click', (e) => {
            const b = e.target.closest('[data-mine-opt]');
            if (!b || !mineDraft) return;
            mineDraft[key] = key === 'shape' ? b.dataset.mineOpt : +b.dataset.mineOpt;
            qsa('[data-mine-opt]', byId(id)).forEach((x) => x.classList.toggle('active', x === b));
        })
    );
    byId('mine-save').addEventListener('click', saveMineEditor);
    byId('mine-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveMineEditor();
        }
    });
    byId('mine-redraw').addEventListener('click', () => {
        const id = mineEdit && mineEdit.item.id;
        closeModal('mineModal');
        mineEdit = null;
        if (id) startMineRedraw(id);
    });
    byId('mine-delete').addEventListener('click', () => {
        if (!mineEdit) return;
        const { kind, item } = mineEdit;
        const list = kind === 'route' ? mine.routes : mine.markers;
        const index = list.indexOf(item);
        list.splice(index, 1);
        persistMine();
        renderMine();
        closeModal('mineModal');
        mineEdit = null;
        showUndoToast('Deleted “' + (item.name || 'it') + '”', () => {
            list.splice(Math.min(index, list.length), 0, item);
            persistMine();
            renderMine();
        });
    });
}

function showUndoToast(msg, onUndo) {
    const host = byId('toastHost');
    const el = document.createElement('div');
    el.className =
        'animate-[toastIn_0.25s_ease_forwards] absolute bottom-0 -translate-x-1/2 bg-[#181818] border border-border text-white text-sm pl-4 pr-1.5 py-1.5 rounded-full shadow-2xl flex items-center gap-3 whitespace-nowrap';
    el.innerHTML =
        '<i class="fas fa-trash text-accent"></i><span>' +
        escapeHtml(msg) +
        '</span><button type="button" class="h-[30px] px-3.5 rounded-full border-none bg-accent text-white font-bold text-[0.8rem] cursor-pointer hover:bg-[#e05f00]">Undo</button>';
    host.appendChild(el);
    const close = () => {
        el.style.opacity = '0';
        el.style.transition = 'opacity .3s';
        setTimeout(() => el.remove(), 300);
    };
    const timer = setTimeout(close, 6000);
    qs('button', el).addEventListener('click', () => {
        clearTimeout(timer);
        onUndo();
        close();
    });
}

function openMineEditor(kind, id) {
    const item = mineItem(kind, id);
    if (!item) return;
    mineEdit = { kind, item };
    const isRoute = kind === 'route';
    mineDraft = {
        color: item.color || MINE_DEFAULT_COLOR,
        icon: item.icon || DEFAULT_MARKER_ICON,
        size: (isRoute ? item.width : item.size) || (isRoute ? 100 : 80),
        shape: item.shape || 'drop',
    };
    byId('mine-modal-title').textContent = isRoute ? 'Your route' : 'Your marker';
    byId('mine-name').value = item.name || '';
    byId('mine-note').value = item.note || '';
    setColorInputValue(byId('mine-color'), mineDraft.color);
    byId('mine-marker-fields').classList.toggle('hidden', isRoute);
    byId('mine-loop-row').classList.toggle('hidden', !isRoute);
    byId('mine-loop').checked = !!item.loop;
    byId('mine-redraw').classList.toggle('hidden', !isRoute);
    byId('mine-size-label').textContent = isRoute ? 'Line width' : 'Size';
    const optsHtml = (opts, cur) =>
        opts
            .map(
                ([v, label]) =>
                    '<button type="button" class="h-[34px] px-1 rounded-lg border border-border bg-[#141414] text-[#bbb] [font:600_0.75rem_Inter,sans-serif] cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis hover:text-white hover:border-[#444] [&.active]:text-amber [&.active]:border-amber [&.active]:bg-amber/[0.12]' +
                    (v === cur ? ' active' : '') +
                    '" data-mine-opt="' +
                    v +
                    '">' +
                    label +
                    '</button>'
            )
            .join('');
    byId('mine-sizes').innerHTML = optsHtml(
        (isRoute ? MINE_ROUTE_WIDTHS : MINE_MARKER_SIZES).map(([l, v]) => [v, l]),
        mineDraft.size
    );
    byId('mine-shapes').innerHTML = optsHtml(MINE_SHAPES, mineDraft.shape);
    byId('mine-icon-search').value = '';
    mineIconPicker.render();
    openModal('mineModal');
    if (!IS_TOUCH)
        setTimeout(() => {
            const f = byId('mine-name');
            f.focus();
            f.select();
        }, 60);
}

function saveMineEditor() {
    if (!mineEdit) return;
    const { kind, item } = mineEdit;
    item.name = byId('mine-name').value.trim().slice(0, 60) || (kind === 'route' ? 'My route' : 'My marker');
    item.note = byId('mine-note').value.trim().slice(0, 500);
    item.color = mineDraft.color;
    if (kind === 'route') {
        item.width = mineDraft.size;
        item.loop = byId('mine-loop').checked;
    } else {
        item.icon = mineDraft.icon;
        item.size = mineDraft.size;
        item.shape = mineDraft.shape;
    }
    persistMine();
    renderMine();
    closeModal('mineModal');
    mineEdit = null;
}
