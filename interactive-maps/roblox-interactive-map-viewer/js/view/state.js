// View state
let map = null;
let activeLayerId = null;

let cam = null;
const elementLayers = new Map();
let clusterGroup = null;

let filterState = {
    search: '',
    searchHits: null,
    hiddenCategories: new Set(),
    hideFound: false,
    hideAnnotations: false,
};

let zoomHiddenCats = new Set();

let foundIds = new Set();

let activeRouteId = null;

function activeLayer() {
    return map ? map.layers.find((l) => l.id === activeLayerId) || null : null;
}

function findElement(id) {
    for (const l of map.layers) {
        const el = l.elements.find((e) => e.id === id);
        if (el) return { el, layer: l };
    }
    return null;
}
