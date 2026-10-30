// Map taxonomy + style resolution, shared by the Maker and View
const MAP_SCHEMA_VERSION = 1;
const STYLE_KEYS = [
    'icon',
    'color',
    'size',
    'opacity',
    'borderStyle',
    'markerShape',
    'bgColor',
    'outlineColor',
    'shadow',
    'halo',
    'fillColor',
    'fillOpacity',
    'borderColor',
    'borderOpacity',
    'borderWidth',
    'labelMode',
    'ground',
];
const DEFAULT_MARKER_ICON = 'game-icons:position-marker';
const DEFAULT_STYLE = {
    icon: DEFAULT_MARKER_ICON,
    color: '#ff6900',
    size: 100,
    opacity: 30,
    borderStyle: 'solid',
    markerShape: 'none',
    bgColor: '#181818',
    outlineColor: 'none',
    shadow: true,
};
const MARKER_SHAPES = [
    'none',
    'circle',
    'square',
    'pin',
    'square-pin',
    'drop',
    'diamond',
    'hexagon',
    'octagon',
    'shield',
];
const MARKER_LOOK_KEYS = ['markerShape', 'bgColor', 'outlineColor', 'shadow'];
// minZoom / maxZoom are zoom % as the controls show them (100% = the whole layer fits)
const DEFAULT_DISPLAY = {
    markerScaleOut: 70,
    markerScaleIn: 130,
    cluster: false,
    clusterBy: 'all',
    minZoom: 70,
    maxZoom: 1600,
};
const ZOOM_MIN_RANGE = [10, 400];
const ZOOM_MAX_RANGE = [200, 6400];
const clampNum = (v, lo, hi, fallback) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fallback);

const TEXT_STYLE_DEFAULTS = { color: '#ffffff', size: 100, halo: '#000000' };
const TYPE_STYLE_DEFAULTS = {
    label: TEXT_STYLE_DEFAULTS,
    area: Object.assign({}, TEXT_STYLE_DEFAULTS, {
        size: 110,
        fillColor: '#ffffff',
        fillOpacity: 6,
        borderColor: '#ffffff',
        borderOpacity: 40,
        borderWidth: 1.5,
        borderStyle: 'solid',
        labelMode: 'always',
        ground: 'none',
    }),
    object: { icon: 'game-icons:house', color: '#e3d9c6', size: 200, shadow: true },
};
const AREA_LABEL_MODES = ['always', 'hover', 'none'];

const GROUND_TYPES = {
    grass: { label: 'Grass', color: '#4f7d3a' },
    dirt: { label: 'Dirt', color: '#6e5136' },
    sand: { label: 'Sand', color: '#d6c08a' },
    water: { label: 'Water', color: '#2f6b9a' },
    stone: { label: 'Stone', color: '#77777d' },
    tiles: { label: 'Floor tiles', color: '#8a8478' },
    wood: { label: 'Wood floor', color: '#8a5b35' },
    snow: { label: 'Snow', color: '#e6edf1' },
    lava: { label: 'Lava', color: '#c4410f' },
    roof: { label: 'Roof', color: '#7c3f30' },
};
const GROUND_AREA_STYLE = {
    fillOpacity: 100,
    borderColor: '#000000',
    borderOpacity: 25,
    borderWidth: 1.5,
    labelMode: 'none',
};
function isGroundArea(el) {
    return el.type === 'area' && !!(el.style && GROUND_TYPES[el.style.ground]);
}

function isDrawingElement(el) {
    return el.type === 'object' || isGroundArea(el);
}

const DRAW_RANKS = { area: 1, zone: 2, object: 3, label: 4, marker: 5 };
function elementsInDrawOrder(elements) {
    const rank = (el) => (isGroundArea(el) ? 0 : (DRAW_RANKS[el.type] ?? 5));
    return elements.slice().sort((a, b) => rank(a) - rank(b));
}

const OBJECT_PRESETS = {
    house: { label: 'House', icon: 'game-icons:house' },
    cabin: { label: 'Cabin', icon: 'game-icons:wood-cabin' },
    barn: { label: 'Barn', icon: 'game-icons:barn' },
    castle: { label: 'Castle', icon: 'game-icons:castle' },
    tower: { label: 'Tower', icon: 'game-icons:stone-tower' },
    church: { label: 'Church', icon: 'game-icons:church' },
    pine: { label: 'Pine tree', icon: 'game-icons:pine-tree' },
    oak: { label: 'Tree', icon: 'game-icons:oak' },
    palm: { label: 'Palm tree', icon: 'game-icons:palm-tree' },
    cactus: { label: 'Cactus', icon: 'game-icons:cactus' },
    flowers: { label: 'Flowers', icon: 'game-icons:flowers' },
    rock: { label: 'Rock', icon: 'game-icons:rock' },
    stones: { label: 'Stones', icon: 'game-icons:stone-pile' },
    well: { label: 'Well', icon: 'game-icons:well' },
    bridge: { label: 'Bridge', icon: 'game-icons:stone-bridge' },
    fence: { label: 'Fence', icon: 'game-icons:wooden-fence' },
    campfire: { label: 'Campfire', icon: 'game-icons:campfire' },
    crate: { label: 'Crate', icon: 'game-icons:wooden-crate' },
};

const CATEGORIZED_TYPES = ['marker', 'zone'];
function isCategorized(el) {
    return CATEGORIZED_TYPES.includes(el.type);
}

const STYLE_KEYS_BY_TYPE = {
    marker: ['icon', 'color', 'size', 'markerShape', 'bgColor', 'outlineColor', 'shadow'],
    zone: ['color', 'opacity', 'borderStyle'],
    label: ['color', 'size', 'halo'],
    area: [
        'color',
        'size',
        'halo',
        'fillColor',
        'fillOpacity',
        'borderColor',
        'borderOpacity',
        'borderWidth',
        'borderStyle',
        'labelMode',
        'ground',
    ],
    object: ['icon', 'color', 'size', 'shadow'],
};
const ELEMENT_TYPE_LABELS = { marker: 'Marker', zone: 'Zone', label: 'Label', area: 'Area', object: 'Object' };

// Lookups

function categoryById(m, id) {
    return (m.categories || []).find((c) => c.id === id) || null;
}
function groupById(m, id) {
    return id ? (m.groups || []).find((g) => g.id === id) || null : null;
}
function categoryByName(m, name) {
    const n = (name || '').trim().toLowerCase();
    return (m.categories || []).find((c) => c.name.toLowerCase() === n) || null;
}
function groupByName(m, name) {
    const n = (name || '').trim().toLowerCase();
    return (m.groups || []).find((g) => g.name.toLowerCase() === n) || null;
}

function resolveStyle(m, el) {
    const out = Object.assign({}, DEFAULT_STYLE, TYPE_STYLE_DEFAULTS[el.type] || {});
    const cat = isCategorized(el) ? categoryById(m, el.categoryId) : null;
    if (cat)
        STYLE_KEYS.forEach((k) => {
            if (cat[k] != null && cat[k] !== '') out[k] = cat[k];
        });
    if (el.style)
        STYLE_KEYS.forEach((k) => {
            if (el.style[k] != null && el.style[k] !== '') out[k] = el.style[k];
        });
    return out;
}

function inheritedStyleValue(m, el, key) {
    const cat = isCategorized(el) ? categoryById(m, el.categoryId) : null;
    if (cat && cat[key] != null && cat[key] !== '') return cat[key];
    const t = TYPE_STYLE_DEFAULTS[el.type];
    return t && t[key] != null ? t[key] : DEFAULT_STYLE[key];
}

function isElementTrackable(m, el) {
    if (!isCategorized(el)) return false;
    if (typeof el.trackable === 'boolean') return el.trackable;
    const cat = categoryById(m, el.categoryId);
    return !!(cat && cat.trackable);
}

function hasStyleOverride(el, key) {
    return !!(el.style && el.style[key] != null && el.style[key] !== '');
}

function categoryCounts(m, layer) {
    const counts = new Map();
    (layer ? [layer] : m.layers).forEach((l) =>
        l.elements.forEach((el) => {
            if (!isCategorized(el)) return;
            counts.set(el.categoryId, (counts.get(el.categoryId) || 0) + 1);
        })
    );
    return counts;
}

// Zoom-based visibility

const ZOOM_SHOW_MODES = ['always', 'out', 'in'];
const ZOOM_SHOW_DEFAULT_AT = 200;

function categoryVisibleAtZoom(cat, pct) {
    if (!cat || (cat.zoomShow !== 'in' && cat.zoomShow !== 'out')) return true;
    const at = cat.zoomAt || ZOOM_SHOW_DEFAULT_AT;
    return cat.zoomShow === 'in' ? pct >= at * 0.995 : pct < at * 0.995;
}

function categoriesHiddenAtZoom(m, pct) {
    return new Set((m.categories || []).filter((c) => !categoryVisibleAtZoom(c, pct)).map((c) => c.id));
}

// Popup media

function videoEmbedInfo(url) {
    const u = (url || '').trim();
    if (!/^https?:\/\//i.test(u)) return null;
    const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
    if (yt)
        return {
            embed: 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?autoplay=1&rel=0',
            thumb: 'https://i.ytimg.com/vi/' + yt[1] + '/hqdefault.jpg',
            site: 'YouTube',
        };
    const st = u.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i);
    if (st) return { embed: 'https://streamable.com/e/' + st[1] + '?autoplay=1', thumb: '', site: 'Streamable' };
    return { link: u };
}

// Mutations

function ensureGroupByName(m, name) {
    const clean = (name || '').trim();
    if (!clean) return null;
    let g = groupByName(m, clean);
    if (!g) {
        g = { id: uid('grp-'), name: clean, icon: 'folder' };
        m.groups.push(g);
    }
    return g;
}

function createCategory(m, fields) {
    const f = fields || {};
    const g = f.group ? ensureGroupByName(m, f.group) : null;
    const cat = {
        id: uid('cat-'),
        name: (f.name || 'New category').trim(),
        groupId: g ? g.id : f.groupId || null,
        icon: f.icon || DEFAULT_STYLE.icon,
        color: f.color || DEFAULT_STYLE.color,
        size: f.size || DEFAULT_STYLE.size,
        opacity: f.opacity != null ? f.opacity : DEFAULT_STYLE.opacity,
        borderStyle: f.borderStyle || DEFAULT_STYLE.borderStyle,
    };
    MARKER_LOOK_KEYS.forEach((k) => {
        if (f[k] != null) cat[k] = f[k];
    });
    if (f.trackable) cat.trackable = true;
    m.categories.push(cat);
    return cat;
}

function ensureCategoryByName(m, name, fields) {
    return categoryByName(m, name) || createCategory(m, Object.assign({}, fields, { name }));
}

// Normalization

// Fills in missing arrays/defaults and repairs dangling references
function normalizeMap(m) {
    if (!m || !Array.isArray(m.layers)) return m;
    m.layers.forEach((l) => {
        if (!Array.isArray(l.elements)) l.elements = [];
    });
    if (!Array.isArray(m.categories)) m.categories = [];
    if (!Array.isArray(m.groups)) m.groups = [];
    if (!Array.isArray(m.routes)) m.routes = [];
    if (!Array.isArray(m.descriptionBlocks)) m.descriptionBlocks = [];
    m.display = Object.assign({}, DEFAULT_DISPLAY, m.display || {});
    if (m.display.clusterBy !== 'category') m.display.clusterBy = 'all';
    m.display.minZoom = clampNum(m.display.minZoom, ...ZOOM_MIN_RANGE, DEFAULT_DISPLAY.minZoom);
    m.display.maxZoom = clampNum(m.display.maxZoom, ...ZOOM_MAX_RANGE, DEFAULT_DISPLAY.maxZoom);

    const ids = new Set(m.categories.map((c) => c.id));
    let fallback = null;
    m.layers.forEach((l) =>
        l.elements.forEach((el) => {
            if (!isCategorized(el) || ids.has(el.categoryId)) return;
            fallback = fallback || ensureCategoryByName(m, 'Uncategorized', { icon: 'circle', color: '#9ca3af' });
            ids.add(fallback.id);
            el.categoryId = fallback.id;
        })
    );

    m.layers.forEach((l) => {
        if (l.parentId && (!layerById(m, l.parentId) || l.parentId === l.id)) delete l.parentId;
    });
    m.layers.forEach((l) => {
        if (l.parentId && layerChain(m, l.parentId).some((x) => x.id === l.id)) delete l.parentId;
    });
    m.schemaVersion = MAP_SCHEMA_VERSION;
    pruneRoutes(m);
    return m;
}

// Sub-layers

function layerById(m, id) {
    return id ? (m.layers || []).find((l) => l.id === id) || null : null;
}

function layerChain(m, layerId) {
    const out = [],
        seen = new Set();
    let l = layerById(m, layerId);
    while (l && !seen.has(l.id)) {
        out.push(l);
        seen.add(l.id);
        l = layerById(m, l.parentId);
    }
    return out;
}

function childLayers(m, parentId) {
    return (m.layers || []).filter((l) => (l.parentId || null) === (parentId || null));
}

function canNestLayer(m, layerId, parentId) {
    return !parentId || !layerChain(m, parentId).some((l) => l.id === layerId);
}

function layerPathName(m, layer) {
    return layerChain(m, layer.id)
        .reverse()
        .map((l) => l.name)
        .join(' › ');
}

function layerTabRows(m, activeId) {
    const chain = layerChain(m, activeId).reverse();
    const rows = [{ parentId: null, layers: childLayers(m, null), activeId: chain[0] ? chain[0].id : null }];
    chain.forEach((l, i) => {
        const kids = childLayers(m, l.id);
        if (kids.length) rows.push({ parentId: l.id, layers: kids, activeId: chain[i + 1] ? chain[i + 1].id : null });
    });
    return rows;
}

// Routes

const ROUTE_COLORS = ['#38bdf8', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#fcb900', '#ec4899'];

function newRoute(m, layerId) {
    const n = (m.routes || []).length;
    return {
        id: uid('route-'),
        layerId,
        name: 'Route ' + (n + 1),
        description: '',
        color: ROUTE_COLORS[n % ROUTE_COLORS.length],
        width: 100,
        loop: false,
        points: [],
    };
}

function routeLayerRoutes(m, layerId) {
    return (m.routes || []).filter((r) => r.layerId === layerId);
}

function routeStopIds(route) {
    return (route.points || []).filter((p) => p.elementId).map((p) => p.elementId);
}

function routeCoords(m, route) {
    const layer = m.layers.find((l) => l.id === route.layerId);
    if (!layer) return [];
    const out = [];
    (route.points || []).forEach((p) => {
        if (p.elementId) {
            const el = layer.elements.find((e) => e.id === p.elementId);
            if (el) {
                const a = elementAnchor(el);
                out.push({ x: a.x, y: a.y, elementId: el.id, el });
            }
        } else if (typeof p.x === 'number' && typeof p.y === 'number') {
            out.push({ x: p.x, y: p.y });
        }
    });
    return out;
}

// What a published map or map file holds: no trace images, nothing the author kept off the live map
// (element.unpublished). Route stops on those become plain bends, so the line keeps its shape.
function publishedCopy(m) {
    const off = new Map();
    const layers = m.layers.map(({ traceUrl, traceOpacity, ...l }) => {
        const kept = l.elements.filter((e) => {
            if (e.unpublished) off.set(e.id, elementAnchor(e));
            return !e.unpublished;
        });
        return Object.assign(l, { elements: kept });
    });
    const routes = (m.routes || []).map((r) =>
        Object.assign({}, r, {
            points: (r.points || []).map((p) => (off.has(p.elementId) ? Object.assign({}, off.get(p.elementId)) : p)),
        })
    );
    return Object.assign({}, m, { layers, routes });
}

// Keeps routes valid
function pruneRoutes(m) {
    let changed = false;
    const layers = new Map(m.layers.map((l) => [l.id, l]));
    const before = (m.routes || []).length;
    m.routes = (m.routes || []).filter((r) => layers.has(r.layerId));
    if (m.routes.length !== before) changed = true;
    m.routes.forEach((r) => {
        if (!Array.isArray(r.points)) r.points = [];
        const layer = layers.get(r.layerId);
        const kept = r.points.filter((p) => {
            if (!p.elementId) return typeof p.x === 'number' && typeof p.y === 'number';
            const el = layer.elements.find((e) => e.id === p.elementId);
            return !!el && (el.type === 'marker' || el.type === 'zone');
        });
        if (kept.length !== r.points.length) {
            r.points = kept;
            changed = true;
        }
    });
    return changed;
}

// Rendering helpers

function isImageIcon(icon) {
    return /^(https?:)?\/\//.test(icon || '') || (icon || '').indexOf('data:') === 0;
}
function isIconifyIcon(icon) {
    return /^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/.test(icon || '');
}
function mapUsesGameIcons(m) {
    const uses = (icon) => (icon || '').indexOf('game-icons:') === 0;
    return (
        (m.categories || []).some((c) => uses(c.icon)) ||
        (m.groups || []).some((g) => uses(g.icon)) ||
        (m.layers || []).some((l) => l.elements.some((el) => el.style && uses(el.style.icon)))
    );
}

function normalizeIconInput(val) {
    const v = (val || '').trim();
    if (!v || isImageIcon(v) || isIconifyIcon(v.toLowerCase()))
        return isIconifyIcon(v.toLowerCase()) ? v.toLowerCase() : v;
    const m = v.match(/(?:^|\s)fa-([a-z0-9-]+)\s*$/);
    return m ? m[1] : v.toLowerCase();
}

function iconSpecHtml(icon, cls, style) {
    if (!icon) return '';
    const extra = (cls ? ' class="' + cls + '"' : '') + (style ? ' style="' + escapeHtml(style) + '"' : '');
    if (isImageIcon(icon)) {
        return '<img src="' + escapeHtml(icon) + '" alt=""' + extra + '>';
    }
    if (isIconifyIcon(icon)) {
        return '<iconify-icon icon="' + escapeHtml(icon) + '" aria-hidden="true"' + extra + '></iconify-icon>';
    }
    const fa = icon.indexOf('fa-') !== -1 ? icon : 'fas fa-' + icon;
    return (
        '<i class="' +
        escapeHtml(fa) +
        (cls ? ' ' + cls : '') +
        '"' +
        (style ? ' style="' + escapeHtml(style) + '"' : '') +
        '></i>'
    );
}
