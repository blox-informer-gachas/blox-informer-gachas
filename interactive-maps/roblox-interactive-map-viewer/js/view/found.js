// Mark as found
function isTrackable(el) {
    return isElementTrackable(map, el);
}

function loadFoundState() {
    const valid = new Set();
    map.layers.forEach((l) =>
        l.elements.forEach((el) => {
            if (isTrackable(el)) valid.add(el.id);
        })
    );
    foundIds = new Set(loadFoundIds(map.id).filter((id) => valid.has(id)));
}

function toggleFound(id) {
    if (foundIds.has(id)) foundIds.delete(id);
    else foundIds.add(id);
    saveFoundIds(map.id, Array.from(foundIds));
    const hit = findElement(id);
    if (hit) paintElementState(hit.el);
    if (filterState.hideFound) {
        if (cam.lmap._popup && cam.lmap._popup.isOpen()) cam.lmap.once('popupclose', applyVisibility);
        else applyVisibility();
    }
    renderFoundSettings();
    paintFilterTree();
    renderRouteSection();
}

function resetFound() {
    foundIds.clear();
    saveFoundIds(map.id, []);
    applyVisibility();
    renderFoundSettings();
    paintFilterTree();
    renderRouteSection();
    showToast('Progress reset for this map', 'fa-rotate-left');
}

function renderFoundSettings() {
    const any = map.layers.some((l) => l.elements.some(isTrackable));
    byId('found-settings').classList.toggle('hidden', !any);
    byId('found-reset').classList.toggle('hidden', foundIds.size === 0);
}

function wireFoundControls() {
    byId('filter-hide-found').checked = filterState.hideFound;
    byId('filter-hide-found').addEventListener('change', (e) => {
        filterState.hideFound = e.target.checked;
        cam.lmap.closePopup();
        applyVisibility();
        saveCurrentViewPrefs();
    });
    byId('found-reset').addEventListener('click', resetFound);
    renderFoundSettings();
}
