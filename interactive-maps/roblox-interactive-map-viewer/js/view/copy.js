// Create a Copy: clone the map into a draft in the Maker
function wireCopyButton() {
    byId('view-copy-btn').addEventListener('click', createCopyAndEdit);
}

// BACKEND: create a draft server-side from the clone
function createCopyAndEdit() {
    if (!map) return;
    const clone = JSON.parse(JSON.stringify(map));
    delete clone.id;
    clone.title = 'Copy of ' + (map.title || 'Untitled Map');
    clone.status = 'draft';
    clone.createdAt = null;
    clone.updatedAt = null;
    try {
        localStorage.setItem(MAKER_AUTOSAVE_KEY, JSON.stringify(clone));
    } catch (e) {
        showToast('Couldn’t make a copy: your browser storage is full', 'fa-triangle-exclamation');
        return;
    }
    window.location.href = 'map-maker.html';
}
