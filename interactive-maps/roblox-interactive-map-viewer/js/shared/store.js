// BACKEND: every function here is localStorage today and becomes an API call (see HANDOFF.md)
const PUBLISHED_MAPS_KEY = 'mapHubPublishedMaps';

function loadPublishedStore() {
    try {
        return JSON.parse(localStorage.getItem(PUBLISHED_MAPS_KEY)) || {};
    } catch (e) {
        return {};
    }
}
function savePublishedStore(store) {
    localStorage.setItem(PUBLISHED_MAPS_KEY, JSON.stringify(store));
}

const FOUND_KEY_PREFIX = 'mapHubFound:';

function loadFoundIds(mapId) {
    try {
        return JSON.parse(localStorage.getItem(FOUND_KEY_PREFIX + mapId)) || [];
    } catch (e) {
        return [];
    }
}
function saveFoundIds(mapId, ids) {
    try {
        localStorage.setItem(FOUND_KEY_PREFIX + mapId, JSON.stringify(ids));
    } catch (e) {}
}

const VIEW_PREFS_KEY_PREFIX = 'mapHubViewPrefs:';

function loadViewPrefs(mapId) {
    try {
        return JSON.parse(localStorage.getItem(VIEW_PREFS_KEY_PREFIX + mapId)) || {};
    } catch (e) {
        return {};
    }
}
function saveViewPrefs(mapId, prefs) {
    try {
        localStorage.setItem(VIEW_PREFS_KEY_PREFIX + mapId, JSON.stringify(prefs));
    } catch (e) {}
}

const VIEWER_MARKS_KEY_PREFIX = 'mapHubMine:';

function loadViewerMarks(mapId) {
    let data = null;
    try {
        data = JSON.parse(localStorage.getItem(VIEWER_MARKS_KEY_PREFIX + mapId));
    } catch (e) {}
    data = data && typeof data === 'object' ? data : {};
    return {
        markers: Array.isArray(data.markers) ? data.markers : [],
        routes: Array.isArray(data.routes) ? data.routes : [],
    };
}
function saveViewerMarks(mapId, data) {
    try {
        localStorage.setItem(VIEWER_MARKS_KEY_PREFIX + mapId, JSON.stringify(data));
        return true;
    } catch (e) {
        return false;
    }
}

const MAP_REPORTS_KEY = 'mapHubReports';

function appendLocalList(key, item) {
    let list = [];
    try {
        list = JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {}
    list.push(Object.assign({ createdAt: new Date().toISOString() }, item));
    try {
        localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {}
    return Promise.resolve();
}

function submitMapReport(report) {
    return appendLocalList(MAP_REPORTS_KEY, report);
}

const ELEMENT_FEEDBACK_KEY = 'mapHubElementFeedback';

function submitElementFeedback(feedback) {
    return appendLocalList(ELEMENT_FEEDBACK_KEY, feedback);
}

const MAKER_AUTOSAVE_KEY = 'mapMakerAutosaveDraft';
