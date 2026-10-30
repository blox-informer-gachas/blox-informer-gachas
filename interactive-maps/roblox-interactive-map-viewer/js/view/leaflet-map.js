// View map setup: filter panel, maximize
let viewPanels = null;

function initFilterPanel() {
    viewPanels = createOverlayPanels(byId('view-stage'), 'mapViewPanelPrefs');
    viewPanels.init();
    if (document.body.classList.contains('embed')) viewPanels.setOpen('left', false, false);
    qsa('[data-panel-toggle]').forEach((btn) =>
        btn.addEventListener('click', () => viewPanels.toggle(btn.dataset.panelToggle))
    );
}

function coveredMapSides() {
    const w = byId('map-viewport').clientWidth;
    const r = viewPanels ? viewPanels.unobscuredRange() : { left: 0, right: w };
    return { left: r.left, right: Math.max(0, w - r.right) };
}

function initViewMap() {
    cam = createLeafletCamera(byId('map-viewport'), {
        getLayer: activeLayer,
        getDisplay: () => map.display,
        getPadding: coveredMapSides,
        zoomLabel: byId('zoom-label'),
    });
    const lmap = cam.lmap;
    byId('filter-credit').classList.toggle('hidden', !mapUsesGameIcons(map));
    initMinimap();
    lmap.on('zoomend', onZoomVisibility);
    lmap.on('popupopen', () => {
        lmap.setMaxBounds(null);
        refreshOpenPopup();
    });
    lmap.on('popupclose', () => {
        if (!lmap.options.maxBounds) cam.fit(false, false);
    });
    byId('view-zoom-in').addEventListener('click', () => lmap.zoomIn());
    byId('view-zoom-out').addEventListener('click', () => lmap.zoomOut());
    byId('view-zoom-reset').addEventListener('click', () => cam.fit(true));
    byId('view-maximize').addEventListener('click', toggleMaximize);
    document.addEventListener('keydown', (e) => {
        if (
            e.key === 'Escape' &&
            byId('view-stage-card').classList.contains('is-maximized') &&
            !qs('.modal-overlay:not(.hidden)')
        )
            toggleMaximize();
    });
}

function showLayerOnMap(layer) {
    cam.showLayer(layer);
    updateMinimapLayer(layer);
    renderMapView();
    renderRoutes();
    renderMine();
}

// Maximize

function toggleMaximize() {
    const card = byId('view-stage-card');
    const on = !card.classList.contains('is-maximized');
    const center = cam.lmap.getCenter(),
        zoom = cam.lmap.getZoom();
    card.classList.toggle('is-maximized', on);
    document.body.classList.toggle('view-maximized', on);
    const btn = byId('view-maximize');
    btn.innerHTML = '<i class="fas fa-' + (on ? 'minimize' : 'maximize') + '"></i>';
    btn.title = on ? 'Exit maximized view (Esc)' : 'Maximize map';
    btn.setAttribute('aria-label', btn.title);
    requestAnimationFrame(() => {
        cam.lmap.invalidateSize({ pan: false });
        if (!cam.stayFitted) cam.lmap.setView(center, zoom, { animate: false });
    });
}
