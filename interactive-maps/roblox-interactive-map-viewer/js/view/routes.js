// Routes: list, overlays, showing one route
const routeOverlays = new Map();

function activeRoute() {
    return activeRouteId ? (map.routes || []).find((r) => r.id === activeRouteId) || null : null;
}

function elementInActiveRoute(el) {
    const r = activeRoute();
    if (!r || !isCategorized(el)) return true;
    return routeStopIds(r).includes(el.id);
}

// On the map

function renderRoutes() {
    routeOverlays.forEach((o) => o.group.remove());
    routeOverlays.clear();
    if (activeRoute() && activeRoute().layerId !== activeLayerId) activeRouteId = null;
    routeLayerRoutes(map, activeLayerId).forEach((r) => {
        const o = createRouteOverlay(map, r, { interactive: true });
        if (o.hit) {
            o.hit.bindPopup(() => routePopupHtml(r), {
                className: 'map-popup',
                maxWidth: 300,
                minWidth: 220,
                autoPan: false,
            });
            if (canHover)
                o.hit.bindTooltip(escapeHtml(r.name || 'Route'), {
                    className: 'map-hover-label',
                    sticky: true,
                    direction: 'top',
                    offset: [0, -8],
                    opacity: 1,
                });
        }
        routeOverlays.set(r.id, o);
    });
    applyRouteVisibility();
    renderRouteSection();
}

function applyRouteVisibility() {
    routeOverlays.forEach((o, id) => {
        const show = id === activeRouteId;
        if (!show && cam.lmap.hasLayer(o.group)) o.group.remove();
        else if (show && !cam.lmap.hasLayer(o.group)) {
            o.group.addTo(cam.lmap);
            o.paths.forEach((p) => {
                const n = p.getElement();
                if (n) {
                    n.classList.remove('lf-route-in');
                    void n.getBoundingClientRect();
                    n.classList.add('lf-route-in');
                }
            });
        }
    });
}

function routePopupHtml(r) {
    const stops = routeStopIds(r).length;
    return (
        '<h3 class="map-tooltip-name"><span class="route-swatch" style="background:' +
        escapeHtml(r.color) +
        '"></span> ' +
        escapeHtml(r.name || 'Route') +
        '</h3>' +
        '<div class="map-tooltip-meta">Route' +
        (stops ? ' · ' + stops + ' stop' + (stops === 1 ? '' : 's') : '') +
        (r.loop ? ' · loops' : '') +
        '</div>' +
        (r.description ? '<div class="map-tooltip-desc">' + escapeHtml(r.description) + '</div>' : '')
    );
}

// Filter panel

const ROUTE_NOTE = 'text-[0.75rem] text-[#999] mt-0.5 mx-0 mb-1.5 leading-[1.4]';

function routeDetailHtml(r) {
    const stops = routeStopIds(r)
        .map((id, i) => {
            const hit = findElement(id);
            if (!hit) return '';
            return (
                '<li><button type="button" class="flex items-center gap-2 w-full min-h-8 p-1 [border:0] bg-transparent text-[#ddd] text-[0.78rem] text-left rounded-md cursor-pointer hover:bg-white/[0.06]" data-action="route-stop" data-element-id="' +
                escapeHtml(id) +
                '">' +
                '<b class="flex-none min-w-[18px] h-[18px] rounded-[9px] text-[#0b0b0b] text-[0.66rem] leading-[18px] text-center" style="background:' +
                escapeHtml(r.color) +
                '">' +
                (i + 1) +
                '</b><span class="flex-1 min-w-0 truncate">' +
                escapeHtml(hit.el.name || markerTextOf(hit.el) || 'Unnamed') +
                '</span>' +
                (foundIds.has(id) ? '<i class="fas fa-circle-check ' + FT_FOUND + '"></i>' : '') +
                '</button></li>'
            );
        })
        .join('');
    return (
        '<div class="' +
        FT_CHILDREN +
        ' pt-0.5 pr-0 pb-1 pl-2 [border-left-color:color-mix(in_srgb,var(--cc,#888)_55%,transparent)]" data-route-detail="' +
        escapeHtml(r.id) +
        '" style="--cc:' +
        escapeHtml(r.color) +
        '">' +
        (r.description ? '<p class="' + ROUTE_NOTE + '">' + escapeHtml(r.description) + '</p>' : '') +
        (r.loop ? '<p class="' + ROUTE_NOTE + '"><i class="fas fa-rotate mr-1"></i> Loops back to the start</p>' : '') +
        (stops ? '<ol class="list-none mt-0 mx-0 mb-1 p-0">' + stops + '</ol>' : '') +
        '</div>'
    );
}

function renderRouteSection() {
    const routes = routeLayerRoutes(map, activeLayerId);
    byId('filter-routes-section').classList.toggle('hidden', routes.length === 0);
    byId('filter-routes').innerHTML = routes
        .map((r) => {
            const on = r.id === activeRouteId;
            const hasDetail = !!(r.description || r.loop || routeStopIds(r).length);
            const head =
                '<div class="ft-row ft-route ' +
                FT_ROW_PLAIN +
                ' [&.active]:bg-accent/[0.14] [&.active]:border-accent/45 [&.active]:text-white' +
                (on ? ' active' : '') +
                '" role="button" tabindex="0" data-action="route-toggle" data-route-id="' +
                escapeHtml(r.id) +
                '" aria-expanded="' +
                on +
                '" aria-pressed="' +
                on +
                '" title="' +
                (on ? 'Hide this route' : 'Show this route') +
                '">' +
                '<span class="' +
                FT_CHEVRON +
                (on ? ' open' : '') +
                '" aria-hidden="true"' +
                (hasDetail ? '' : ' style="visibility:hidden"') +
                '><i class="fas fa-chevron-right"></i></span>' +
                '<span class="' +
                FT_ICON +
                '"><span class="w-3.5 h-3.5 rounded flex-none inline-block" style="background:' +
                escapeHtml(r.color) +
                '"></span></span>' +
                '<span class="' +
                FT_NAME +
                '">' +
                escapeHtml(r.name || 'Route') +
                '</span>' +
                '<span class="flex-none text-[0.68rem] font-bold uppercase tracking-[0.04em] text-[#777] pr-1 [transition:color_0.2s] [.ft-route.active_&]:text-accent">' +
                (on ? 'Shown' : 'Show') +
                '</span>' +
                '</div>';
            return head + (on && hasDetail ? routeDetailHtml(r) : '');
        })
        .join('');
}

function fitActiveRoute() {
    const o = routeOverlays.get(activeRouteId);
    if (!o || !o.bounds) return;
    const pad = cam.padding();
    cam.lmap.fitBounds(o.bounds, {
        paddingTopLeft: [pad.paddingTopLeft[0] + 40, pad.paddingTopLeft[1] + 60],
        paddingBottomRight: [pad.paddingBottomRight[0] + 40, pad.paddingBottomRight[1] + 60],
        maxZoom: Math.min(cam.lmap.getMaxZoom(), cam.fitZoom + 1.5),
        animate: true,
    });
}

function setActiveRoute(id, opts) {
    const r = id ? (map.routes || []).find((x) => x.id === id) : null;
    if (r && r.layerId !== activeLayerId) switchLayer(r.layerId);
    const prevId = activeRouteId;
    const finish = () => {
        activeRouteId = r ? r.id : null;
        cam.lmap.closePopup();
        renderRouteSection();
        applyRouteVisibility();
        applyVisibility();
        syncUrlToElement(null);
        const detail = r && qs('[data-route-detail="' + CSS.escape(r.id) + '"]');
        if (detail && !(opts && opts.instant)) {
            detail.style.overflow = 'hidden';
            detail.animate(
                [
                    { height: '0px', opacity: 0 },
                    { height: detail.offsetHeight + 'px', opacity: 1 },
                ],
                { duration: TREE_ANIM_MS, easing: 'ease-out' }
            ).onfinish = () => {
                detail.style.overflow = '';
            };
        }
        if (r && (!opts || opts.fit !== false)) fitActiveRoute();
    };
    const old = prevId && qs('[data-route-detail="' + CSS.escape(prevId) + '"]');
    if (old && !(opts && opts.instant)) {
        old.style.overflow = 'hidden';
        old.animate(
            [
                { height: old.offsetHeight + 'px', opacity: 1 },
                { height: '0px', opacity: 0 },
            ],
            { duration: TREE_ANIM_MS, easing: 'ease-in-out' }
        ).onfinish = finish;
    } else finish();
}

function openRouteFromUrl(routeId) {
    if (routeId && (map.routes || []).some((r) => r.id === routeId)) setTimeout(() => setActiveRoute(routeId), 200);
}

function wireRouteControls() {
    const host = byId('filter-routes');
    const act = (e) => {
        const t = e.target.closest('[data-action]');
        if (!t) return;
        const a = t.dataset.action;
        if (a === 'route-toggle') setActiveRoute(t.dataset.routeId === activeRouteId ? null : t.dataset.routeId);
        else if (a === 'route-stop') goToElement(t.dataset.elementId);
    };
    host.addEventListener('click', act);
    host.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-action="route-toggle"]')) {
            e.preventDefault();
            act(e);
        }
    });
}
