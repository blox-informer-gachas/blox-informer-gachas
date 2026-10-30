// Draws elements on the map, filter visibility, jumping to an element
const canHover = window.matchMedia('(hover: hover)').matches;
let forcedVisibleId = null;

function elementPassesFilters(el) {
    if (!isCategorized(el)) return true;
    if (filterState.hiddenCategories.has(el.categoryId)) return false;
    if (filterState.searchHits && !filterState.searchHits.has(el.id)) return false;
    if (!elementInActiveRoute(el)) return false;
    return true;
}

function hiddenBySwitch(el) {
    return isCategorized(el)
        ? filterState.hiddenCategories.has(el.categoryId)
        : filterState.hideAnnotations && !isDrawingElement(el);
}

function shouldBeGone(el) {
    const clustered = clusterGroup && el.type === 'marker';
    return (
        el.id !== forcedVisibleId &&
        (hiddenBySwitch(el) ||
            (filterState.hideFound && foundIds.has(el.id)) ||
            (clustered && !elementPassesFilters(el)) ||
            zoomHiddenCats.has(el.categoryId))
    );
}

const fadingOut = new Set();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function fadeOutLayer(el, lay) {
    const node = lay.getElement();
    if (!node || reduceMotion) {
        lay.remove();
        return;
    }
    if (fadingOut.has(el.id)) return;
    fadingOut.add(el.id);
    const label = lay._areaLabel && lay._areaLabel.getElement();
    [node, label].forEach((n) => n && n.classList.add('lf-hiding'));
    setTimeout(() => {
        if (!fadingOut.delete(el.id)) return;
        [node, label].forEach((n) => n && n.classList.remove('lf-hiding'));
        if (shouldBeGone(el)) lay.remove();
    }, 200);
}

function renderMapView() {
    elementLayers.forEach((l) => l.remove());
    elementLayers.clear();
    if (clusterGroup) {
        clusterGroup.remove();
        clusterGroup = null;
    }
    const layer = activeLayer();
    if (!layer) return;

    if (map.display.cluster && L.markerClusterGroup)
        clusterGroup = createClusterSet(cam.lmap, map, map.display.clusterBy);

    elementsInDrawOrder(layer.elements).forEach(addElement);
    applyVisibility();
}

function addElement(el) {
    const s = resolveStyle(map, el);
    const passive = !isCategorized(el);
    const lay = createElementLayer(
        el,
        s,
        passive
            ? Object.assign(
                  { interactive: el.type === 'area' && s.labelMode === 'hover' },
                  el.type === 'object' ? { zIndexOffset: objectStackOffset(activeLayer(), el) } : {}
              )
            : {}
    );
    lay._clusterKey = el.categoryId;
    elementLayers.set(el.id, lay);
    lay.on('add', () => afterLayerAdded(el, lay));
    if (!passive) {
        lay._openPopup = function (e) {
            if (mineClickElement(el, e)) return;
            L.Layer.prototype._openPopup.call(this, e);
        };
        const popupW = Math.min(360, cam.lmap.getSize().x - 40);
        lay.bindPopup(() => popupContentHtml(el), {
            className: 'map-popup',
            maxWidth: popupW,
            minWidth: window.innerWidth < 520 ? popupW : 240,
            autoPan: false,
        });
        lay.on('popupopen', () => {
            lay.closeTooltip?.();
            lay.getElement()?.classList.add('is-active');
            syncUrlToElement(el.id);
            settlePopupImages(lay.getPopup().getElement());
        });
        lay.on('popupclose', () => {
            lay.getElement()?.classList.remove('is-active');
            syncUrlToElement(null);
            if (forcedVisibleId === el.id) {
                forcedVisibleId = null;
                applyVisibility();
            }
        });
        if (canHover && el.name) {
            lay.bindTooltip(escapeHtml(el.name), {
                className: 'map-hover-label',
                direction: 'top',
                sticky: el.type !== 'marker',
                offset: el.type === 'marker' ? [0, -markerTopOffsetPx(s, el) + 4] : [0, -8],
                opacity: 1,
            });
        }
    }
    if (el.type === 'marker' && clusterGroup) clusterGroup.addLayer(lay);
    else lay.addTo(cam.lmap);
}

function afterLayerAdded(el, lay) {
    if (el.type === 'zone') applyZoneImageFill(lay, el);
    const node = lay.getElement();
    if (!reduceMotion)
        [node, lay._areaLabel && lay._areaLabel.getElement()].forEach((n) => {
            if (!n) return;
            n.classList.add('lf-appear');
            setTimeout(() => n.classList.remove('lf-appear'), 260);
        });
    if (node && el.type === 'zone') {
        node.setAttribute('tabindex', '0');
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', el.name || 'Zone');
        node.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                lay.openPopup();
            }
        });
    }
    paintElementState(el);
}

function paintElementState(el) {
    const node = elementLayers.get(el.id)?.getElement();
    if (!node) return;
    const clustered = clusterGroup && el.type === 'marker';
    node.classList.toggle('lf-dimmed', !clustered && !elementPassesFilters(el));
    node.classList.toggle('is-found', foundIds.has(el.id));
}

function applyVisibility() {
    const layer = activeLayer();
    if (!layer) return;
    zoomHiddenCats = categoriesHiddenAtZoom(map, cam.zoomPercent());
    const toAdd = [],
        toRemove = [];
    layer.elements.forEach((el) => {
        const lay = elementLayers.get(el.id);
        if (!lay) return;
        const clustered = clusterGroup && el.type === 'marker';
        const gone = shouldBeGone(el);
        const present = clustered ? clusterGroup.hasLayer(lay) : cam.lmap.hasLayer(lay);
        if (gone && present) {
            if (clustered) toRemove.push(lay);
            else fadeOutLayer(el, lay);
        } else if (!gone && !present) {
            if (clustered) toAdd.push(lay);
            else lay.addTo(cam.lmap);
        } else {
            if (!gone && fadingOut.delete(el.id))
                [lay.getElement(), lay._areaLabel && lay._areaLabel.getElement()].forEach(
                    (n) => n && n.classList.remove('lf-hiding')
                );
            paintElementState(el);
        }
    });
    if (clusterGroup) {
        if (toRemove.length) clusterGroup.removeLayers(toRemove);
        if (toAdd.length) clusterGroup.addLayers(toAdd);
    }
}

function onZoomVisibility() {
    const next = categoriesHiddenAtZoom(map, cam.zoomPercent());
    if (next.size === zoomHiddenCats.size && [...next].every((id) => zoomHiddenCats.has(id))) return;
    applyVisibility();
}

function targetZoomFor(el) {
    const lmap = cam.lmap;
    let z = Math.max(lmap.getZoom(), cam.fitZoom + 1);
    const cat = categoryById(map, el.categoryId);
    if (cat && (cat.zoomShow === 'in' || cat.zoomShow === 'out')) {
        const atZ = cam.zoomForPercent(cat.zoomAt || ZOOM_SHOW_DEFAULT_AT);
        if (cat.zoomShow === 'in') z = Math.max(z, Math.ceil(atZ * 4) / 4);
        else if (z >= atZ) z = Math.floor(atZ * 4) / 4 - 0.25;
    }
    return Math.max(lmap.getMinZoom(), Math.min(lmap.getMaxZoom(), z));
}

function goToElement(id) {
    const hit = findElement(id);
    if (!hit) return;
    if (hit.layer.id !== activeLayerId) switchLayer(hit.layer.id);
    const lay = elementLayers.get(id);
    if (!lay) return;
    const el = hit.el,
        a = elementAnchor(el);
    if (!isCategorized(el)) {
        cam.lmap.setView(toLatLng(a.x, a.y), targetZoomFor(el));
        setTimeout(() => glowElement(id), 300);
        return;
    }
    forcedVisibleId = id;
    applyVisibility();
    if (clusterGroup && el.type === 'marker' && clusterGroup.hasLayer(lay)) {
        clusterGroup.zoomToShowLayer(lay, () => {
            lay.openPopup();
            glowElement(id);
        });
        return;
    }
    cam.lmap.setView(toLatLng(a.x, a.y), targetZoomFor(el), { animate: true });
    setTimeout(() => {
        lay.openPopup();
        glowElement(id);
    }, 280);
}

function glowElement(id) {
    const node = elementLayers.get(id)?.getElement();
    if (!node) return;
    node.classList.remove('lf-glow');
    void node.getBoundingClientRect();
    node.classList.add('lf-glow');
    setTimeout(() => node.classList.remove('lf-glow'), 1900);
}
