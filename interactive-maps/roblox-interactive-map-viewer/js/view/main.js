// View: page boot, header, description sections
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src');
    if (src) {
        // ?src= is a map JSON file next to this page (same origin only)
        // GitHub build: always the full-window map, no header (like the embed layout)
        document.body.classList.add('static', 'embed');
        let url;
        try {
            url = new URL(src, window.location.href);
        } catch (e) {}
        const load =
            url && url.origin === window.location.origin
                ? fetch(url.href).then((r) => (r.ok ? r.json() : null))
                : Promise.resolve(null);
        load.catch(() => null).then((raw) => startView(raw && Object.assign({ id: src }, raw), params));
        return;
    }
    const mapId = params.get('map');
    const entry = mapId ? loadPublishedStore()[mapId] : null;
    startView(entry && entry.raw, params);
});

function startView(raw, params) {
    if (!raw || !Array.isArray(raw.layers) || !raw.layers.length) {
        byId('not-found-state').classList.remove('hidden');
        byId('map-app').classList.add('hidden');
        return;
    }

    // older map files can still hold elements kept off the live map
    map = publishedCopy(normalizeMap(raw));
    initEmbedMode();
    renderViewHeader();
    renderDescBlocks();

    byId('map-app').classList.remove('hidden');
    loadFoundState();
    restoreViewPrefs();
    initFilterPanel();
    initViewMap();
    initEmbedGestureGuard();
    initMine();
    wireLayerTabs();
    wireFilterControls();
    wireFoundControls();
    wirePopupActions();
    wireRouteControls();
    wireShareControls();
    wireCopyButton();
    const deepLinkedId = params.get('marker');
    activeLayerId = null;
    switchLayer(initialLayerFromUrl());
    openDeepLinkedElement(deepLinkedId);
    if (!deepLinkedId) openRouteFromUrl(params.get('route'));
}

function renderViewHeader() {
    byId('view-title').textContent = map.title || 'Untitled Map';
    const isStatic = document.body.classList.contains('static');
    byId('view-breadcrumb').innerHTML = isStatic
        ? escapeHtml(map.game || '')
        : '<a href="map-hub.html" class="hover:text-white">Map Hub</a>' +
          (map.game
              ? '<i class="fas fa-chevron-right text-[0.5rem]"></i><a href="map-hub.html?game=' +
                encodeURIComponent(map.gameSlug || slugify(map.game)) +
                '" class="flex items-center gap-1.5 min-w-0 text-accent font-semibold hover:underline">' +
                (map.gameLogo
                    ? '<img src="' +
                      escapeHtml(map.gameLogo) +
                      '" alt="" class="w-5 h-5 rounded object-cover flex-none">'
                    : '') +
                '<span class="truncate">' +
                escapeHtml(map.game) +
                '</span></a>'
              : '');
    const versionEl = byId('view-version');
    versionEl.innerHTML = map.gameVersion
        ? '<i class="fas fa-code-branch text-accent text-[0.65rem]"></i> ' + escapeHtml(map.gameVersion)
        : '';
    versionEl.title = map.gameVersion ? 'Made for this version / update of the game' : '';
    versionEl.classList.toggle('hidden', !map.gameVersion);
    const creatorEl = byId('view-creator');
    const updated = map.updatedAt
        ? formatDaysAgo(Math.max(0, Math.floor((Date.now() - new Date(map.updatedAt).getTime()) / 86400000)))
        : '';
    creatorEl.textContent = [map.creatorName ? 'by ' + map.creatorName : '', updated ? 'updated ' + updated : '']
        .filter(Boolean)
        .join(' · ');
    creatorEl.classList.toggle('hidden', !creatorEl.textContent);
    document.title = (map.title || 'Interactive Map') + (map.game ? ' | ' + map.game : '');
}

function renderDescBlocks() {
    const blocks = map.descriptionBlocks || [];
    ['above', 'below'].forEach((place) => {
        const host = byId('desc-blocks-' + place);
        const list = blocks.filter((b) => (b.placement || 'below') === place);
        host.classList.toggle('hidden', !list.length);
        host.innerHTML = list
            .map(
                (b) =>
                    '<div class="desc-block bg-card-bg/80 border border-border rounded-2xl overflow-hidden">' +
                    '<button type="button" class="w-full flex items-center justify-between px-5 py-3 hover:bg-white/5 text-left" aria-expanded="false">' +
                    '<span class="font-semibold text-white">' +
                    escapeHtml(b.heading || 'Untitled section') +
                    '</span>' +
                    '<i class="fas fa-chevron-down text-muted transition-transform [.desc-block.open_&]:rotate-180"></i>' +
                    '</button>' +
                    '<div class="overflow-hidden max-h-0 [transition:all_0.25s_ease] [.desc-block.open_&]:max-h-[800px] [.desc-block.open_&]:overflow-y-auto"><div class="notes-content text-sm text-text-secondary px-5 py-4">' +
                    safeDescriptionHtml(b.body || '') +
                    '</div></div>' +
                    '</div>'
            )
            .join('');
    });
    qsa('.desc-block > button').forEach((btn) =>
        btn.addEventListener('click', () => {
            const open = btn.parentElement.classList.toggle('open');
            btn.setAttribute('aria-expanded', open);
        })
    );
}
