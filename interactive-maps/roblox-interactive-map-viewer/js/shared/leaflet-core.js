// Leaflet camera and element rendering, shared by Maker and View
const ZOOM_IN_RANGE = 3;
const ZOOM_SNAP = 0.25;
const ZOOM_NATIVE_MAX = 1; // zoom 1 = 200% of the image's own pixels; a big image can always reach it

// Zoom limits as Leaflet zoom levels. The settings are % (100% = layer fits); a big image can always reach 200% of its own size.
// The map zooms in quarter levels, so the max is rounded down to one it can actually stop on.
function zoomLimitsFor(display, fitZoom) {
    const d = display || DEFAULT_DISPLAY;
    const snap = ZOOM_SNAP;
    const max = fitZoom + Math.log2((d.maxZoom || DEFAULT_DISPLAY.maxZoom) / 100);
    return {
        min: fitZoom + Math.log2((d.minZoom || DEFAULT_DISPLAY.minZoom) / 100),
        max: Math.max(Math.floor(max / snap + 0.01) * snap, ZOOM_NATIVE_MAX),
    };
}
const MARKER_BASE_PX = 40;
const MARKER_MAX_PX = 2000;
const LABEL_BASE_PX = 15;
const ROUTE_BASE_WEIGHT = 4;
const ELLIPSE_STEPS = 48;
const ROUTE_DASH_GROWTH = 0.75;

// L.Marker that keeps its exact (fractional) screen position
const MANY_MARKERS = 500;
const SubpixelMarker = L.Marker.extend({
    update() {
        if (this._icon && this._map)
            this._setPos(this._map.project(this._latlng)._subtract(this._map.getPixelOrigin()));
        return this;
    },
    _animateZoom(opt) {
        this._setPos(this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center));
    },
    _updateZIndex(offset) {
        if (this._icon) this._icon.style.zIndex = Math.round(this._zIndex + offset);
    },
    // 2D translate: Leaflet's translate3d made every marker its own GPU layer, which halved the frame rate of big maps
    _setPos(pos) {
        this._icon._leaflet_pos = pos;
        this._icon.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
        this._zIndex = pos.y + this.options.zIndexOffset;
        this._resetZIndex();
    },
});

function toLatLng(x, y) {
    return L.latLng(-y, x);
}
function fromLatLng(ll) {
    return { x: ll.lng, y: -ll.lat };
}
function layerBounds(layer) {
    return L.latLngBounds(toLatLng(0, layer.backgroundHeight), toLatLng(layer.backgroundWidth, 0));
}

// Smooth wheel zoom

function enableSmoothWheelZoom(lmap) {
    const PER_WHEEL_UNIT = 0.006;
    const EASE_MS = 70;
    const el = lmap.getContainer();
    let goal = 0,
        raf = 0,
        last = 0,
        wheeling = false,
        started = false,
        endTimer = 0,
        finishing = false;
    let mouse = null,
        mouseLL = null;

    const clampZoom = (z) => Math.max(lmap.getMinZoom(), Math.min(lmap.getMaxZoom(), z));

    function finish() {
        wheeling = finishing = false;
        if (started) {
            started = false;
            lmap._moveEnd(true);
        }
    }

    function frame(now) {
        raf = 0;
        if (lmap._animatingZoom) {
            wheeling = finishing = started = false;
            return;
        }
        const dt = Math.min(50, now - last);
        last = now;
        const cur = lmap.getZoom();
        let z = cur + (goal - cur) * (1 - Math.exp(-dt / EASE_MS));
        if (Math.abs(goal - z) < 0.003) z = goal;
        const offset = mouse.subtract(lmap.getSize().divideBy(2));
        const center = lmap._limitCenter(
            lmap.unproject(lmap.project(mouseLL, z).subtract(offset), z),
            z,
            lmap.options.maxBounds
        );
        if (!started) {
            lmap._moveStart(true, false);
            started = true;
        }
        lmap._move(center, z);
        if (z !== goal) raf = requestAnimationFrame(frame);
        else if (finishing) finish();
    }

    // one getAnimations call for the whole map: each call forces a style recalc (one per marker froze big maps)
    function cutLeftoverZoomTransitions() {
        el.getAnimations({ subtree: true }).forEach((a) => {
            if (a.transitionProperty === 'transform' && a.effect?.target?.classList.contains('leaflet-zoom-animated'))
                a.cancel();
        });
    }
    lmap.on('zoomend', cutLeftoverZoomTransitions);
    lmap.on('zoomanim', () => {
        void el.offsetWidth;
    });

    el.addEventListener(
        'wheel',
        (e) => {
            if (e.target.closest('.leaflet-control, .leaflet-popup')) return;
            if (lmap.wheelGuard && lmap.wheelGuard(e)) return;
            e.preventDefault();
            if (lmap._animatingZoom) lmap._onZoomTransitionEnd();
            if (!wheeling) {
                lmap._stop();
                wheeling = true;
                goal = lmap.getZoom();
            }
            finishing = false;
            goal = clampZoom(goal + L.DomEvent.getWheelDelta(e) * PER_WHEEL_UNIT);
            mouse = lmap.mouseEventToContainerPoint(e);
            mouseLL = lmap.containerPointToLatLng(mouse);
            clearTimeout(endTimer);
            endTimer = setTimeout(() => {
                finishing = true;
                if (!raf) finish();
            }, 140);
            if (!raf) {
                last = performance.now();
                raf = requestAnimationFrame(frame);
            }
        },
        { passive: false }
    );
}

// Ground textures

const GROUND_TILE = 40;
const GROUND_TILES = {
    grass:
        '<path d="M6 15l2-6 2 6M22 31l2-6 2 6M31 11l2-5 2 5M11 36l1.5-4 1.5 4" stroke="rgba(0,0,0,.3)" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M16 22l1.5-4 1.5 4M34 27l1.5-4 1.5 4M2 29l1.5-4 1.5 4" stroke="rgba(255,255,255,.2)" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    dirt:
        '<g fill="rgba(0,0,0,.3)"><circle cx="7" cy="8" r="1.6"/><circle cx="27" cy="14" r="1.2"/><circle cx="16" cy="29" r="1.8"/><circle cx="35" cy="34" r="1.3"/></g>' +
        '<g fill="rgba(255,255,255,.14)"><circle cx="20" cy="5" r="1.2"/><circle cx="4" cy="23" r="1.3"/><circle cx="31" cy="25" r="1"/></g>',
    sand:
        '<g fill="rgba(0,0,0,.18)"><circle cx="5" cy="6" r=".9"/><circle cx="19" cy="13" r=".8"/><circle cx="33" cy="7" r=".9"/><circle cx="11" cy="25" r=".8"/><circle cx="27" cy="31" r=".9"/><circle cx="37" cy="21" r=".8"/></g>' +
        '<g fill="rgba(255,255,255,.3)"><circle cx="14" cy="4" r=".8"/><circle cx="28" cy="19" r=".8"/><circle cx="4" cy="35" r=".8"/><circle cx="20" cy="37" r=".7"/></g>',
    water:
        '<path d="M0 12q5-4 10 0t10 0t10 0t10 0" stroke="rgba(255,255,255,.2)" stroke-width="1.3" fill="none"/>' +
        '<path d="M-5 32q5-4 10 0t10 0t10 0t10 0t10 0" stroke="rgba(255,255,255,.12)" stroke-width="1.3" fill="none"/>',
    stone:
        '<path d="M0 .5h40M0 13.5h40M0 26.5h40M20 0v13.5M10 13.5v13M30 13.5v13M20 26.5v13.5" stroke="rgba(0,0,0,.32)" stroke-width="1.3" fill="none"/>' +
        '<path d="M3 3h6M23 16h5M13 29h6" stroke="rgba(255,255,255,.14)" stroke-width="1.2"/>',
    tiles:
        '<path d="M0 .5h40M0 20.5h40M.5 0v40M20.5 0v40" stroke="rgba(0,0,0,.28)" stroke-width="1.2" fill="none"/>' +
        '<path d="M2 2.5h16M22 22.5h16" stroke="rgba(255,255,255,.12)" stroke-width="1"/>',
    wood:
        '<path d="M0 .5h40M0 10.5h40M0 20.5h40M0 30.5h40M14 0v10M32 10v10M6 20v10M24 30v10" stroke="rgba(0,0,0,.32)" stroke-width="1.2" fill="none"/>' +
        '<path d="M2 5h9M18 15h10M10 25h12M28 35h9" stroke="rgba(0,0,0,.12)" stroke-width="1"/>',
    snow:
        '<g fill="rgba(255,255,255,.75)"><circle cx="8" cy="9" r="1.2"/><circle cx="29" cy="17" r="1"/><circle cx="17" cy="32" r="1.3"/></g>' +
        '<g fill="rgba(90,120,150,.18)"><circle cx="34" cy="5" r="1.1"/><circle cx="4" cy="27" r="1"/><circle cx="25" cy="37" r="1"/></g>',
    lava:
        '<rect width="40" height="40" fill="rgba(0,0,0,.34)"/>' +
        '<path d="M0 14L12 10L20 18L32 12L40 14M12 10L10 0M32 12L34 0M20 18L18 30L8 34L0 30M18 30L30 32L40 30M30 32L34 40M8 34L10 40" stroke="rgba(255,190,80,.8)" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
};

function safeSvgColor(c) {
    return String(c || '#888').replace(/[^#\w]/g, '');
}

GROUND_TILES.roof =
    '<path d="' +
    [0, 10, 20, 30, 40]
        .map((y) => 'M' + (y % 20 ? -5 : 0) + ' ' + y + 'q5 7 10 0'.repeat(1) + 'q5 7 10 0'.repeat(4))
        .join('') +
    '" stroke="rgba(0,0,0,.35)" stroke-width="1.2" fill="none"/>';

function groundTileSvg(kind, color) {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
        '<rect width="40" height="40" fill="' +
        safeSvgColor(color) +
        '"/>' +
        GROUND_TILES[kind] +
        '</svg>'
    );
}

function groundSwatchHtml(kind, color) {
    const c = safeSvgColor(color || (GROUND_TYPES[kind] && GROUND_TYPES[kind].color) || '#333');
    const bg = GROUND_TILES[kind]
        ? 'url(&quot;data:image/svg+xml,' + encodeURIComponent(groundTileSvg(kind, c)) + '&quot;) 0 0/14px 14px, '
        : '';
    return (
        '<span class="inline-block w-3.5 h-3.5 rounded-[4px] border border-white/20 flex-none" style="background:' +
        bg +
        c +
        '"></span>'
    );
}

// Zone/area/route renderer

function createImageSpaceRenderer() {
    const HUGE = L.bounds([-1e9, -1e9], [1e9, 1e9]);
    const rings = (ll) => (ll.length && ll[0] instanceof L.LatLng ? [ll] : ll.flatMap(rings));
    const Renderer = L.SVG.extend({
        options: { padding: 0 },
        setImageBounds(b) {
            this._imgBounds = b;
            this._reset();
        },
        getEvents() {
            const ev = { viewreset: this._reset, zoom: this._reset };
            if (this._zoomAnimated) ev.zoomanim = this._onAnimZoom;
            return ev;
        },
        _initContainer() {
            L.SVG.prototype._initContainer.call(this);
            this._container.setAttribute('preserveAspectRatio', 'none');
            this._container.style.overflow = 'visible';
        },
        _update() {
            this._bounds = HUGE;
            this._reset();
        },
        _reset() {
            const b = this._imgBounds,
                c = this._container;
            if (!b || !c || !this._map) return;
            const nw = this._map.latLngToLayerPoint(b.getNorthWest());
            const size = this._map.latLngToLayerPoint(b.getSouthEast()).subtract(nw);
            c.setAttribute('viewBox', '0 0 ' + b.getEast() + ' ' + -b.getSouth());
            c.style.width = size.x + 'px';
            c.style.height = size.y + 'px';
            L.DomUtil.setPosition(c, nw);
        },
        _onAnimZoom(e) {
            const b = this._imgBounds;
            if (!b || !this._container) return;
            L.DomUtil.setTransform(
                this._container,
                this._map._latLngBoundsToNewLayerBounds(b, e.zoom, e.center).min,
                this._map.getZoomScale(e.zoom)
            );
        },
        _updateStyle(layer) {
            L.SVG.prototype._updateStyle.call(this, layer);
            const kind = layer.options.ground;
            if (!kind || !GROUND_TILES[kind] || !layer._path || !this._container) return;
            const b = this._imgBounds,
                k = b ? Math.max(1, Math.max(b.getEast(), -b.getSouth()) / 1600) : 1;
            const color = safeSvgColor(layer.options.fillColor);
            const id = 'ground-' + kind + '-' + color.replace('#', '') + '-' + k.toFixed(2).replace('.', '_');
            if (!this._container.querySelector('#' + id)) {
                const NS = 'http://www.w3.org/2000/svg';
                let defs = this._container.querySelector('defs');
                if (!defs) {
                    defs = document.createElementNS(NS, 'defs');
                    this._container.insertBefore(defs, this._container.firstChild);
                }
                const pattern = document.createElementNS(NS, 'pattern');
                pattern.setAttribute('id', id);
                pattern.setAttribute('patternUnits', 'userSpaceOnUse');
                pattern.setAttribute('width', GROUND_TILE * k);
                pattern.setAttribute('height', GROUND_TILE * k);
                pattern.innerHTML =
                    '<g transform="scale(' +
                    k +
                    ')"><rect width="40" height="40" fill="' +
                    color +
                    '"/>' +
                    GROUND_TILES[kind] +
                    '</g>';
                defs.appendChild(pattern);
            }
            layer._path.setAttribute('fill', 'url(#' + id + ')');
        },
        _updatePoly(layer, closed) {
            let d = '';
            for (const ring of rings(layer._latlngs)) {
                ring.forEach((p, i) => {
                    d += (i ? 'L' : 'M') + p.lng + ' ' + -p.lat;
                });
                if (closed && ring.length) d += 'Z';
            }
            this._setPath(layer, d || 'M0 0');
        },
    });
    return new Renderer();
}

// Camera

function createLeafletCamera(containerEl, opts) {
    const lmap = L.map(containerEl, {
        crs: L.CRS.Simple,
        zoomControl: false,
        attributionControl: false,
        zoomSnap: ZOOM_SNAP,
        zoomDelta: 0.5,
        scrollWheelZoom: false,
        maxBoundsViscosity: 0.85,
        bounceAtZoomLimits: false,
        boxZoom: false,
        doubleClickZoom: !opts.grid,
        renderer: createImageSpaceRenderer(),
    });
    enableSmoothWheelZoom(lmap);
    lmap.createPane('bgPane').style.zIndex = 200;
    lmap.createPane('decorPane').style.zIndex = 430;
    lmap.createPane('handlePane').style.zIndex = 650;

    const cam = {
        lmap,
        fitZoom: 0,
        stayFitted: true,
        background: null,
        gridOverlay: null,
        gridVisible: !!opts.grid,
    };
    let fitting = false;

    cam.padding = function () {
        const p = opts.getPadding ? opts.getPadding() : { left: 0, right: 0 };
        return { paddingTopLeft: [p.left + 16, 16], paddingBottomRight: [p.right + 16, 16] };
    };

    cam.fit = function (animate, frame) {
        const layer = opts.getLayer();
        if (!layer) return;
        const bounds = layerBounds(layer);
        const pad = cam.padding();
        lmap.options.minZoom = -20;
        lmap.options.maxZoom = 20;
        const padSize = L.point(pad.paddingTopLeft).add(pad.paddingBottomRight);
        const containZoom = lmap.getBoundsZoom(bounds, false, padSize);
        const size = lmap.getSize();
        const fill =
            size.x > 0 && size.x < 720
                ? Math.min(lmap.getBoundsZoom(bounds, true, padSize), containZoom + 1.6)
                : containZoom;
        cam.filling = fill > containZoom + 0.05;
        cam.fitZoom = cam.filling ? Math.ceil(fill / lmap.options.zoomSnap) * lmap.options.zoomSnap : containZoom;
        const lim = zoomLimitsFor(opts.getDisplay ? opts.getDisplay() : null, cam.fitZoom);
        const minZoom = cam.filling ? Math.min(lim.min, containZoom - 0.25) : lim.min;
        const maxZoom = lim.max;
        lmap.options.renderer.setImageBounds(bounds);
        if (frame !== false) {
            lmap.setMaxBounds(null);
            lmap.options.minZoom = minZoom;
            lmap.options.maxZoom = maxZoom;
            fitting = true;
            if (cam.filling) lmap.setView(bounds.getCenter(), cam.fitZoom, { animate: !!animate });
            else lmap.fitBounds(bounds, Object.assign({ animate: !!animate }, pad));
            fitting = false;
            cam.stayFitted = true;
            const limit = () => {
                cam.limitBounds = bounds.pad(0.35).extend(lmap.getBounds());
                lmap.setMaxBounds(cam.limitBounds);
            };
            if (animate) lmap.once('moveend', limit);
            else limit();
            lmap.fire('zoomlevelschange');
        } else {
            lmap.setMinZoom(minZoom);
            lmap.setMaxZoom(maxZoom);
            lmap.setMaxBounds(cam.limitBounds && cam.limitBounds.contains(bounds) ? cam.limitBounds : bounds.pad(0.35));
        }
        cam.applyZoomStyles(lmap.getZoom());
    };

    cam.zoomPercent = function (zoom) {
        return Math.pow(2, (zoom == null ? lmap.getZoom() : zoom) - cam.fitZoom) * 100;
    };
    cam.zoomForPercent = function (pct) {
        return cam.fitZoom + Math.log2(pct / 100);
    };

    cam.markerScaleAt = function (zoom) {
        const d = opts.getDisplay() || DEFAULT_DISPLAY;
        const t = Math.max(0, Math.min(1, (zoom - cam.fitZoom) / ZOOM_IN_RANGE));
        const narrow = Math.max(0.6, Math.min(1, containerEl.clientWidth / 900));
        return ((d.markerScaleOut + (d.markerScaleIn - d.markerScaleOut) * t) / 100) * narrow;
    };

    cam.applyZoomStyles = function (zoom) {
        containerEl.style.setProperty('--marker-scale', cam.markerScaleAt(zoom).toFixed(3));
        containerEl.style.setProperty('--map-scale', Math.pow(2, zoom).toFixed(4));
        containerEl.style.setProperty(
            '--route-dash',
            Math.pow(2, Math.max(0, zoom - cam.fitZoom) * ROUTE_DASH_GROWTH).toFixed(3)
        );
        if (opts.zoomLabel) opts.zoomLabel.textContent = Math.round(cam.zoomPercent(zoom)) + '%';
    };

    cam.showLayer = function (layer) {
        cam.setBackground(layer);
        cam.fit(false);
    };

    cam.setBackground = function (layer) {
        if (cam.background) {
            cam.background.remove();
            cam.background = null;
        }
        if (layer.backgroundUrl) {
            cam.background = L.imageOverlay(layer.backgroundUrl, layerBounds(layer), {
                pane: 'bgPane',
                className: 'shadow-[0_0_0_1px_#262626,0_20px_60px_rgba(0,0,0,0.5)]',
            }).addTo(lmap);
        } else if (layer.backgroundColor === 'transparent') {
            if (opts.showBounds) {
                const svg =
                    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
                    layer.backgroundWidth +
                    '" height="' +
                    layer.backgroundHeight +
                    '" viewBox="0 0 ' +
                    layer.backgroundWidth +
                    ' ' +
                    layer.backgroundHeight +
                    '"><rect x="1" y="1" width="' +
                    (layer.backgroundWidth - 2) +
                    '" height="' +
                    (layer.backgroundHeight - 2) +
                    '" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-dasharray="8 6"/></svg>';
                cam.background = L.imageOverlay('data:image/svg+xml,' + encodeURIComponent(svg), layerBounds(layer), {
                    pane: 'bgPane',
                    className: 'shadow-[0_0_0_1px_#262626,0_20px_60px_rgba(0,0,0,0.5)]',
                    interactive: false,
                }).addTo(lmap);
            }
        } else if (layer.backgroundColor) {
            const svg =
                '<svg xmlns="http://www.w3.org/2000/svg" width="' +
                layer.backgroundWidth +
                '" height="' +
                layer.backgroundHeight +
                '"><rect width="100%" height="100%" fill="' +
                safeSvgColor(layer.backgroundColor) +
                '"/></svg>';
            cam.background = L.imageOverlay('data:image/svg+xml,' + encodeURIComponent(svg), layerBounds(layer), {
                pane: 'bgPane',
                className: 'shadow-[0_0_0_1px_#262626,0_20px_60px_rgba(0,0,0,0.5)]',
                interactive: false,
            }).addTo(lmap);
        }
        cam.refreshGrid();
    };

    cam.refreshGrid = function () {
        if (cam.gridOverlay) {
            cam.gridOverlay.remove();
            cam.gridOverlay = null;
        }
        const layer = opts.getLayer();
        const blank = !layer || !(layer.backgroundUrl || layer.backgroundColor);
        if (!layer || !(cam.gridVisible || blank)) return;
        cam.gridOverlay = L.imageOverlay(
            gridImageUrl(layer.backgroundWidth, layer.backgroundHeight, blank),
            layerBounds(layer),
            { pane: 'bgPane', className: 'pointer-events-none', interactive: false }
        ).addTo(lmap);
    };

    cam.reveal = function (x, y) {
        const target = toLatLng(x, y);
        const pt = lmap.latLngToContainerPoint(target);
        const size = lmap.getSize();
        const p = opts.getPadding ? opts.getPadding() : { left: 0, right: 0 };
        const margin = 40;
        if (pt.x > p.left + margin && pt.x < size.x - p.right - margin && pt.y > margin && pt.y < size.y - margin)
            return;
        const desired = L.point(p.left + (size.x - p.left - p.right) / 2, size.y / 2);
        lmap.panBy(pt.subtract(desired));
    };

    // with many markers on screen they resize once the zoom ends, not every frame (each resize repaints them all)
    const liveMarkers = containerEl.getElementsByClassName('leaflet-marker-icon');
    lmap.on('zoom', () => {
        if (liveMarkers.length < MANY_MARKERS) cam.applyZoomStyles(lmap.getZoom());
    });
    lmap.on('zoomend', () => cam.applyZoomStyles(lmap.getZoom()));
    lmap.on('zoomanim', (e) => {
        containerEl.classList.add('zoom-animating');
        cam.applyZoomStyles(e.zoom);
    });
    lmap.on('zoomend', () => containerEl.classList.remove('zoom-animating'));
    lmap.on('dragstart', () => {
        cam.stayFitted = false;
    });
    lmap.on('zoomstart', () => {
        if (!fitting) cam.stayFitted = false;
    });
    new ResizeObserver(() => {
        lmap.invalidateSize({ pan: false });
        cam.fit(false, cam.stayFitted);
    }).observe(containerEl);

    return cam;
}

const gridCache = new Map();
function gridImageUrl(w, h, blank) {
    const key = w + 'x' + h + (blank ? 'b' : '');
    if (gridCache.has(key)) return gridCache.get(key);
    const scale = Math.min(1, 4096 / Math.max(w, h));
    let d = '',
        text = '';
    for (let x = 0; x <= w; x += 100) d += 'M' + x + ' 0V' + h;
    for (let y = 0; y <= h; y += 100) d += 'M0 ' + y + 'H' + w;
    for (let x = 100; x < w; x += 100) text += '<text x="' + (x + 4) + '" y="4">' + x + '</text>';
    for (let y = 100; y < h; y += 100) text += '<text x="4" y="' + (y + 4) + '">' + y + '</text>';
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        w +
        '" height="' +
        h +
        '" viewBox="0 0 ' +
        w +
        ' ' +
        h +
        '">' +
        (blank ? '<rect width="' + w + '" height="' + h + '" fill="#141414"/>' : '') +
        '<path d="' +
        d +
        '" stroke="rgba(255,255,255,0.12)" stroke-width="' +
        1 / scale +
        '" fill="none"/>' +
        '<g fill="rgba(255,255,255,0.5)" font-family="sans-serif" font-size="' +
        18 / Math.max(scale, 0.5) +
        '" dominant-baseline="hanging">' +
        text +
        '</g></svg>';
    const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
    gridCache.set(key, url);
    return url;
}

// Element geometry

// Every zone shape as a closed list of image-px points, rotation applied
function zoneShapePoints(el) {
    let pts;
    if (el.shape === 'polygon' && Array.isArray(el.points) && el.points.length >= 3) {
        pts = el.points.map((p) => ({ x: p.x, y: p.y }));
    } else if (el.shape === 'circle') {
        const cx = el.x + el.width / 2,
            cy = el.y + el.height / 2;
        pts = [];
        for (let i = 0; i < ELLIPSE_STEPS; i++) {
            const a = (i / ELLIPSE_STEPS) * Math.PI * 2;
            pts.push({ x: cx + (Math.cos(a) * el.width) / 2, y: cy + (Math.sin(a) * el.height) / 2 });
        }
    } else {
        pts = [
            { x: el.x, y: el.y },
            { x: el.x + el.width, y: el.y },
            { x: el.x + el.width, y: el.y + el.height },
            { x: el.x, y: el.y + el.height },
        ];
    }
    return rotatePoints(pts, el.rotation || 0);
}

function rotatePoints(pts, deg) {
    if (!deg) return pts;
    const c = pointsCenter(pts);
    const r = (deg * Math.PI) / 180,
        cos = Math.cos(r),
        sin = Math.sin(r);
    return pts.map((p) => ({
        x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin,
        y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos,
    }));
}

function pointsCenter(pts) {
    const xs = pts.map((p) => p.x),
        ys = pts.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function pointsBBox(pts) {
    const xs = pts.map((p) => p.x),
        ys = pts.map((p) => p.y);
    const x = Math.min(...xs),
        y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function elementAnchor(el) {
    if (el.type === 'marker' || el.type === 'label' || el.type === 'object') return { x: el.x, y: el.y };
    return { x: el.x + (el.width || 0) / 2, y: el.y + (el.height || 0) / 2 };
}

// Routes

function createRouteOverlay(m, route, opts) {
    const group = L.layerGroup();
    const pts = routeCoords(m, route);
    const lls = pts.map((p) => toLatLng(p.x, p.y));
    if (route.loop && lls.length > 2) lls.push(lls[0]);
    const w = ROUTE_BASE_WEIGHT * ((route.width || 100) / 100);
    const out = { group, bounds: lls.length ? L.latLngBounds(lls) : null, hit: null, paths: [] };
    if (lls.length > 1) {
        const common = { interactive: false, lineCap: 'round', lineJoin: 'round' };
        const casing = L.polyline(
            lls,
            Object.assign({}, common, {
                color: '#000000',
                weight: w + 2.5,
                opacity: 0.45,
                className: 'lf-route-casing lf-route-dashed',
            })
        );
        const line = L.polyline(
            lls,
            Object.assign({}, common, {
                color: route.color,
                weight: w,
                opacity: 1,
                className: 'lf-route-line lf-route-dashed',
            })
        );
        [casing, line].forEach((pl) =>
            pl.on('add', () => {
                if (pl._path) pl._path.style.setProperty('--rw', w + 'px');
            })
        );
        group.addLayer(casing).addLayer(line);
        out.paths = [casing, line];
        if (opts && opts.interactive) {
            out.hit = L.polyline(
                lls,
                Object.assign({}, common, {
                    interactive: true,
                    color: '#000000',
                    weight: Math.max(14, w + 10),
                    opacity: 0,
                    className: 'lf-route-hit',
                })
            );
            group.addLayer(out.hit);
        }
    }
    let n = 0;
    pts.forEach((p) => {
        if (!p.elementId) return;
        n++;
        group.addLayer(
            new SubpixelMarker(toLatLng(p.x, p.y), {
                interactive: false,
                keyboard: false,
                zIndexOffset: 1000000000,
                icon: L.divIcon({
                    className: 'lf-route-badge',
                    iconSize: [0, 0],
                    html:
                        '<span style="--rc:' +
                        escapeHtml(route.color) +
                        ';' +
                        stopBadgeOffsetCss(m, p.el) +
                        '">' +
                        n +
                        '</span>',
                }),
            })
        );
    });
    return out;
}

const STOP_BADGE_CORNER = {
    none: 0.24,
    circle: 0.36,
    square: 0.42,
    pin: 0.36,
    'square-pin': 0.42,
    drop: 0.27,
    diamond: 0.26,
    hexagon: 0.36,
    octagon: 0.34,
    shield: 0.38,
};
function stopBadgeOffsetCss(m, el) {
    if (!el || el.type !== 'marker') return '--bx:0px;--by:0px';
    const s = resolveStyle(m, el);
    const px = markerSizePx(s);
    const shape = MARKER_SHAPES.includes(s.markerShape) ? s.markerShape : 'none';
    const top = markerTopOffsetPx(s, el);
    let bx, by;
    if (markerTextOf(el)) {
        const text = markerTextOf(el);
        const w = Math.min(
            px * 3.4,
            Math.max(shape === 'none' ? 0 : px, Math.min(text.length, 9) * px * 0.2 + (shape === 'none' ? 0 : px * 0.6))
        );
        bx = w / 2 - px * 0.08;
        by = top - px * 0.08;
    } else {
        const k = shape === 'none' && el.mapImage ? 0.4 : STOP_BADGE_CORNER[shape] || 0.36;
        const center =
            shape === 'pin' || shape === 'square-pin' ? top - px / 2 : shape === 'drop' ? top - px * 0.37 : 0;
        bx = px * k;
        by = center + px * k;
    }
    return '--bx:' + bx.toFixed(1) + 'px;--by:' + by.toFixed(1) + 'px';
}

// Marker clustering

// Marker clustering used by the Maker preview and the viewer, behind one small interface.
// mode 'all': one group, any markers close together merge. mode 'category': one group per category, so only
// markers of the same category merge, and the bubble is that category's marker with a count.
// A marker needs lay._clusterKey = its category id; one without a category stays a plain marker.
function createClusterSet(lmap, m, mode) {
    const byCategory = mode === 'category';
    const groups = new Map();
    const keyOf = (lay) => (byCategory ? lay._clusterKey || '' : 'all');
    const groupFor = (lay) => {
        const k = keyOf(lay);
        if (!k) return null;
        if (!groups.has(k))
            groups.set(k, (byCategory ? createCategoryClusterGroup(m, k) : createClusterGroup()).addTo(lmap));
        return groups.get(k);
    };
    const bucket = (layers) => {
        const out = new Map();
        layers.forEach((lay) => {
            const g = groupFor(lay);
            if (!out.has(g)) out.set(g, []);
            out.get(g).push(lay);
        });
        return out;
    };
    return {
        addLayer(lay) {
            const g = groupFor(lay);
            if (g) g.addLayer(lay);
            else lay.addTo(lmap);
        },
        addLayers(layers) {
            bucket(layers).forEach((list, g) => (g ? g.addLayers(list) : list.forEach((l) => l.addTo(lmap))));
        },
        removeLayer(lay) {
            const g = groupFor(lay);
            if (g) g.removeLayer(lay);
            else lay.remove();
        },
        removeLayers(layers) {
            bucket(layers).forEach((list, g) => (g ? g.removeLayers(list) : list.forEach((l) => l.remove())));
        },
        hasLayer(lay) {
            const g = groupFor(lay);
            return g ? g.hasLayer(lay) : lmap.hasLayer(lay);
        },
        zoomToShowLayer(lay, cb) {
            const g = groupFor(lay);
            if (g) g.zoomToShowLayer(lay, cb);
            else cb();
        },
        remove() {
            groups.forEach((g) => g.remove());
            groups.clear();
        },
    };
}

// The bubble for one category: its marker look (shape, color, icon) with the count at the top right
function createCategoryClusterGroup(m, categoryId) {
    const cat = categoryById(m, categoryId);
    const s = resolveStyle(m, { type: 'marker', categoryId });
    const title = cat ? cat.name : '';
    return L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: Math.max(40, Math.round(markerSizePx(s) * 1.1)),
        spiderfyOnMaxZoom: true,
        chunkedLoading: true,
        iconCreateFunction: (cluster) => {
            const n = cluster.getChildCount();
            const html = markerHtml({ type: 'marker', rotation: 0 }, s, 'is-cluster').replace(
                /<\/div>$/,
                '<span class="lf-cluster-count">' + n + '</span></div>'
            );
            return L.divIcon({
                className: 'lf-marker lf-cluster-cat',
                html: html.replace('<div ', '<div title="' + escapeHtml((title ? title + ': ' : '') + n) + '" '),
                iconSize: [0, 0],
            });
        },
    });
}

function createClusterGroup() {
    return L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 46,
        spiderfyOnMaxZoom: true,
        chunkedLoading: true,
        iconCreateFunction: (cluster) => {
            const n = cluster.getChildCount();
            const size = n < 10 ? 34 : n < 50 ? 40 : 48;
            return L.divIcon({
                className: 'lf-cluster',
                html: '<div class="lf-cluster-inner" style="--cs:' + size + 'px"><span>' + n + '</span></div>',
                iconSize: [0, 0],
            });
        },
    });
}

// Element layers

const MARKER_SVG_SHAPES = {
    drop: {
        d: 'M50 98C50 98 13 60 13 37A37 37 0 1 1 87 37C87 60 50 98 50 98Z',
        pin: true,
        glyph: { scale: 0.42, y: -13 },
    },
    diamond: { d: 'M50 2L98 50L50 98L2 50Z', glyph: { scale: 0.4 } },
    hexagon: { d: 'M50 2L91.6 26L91.6 74L50 98L8.4 74L8.4 26Z', glyph: { scale: 0.46 } },
    octagon: { d: 'M30 3H70L97 30V70L70 97H30L3 70V30Z', glyph: { scale: 0.5 } },
    shield: { d: 'M50 2L93 16V47C93 74 73 89 50 98C27 89 7 74 7 47V16Z', glyph: { scale: 0.46, y: -3 } },
};

function markerSizePx(s) {
    return Math.max(2, Math.min(MARKER_MAX_PX, MARKER_BASE_PX * ((s.size || 100) / 100)));
}

// Px from a marker's point up to the top of its graphic, at 100% marker scale
function markerTopOffsetPx(s, el) {
    const px = markerSizePx(s);
    const text = markerTextOf(el);
    if (text) {
        const rows = Math.min(4, Math.max(1, Math.ceil(text.length / 9)));
        const h = Math.max(
            s.markerShape === 'none' ? 0 : px,
            px * 0.34 * 1.15 * rows + (s.markerShape === 'none' ? 0 : px * 0.36)
        );
        if (s.markerShape === 'pin' || s.markerShape === 'square-pin') return h + px * 0.3;
        if (MARKER_SVG_SHAPES[s.markerShape] && MARKER_SVG_SHAPES[s.markerShape].pin) return h;
        return h / 2;
    }
    if (s.markerShape === 'pin') return px * 1.25;
    if (s.markerShape === 'square-pin') return px * 1.3;
    if (MARKER_SVG_SHAPES[s.markerShape] && MARKER_SVG_SHAPES[s.markerShape].pin) return px * 0.98;
    return px / 2;
}

function markerTextOf(el) {
    return el && el.type === 'marker' && el.markerText ? String(el.markerText).trim() : '';
}

function markerHtml(el, s, extraClass) {
    const shape = MARKER_SHAPES.includes(s.markerShape) ? s.markerShape : 'none';
    const outline = s.outlineColor && s.outlineColor !== 'none' ? s.outlineColor : '';
    const text = markerTextOf(el);
    const glyph = text
        ? '<span class="block font-bold leading-[1.15] text-center [overflow-wrap:anywhere] whitespace-normal [.shape-none.is-text_&]:[text-shadow:0_0_2px_#000,0_0_6px_rgba(0,0,0,0.85),0_1px_2px_#000]">' +
          escapeHtml(text) +
          '</span>'
        : el.mapImage
          ? '<img src="' + escapeHtml(el.mapImage) + '" alt="">'
          : iconSpecHtml(s.icon);
    const cls = [
        'lf-marker-inner',
        'shape-' + shape,
        text && 'is-text',
        !text && el.mapImage && 'has-image',
        outline && 'has-outline',
        s.shadow === false && 'no-shadow',
        extraClass,
    ]
        .filter(Boolean)
        .join(' ');
    const svg = MARKER_SVG_SHAPES[shape];
    const style =
        '--s:' +
        markerSizePx(s) +
        'px;--rot:' +
        (el.rotation || 0) +
        'deg;color:' +
        escapeHtml(s.color) +
        ';--bg:' +
        escapeHtml(s.bgColor || DEFAULT_STYLE.bgColor) +
        (outline ? ';--ol:' + escapeHtml(outline) : '') +
        (svg ? ';--gs:' + svg.glyph.scale + ';--gy:' + (svg.glyph.y || 0) + '%' : '');
    return (
        '<div class="' +
        cls +
        (svg ? ' svg-shape' : '') +
        '" style="' +
        style +
        '">' +
        (svg
            ? '<svg class="lf-marker-svg" viewBox="0 0 100 100"' +
              (text ? ' preserveAspectRatio="none"' : '') +
              ' aria-hidden="true"><path d="' +
              svg.d +
              '"/></svg>'
            : shape !== 'none'
              ? '<span class="lf-marker-badge"></span>'
              : '') +
        '<span class="lf-marker-glyph">' +
        glyph +
        '</span>' +
        (el.linkLayerId
            ? '<span class="absolute -right-1 -bottom-1 w-4 h-4 rounded-[50%] bg-card-bg border border-accent text-accent text-[8px] flex items-center justify-center"><i class="fas fa-stairs"></i></span>'
            : '') +
        '</div>'
    );
}

// Category and group icons in lists: a small copy of the marker look
function iconBadgeHtml(s, px, el) {
    return (
        '<span class="lf-icon-badge" style="--b:' +
        px +
        'px;--marker-scale:' +
        px / markerSizePx(s) +
        '">' +
        markerHtml(el ? { type: 'marker', mapImage: el.mapImage } : { type: 'marker' }, s) +
        '</span>'
    );
}

// listIcon 'flat' on a category or group: just the icon or image, no shape, outline or shadow
function flatIconHtml(s, px, image) {
    return (
        '<span class="lf-icon-flat" style="--b:' +
        px +
        'px">' +
        (image ? '<img src="' + escapeHtml(image) + '" alt="">' : iconSpecHtml(s.icon, '', 'color:' + s.color)) +
        '</span>'
    );
}

function categoryBadgeHtml(m, cat, px) {
    const s = resolveStyle(m, { type: 'marker', categoryId: cat.id });
    return cat.listIcon === 'flat' ? flatIconHtml(s, px || 18) : iconBadgeHtml(s, px || 18);
}

// A marker's icon in lists, the way its category shows icons
function elementBadgeHtml(m, el, px) {
    const s = resolveStyle(m, el);
    const cat = categoryById(m, el.categoryId);
    return cat && cat.listIcon === 'flat' ? flatIconHtml(s, px, el.mapImage) : iconBadgeHtml(s, px, el);
}

const GROUP_LOOK_DEFAULTS = { icon: 'folder', color: '#ff6900', size: 100, markerShape: 'none', shadow: false };
function groupLook(g) {
    const s = Object.assign({}, DEFAULT_STYLE, GROUP_LOOK_DEFAULTS);
    ['icon', 'color', ...MARKER_LOOK_KEYS].forEach((k) => {
        if (g[k] != null && g[k] !== '') s[k] = g[k];
    });
    return s;
}

function groupBadgeHtml(g, px) {
    return g.listIcon === 'flat' ? flatIconHtml(groupLook(g), px || 18) : iconBadgeHtml(groupLook(g), px || 18);
}

function markerStackOffset(el) {
    return Math.round(el.y * 1000 + el.x * 0.01);
}

function createMarkerLayer(el, s, options) {
    return new SubpixelMarker(
        toLatLng(el.x, el.y),
        Object.assign(
            {
                icon: L.divIcon({
                    className: 'lf-marker',
                    html: markerHtml(el, s),
                    iconSize: [0, 0],
                    popupAnchor: [0, -markerTopOffsetPx(s, el) + 4],
                }),
                title: el.name || '',
                alt: el.name || 'Marker',
                riseOnHover: true,
                riseOffset: 5000000,
                zIndexOffset: markerStackOffset(el),
                keyboard: true,
            },
            options || {}
        )
    );
}

function textStyleCss(s, rotation) {
    const px = LABEL_BASE_PX * ((s.size || 100) / 100);
    const halo = s.halo && s.halo !== 'none' ? s.halo : '';
    return (
        '--fs:' +
        px.toFixed(1) +
        'px;--rot:' +
        (rotation || 0) +
        'deg;color:' +
        escapeHtml(s.color) +
        (halo ? ';--halo:' + escapeHtml(halo) : ';text-shadow:none')
    );
}

function labelHtml(el, s, extraClass) {
    return (
        '<div class="lf-label-inner' +
        (extraClass ? ' ' + extraClass : '') +
        '" style="' +
        textStyleCss(s, el.rotation) +
        '">' +
        escapeHtml(el.name || (el.type === 'area' ? '' : 'Label')) +
        '</div>'
    );
}

function createLabelLayer(el, s, options) {
    return new SubpixelMarker(
        toLatLng(el.x, el.y),
        Object.assign(
            {
                icon: L.divIcon({ className: 'lf-label', html: labelHtml(el, s), iconSize: [0, 0] }),
                keyboard: false,
            },
            options || {}
        )
    );
}

// Areas

function areaPathOptions(s) {
    return {
        color: s.borderColor,
        opacity: (s.borderOpacity ?? 40) / 100,
        weight: +s.borderWidth || 0,
        stroke: (+s.borderWidth || 0) > 0 && (s.borderOpacity ?? 40) > 0,
        dashArray: s.borderStyle === 'dashed' ? '10 7' : s.borderStyle === 'dotted' ? '2 6' : null,
        lineCap: 'round',
        fillColor: s.fillColor,
        fillOpacity: (s.fillOpacity ?? 6) / 100,
        ground: GROUND_TILES[s.ground] ? s.ground : null,
        className: 'lf-area',
    };
}

// Where an area's name goes
function areaLabelPoint(el) {
    const pts = zoneShapePoints(el);
    let a = 0,
        cx = 0,
        cy = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i],
            q = pts[(i + 1) % pts.length],
            f = p.x * q.y - q.x * p.y;
        a += f;
        cx += (p.x + q.x) * f;
        cy += (p.y + q.y) * f;
    }
    const c = Math.abs(a) < 1e-6 ? pointsCenter(pts) : { x: cx / (3 * a), y: cy / (3 * a) };
    if (pointInPolygon(c, pts)) return c;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i],
            q = pts[(i + 1) % pts.length];
        if (p.y > c.y !== q.y > c.y) xs.push(p.x + ((c.y - p.y) / (q.y - p.y)) * (q.x - p.x));
    }
    xs.sort((m, n) => m - n);
    let best = null;
    for (let i = 0; i + 1 < xs.length; i += 2)
        if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
    return best ? { x: (best[0] + best[1]) / 2, y: c.y } : pointsCenter(pts);
}

function pointInPolygon(P, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i],
            b = pts[j];
        if (a.y > P.y !== b.y > P.y && P.x < ((b.x - a.x) * (P.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

function createAreaLayer(el, s, options) {
    const poly = L.polygon(
        zoneShapePoints(el).map((p) => toLatLng(p.x, p.y)),
        Object.assign(areaPathOptions(s), options || {})
    );
    const mode = AREA_LABEL_MODES.includes(s.labelMode) ? s.labelMode : 'always';
    if (mode !== 'none' && el.name) {
        const c = areaLabelPoint(el);
        const label = new SubpixelMarker(toLatLng(c.x, c.y), {
            interactive: false,
            keyboard: false,
            zIndexOffset: -1000000,
            icon: L.divIcon({
                className: 'lf-label lf-area-label' + (mode === 'hover' ? ' is-hover-only' : ''),
                html: labelHtml(Object.assign({}, el, { rotation: 0 }), s),
                iconSize: [0, 0],
            }),
        });
        poly._areaLabel = label;
        poly.on('add', () => label.addTo(poly._map));
        poly.on('remove', () => label.remove());
        if (mode === 'hover') {
            poly.on('mouseover', () => label.getElement()?.classList.add('is-hovered'));
            poly.on('mouseout', () => label.getElement()?.classList.remove('is-hovered'));
        }
    }
    return poly;
}

function syncAreaLabel(poly, el) {
    if (poly && poly._areaLabel) {
        const c = areaLabelPoint(el);
        poly._areaLabel.setLatLng(toLatLng(c.x, c.y));
    }
}

function zonePathOptions(s) {
    const op = (s.opacity ?? 30) / 100;
    return {
        color: s.color,
        weight: 2,
        opacity: 0.9,
        dashArray: s.borderStyle === 'dashed' ? '8 6' : s.borderStyle === 'dotted' ? '2 6' : null,
        fillColor: s.color,
        fillOpacity: op,
        className: 'lf-zone',
    };
}

function createZoneLayer(el, s, options) {
    return L.polygon(
        zoneShapePoints(el).map((p) => toLatLng(p.x, p.y)),
        Object.assign(zonePathOptions(s), options || {})
    );
}

function objectStackOffset(layer, el) {
    return layer.elements.indexOf(el) * 1e6;
}

function createObjectLayer(el, s, options) {
    return createMarkerLayer(
        el,
        Object.assign({}, s, { markerShape: 'none' }),
        Object.assign({ pane: 'decorPane', riseOnHover: false, keyboard: false, title: '', alt: '' }, options || {})
    );
}

function createElementLayer(el, s, options) {
    if (el.type === 'marker') return createMarkerLayer(el, s, options);
    if (el.type === 'object') return createObjectLayer(el, s, options);
    if (el.type === 'label') return createLabelLayer(el, s, options);
    if (el.type === 'area') return createAreaLayer(el, s, options);
    return createZoneLayer(el, s, options);
}

// Zone "fill image" (element.mapImage on a zone)
function applyZoneImageFill(poly, el) {
    if (!el.mapImage || !poly._path) return;
    const svg = poly._path.ownerSVGElement;
    const NS = 'http://www.w3.org/2000/svg';
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS(NS, 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    const id = 'zone-fill-' + String(el.id).replace(/[^\w-]/g, '_');
    defs.querySelector('#' + id)?.remove();
    const pts = zoneShapePoints(el);
    const xs = pts.map((p) => p.x),
        ys = pts.map((p) => p.y);
    const bx = Math.min(...xs),
        by = Math.min(...ys),
        bw = Math.max(...xs) - bx,
        bh = Math.max(...ys) - by;
    const fit = Object.assign({ size: 100, x: 0, y: 0 }, el.imageFit);
    const w = (bw * fit.size) / 100,
        h = (bh * fit.size) / 100;
    const pattern = document.createElementNS(NS, 'pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('x', bx);
    pattern.setAttribute('y', by);
    pattern.setAttribute('width', bw);
    pattern.setAttribute('height', bh);
    const img = document.createElementNS(NS, 'image');
    img.setAttribute('href', el.mapImage);
    img.setAttribute('x', (bw - w) / 2 + (bw * fit.x) / 100);
    img.setAttribute('y', (bh - h) / 2 + (bh * fit.y) / 100);
    img.setAttribute('width', w);
    img.setAttribute('height', h);
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    pattern.appendChild(img);
    defs.appendChild(pattern);
    poly._path.setAttribute('fill', 'url(#' + id + ')');
    poly._path.setAttribute('fill-opacity', '1');
}
