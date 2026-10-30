// Filter tree and search
let searchIndex = null;
const expandedCategories = new Set();
const collapsedGroups = new Set();
const TREE_ANIM_MS = 200;

function collectFacets() {
    const layer = activeLayer();
    const items = new Map();
    (layer ? layer.elements : []).forEach((el) => {
        if (!isCategorized(el)) return;
        if (!items.has(el.categoryId)) items.set(el.categoryId, []);
        items.get(el.categoryId).push(el);
    });
    const categories = map.categories.filter((c) => items.has(c.id));
    const liveGroups = new Set();
    categories.forEach((c) => {
        if (groupById(map, c.groupId)) liveGroups.add(c.groupId);
    });
    return { categories, liveGroups, items };
}

function groupCategories(groupId) {
    return map.categories.filter((c) => c.groupId === groupId);
}

function groupIsOn(groupId, facets) {
    const live = (facets || collectFacets()).categories.filter((c) => c.groupId === groupId);
    return live.some((c) => !filterState.hiddenCategories.has(c.id));
}

// Remembered per viewer, per map

function restoreViewPrefs() {
    const p = loadViewPrefs(map.id);
    const valid = (list, ids) => new Set((list || []).filter((id) => ids.has(id)));
    const catIds = new Set(map.categories.map((c) => c.id)),
        groupIds = new Set(map.groups.map((g) => g.id));
    filterState.hiddenCategories = valid(p.hiddenCategories, catIds);
    valid(p.expandedCategories, catIds).forEach((id) => expandedCategories.add(id));
    valid(p.collapsedGroups, groupIds).forEach((id) => collapsedGroups.add(id));
    filterState.hideFound = !!p.hideFound;
    filterState.hideAnnotations = !!p.hideAnnotations;
}

function saveCurrentViewPrefs() {
    if (!map || !map.id) return;
    saveViewPrefs(map.id, {
        hiddenCategories: [...filterState.hiddenCategories],
        expandedCategories: [...expandedCategories],
        collapsedGroups: [...collapsedGroups],
        hideFound: filterState.hideFound,
        hideAnnotations: filterState.hideAnnotations,
    });
}

function afterFacetChange() {
    paintFilterTree();
    applyVisibility();
    saveCurrentViewPrefs();
}

// The tree

// Filter tree rows (also used by routes.js and mine.js)
const FT_ROW =
    'relative flex items-center gap-[7px] pt-[3px] pr-1 pb-[3px] pl-1.5 rounded-lg border border-transparent cursor-pointer select-none [transition:background_0.2s,border-color_0.2s] hover:bg-white/5 focus-visible:[outline:none] focus-visible:border-accent';
const FT_ROW_PLAIN = FT_ROW + ' min-h-[38px] text-[#ddd] text-[0.84rem]';
const FT_ROW_ITEM = FT_ROW + ' min-h-[34px] text-[0.8rem] text-[#bbb]';
const FT_DIM = '[transition:opacity_0.25s_ease,text-decoration-color_0.25s] [.is-off>&]:opacity-[0.38]';
const FT_ICON =
    'w-[18px] flex-none inline-flex justify-center text-[0.85rem] [&_img]:w-[18px] [&_img]:h-[18px] [&_img]:object-cover [&_img]:rounded ' +
    FT_DIM;
const FT_NAME = 'flex-1 min-w-0 truncate ' + FT_DIM + ' [.is-off_&]:line-through [.is-off_&]:decoration-white/35';
const FT_CHEVRON =
    'ft-chevron flex-none w-3.5 inline-flex items-center justify-center text-[#777] text-[0.6rem] [transition:opacity_0.25s_ease,text-decoration-color_0.25s] [.ft-row:hover_&]:text-[#ddd] [&_i]:[transition:transform_0.2s_ease] [&.open_i]:rotate-90';
const FT_SWITCH =
    'relative flex-none w-[34px] h-5 ml-0.5 p-0 border-none rounded-full bg-[#333] cursor-pointer [transition:background_0.22s_ease] [&.on]:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2';
const FT_SWITCH_KNOB =
    '<span class="absolute left-[3px] top-[3px] w-3.5 h-3.5 rounded-[50%] bg-[#999] [transition:transform_0.22s_cubic-bezier(0.3,1.4,0.5,1),background_0.22s_ease] [.on>&]:translate-x-3.5 [.on>&]:bg-white"></span>';
const FT_FOUND = 'ft-found text-[#4ade80] text-[0.72rem]';
const FT_CHILDREN = 'ft-children flex flex-col gap-0.5 mt-px mr-0 mb-[3px] ml-3.5 border-l-2';

function ftSwitchHtml(kind, id, on, name) {
    return (
        '<button type="button" class="ft-switch ' +
        FT_SWITCH +
        (on ? ' on' : '') +
        '" role="switch" aria-checked="' +
        on +
        '"' +
        ' data-ft-toggle="' +
        kind +
        '" data-id="' +
        escapeHtml(id) +
        '" title="' +
        (on ? 'Hide ' : 'Show ') +
        escapeHtml(name) +
        ' on the map"' +
        ' aria-label="Show ' +
        escapeHtml(name) +
        ' on the map">' +
        FT_SWITCH_KNOB +
        '</button>'
    );
}

function ftFoundHtml(el) {
    return foundIds.has(el.id) ? '<i class="fas fa-circle-check ' + FT_FOUND + '" title="Found"></i>' : '';
}

function treeRowHtml(kind, id, opts) {
    const expandable = opts.expanded !== undefined;
    return (
        '<div class="ft-row ft-' +
        kind +
        ' ' +
        (kind === 'item'
            ? FT_ROW_ITEM
            : kind === 'group'
              ? FT_ROW + ' min-h-[38px] text-[0.84rem] font-bold text-white bg-white/[0.035]'
              : FT_ROW_PLAIN + ' font-semibold') +
        (opts.off ? ' is-off' : '') +
        '" role="button" tabindex="0" data-ft="' +
        kind +
        '" data-id="' +
        escapeHtml(id) +
        '"' +
        (expandable ? ' aria-expanded="' + !!opts.expanded + '"' : '') +
        ' title="' +
        (expandable ? (opts.expanded ? 'Close ' : 'Open ') : 'Go to ') +
        escapeHtml(opts.name) +
        '">' +
        (expandable
            ? '<span class="' +
              FT_CHEVRON +
              (opts.expanded ? ' open' : '') +
              '" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>'
            : '') +
        '<span class="' +
        FT_ICON +
        (kind === 'group' ? ' text-accent' : '') +
        '">' +
        opts.iconHtml +
        '</span>' +
        '<span class="' +
        FT_NAME +
        '">' +
        escapeHtml(opts.name) +
        '</span>' +
        (opts.tail || '') +
        '</div>'
    );
}

function itemIconHtml(el) {
    const s = resolveStyle(map, el);
    if (el.type === 'marker' && markerTextOf(el))
        return '<i class="fas fa-font" style="color:' + escapeHtml(s.color) + '"></i>';
    return el.type === 'marker'
        ? elementBadgeHtml(map, el, 18)
        : iconSpecHtml(el.type === 'zone' ? 'draw-polygon' : s.icon, '', 'color:' + s.color);
}

function itemsHtml(c, f) {
    return (
        '<div class="' +
        FT_CHILDREN +
        ' pl-1.5 [border-left-color:color-mix(in_srgb,var(--cc,#888)_55%,transparent)]" data-children-of="category:' +
        escapeHtml(c.id) +
        '" style="--cc:' +
        escapeHtml(c.color || '#888') +
        '">' +
        (f.items.get(c.id) || [])
            .map((el) =>
                treeRowHtml('item', el.id, {
                    off: filterState.hiddenCategories.has(c.id),
                    name: el.name || (el.type === 'zone' ? 'Unnamed zone' : 'Unnamed'),
                    iconHtml: itemIconHtml(el),
                    tail: ftFoundHtml(el),
                })
            )
            .join('') +
        '</div>'
    );
}

function categoryTreeHtml(c, f) {
    const off = filterState.hiddenCategories.has(c.id);
    const expanded = expandedCategories.has(c.id);
    return (
        treeRowHtml('category', c.id, {
            off,
            name: c.name,
            expanded,
            iconHtml: categoryBadgeHtml(map, c),
            tail: ftSwitchHtml('category', c.id, !off, c.name),
        }) + (expanded ? itemsHtml(c, f) : '')
    );
}

function groupChildrenHtml(g, f) {
    return (
        '<div class="' +
        FT_CHILDREN +
        ' pl-1.5 border-l-white/[0.09]" data-children-of="group:' +
        escapeHtml(g.id) +
        '">' +
        f.categories
            .filter((c) => c.groupId === g.id)
            .map((c) => categoryTreeHtml(c, f))
            .join('') +
        '</div>'
    );
}

function groupTreeHtml(g, f) {
    if (!f.liveGroups.has(g.id)) return '';
    const on = groupIsOn(g.id, f);
    const expanded = !collapsedGroups.has(g.id);
    return (
        treeRowHtml('group', g.id, {
            off: !on,
            name: g.name,
            expanded,
            iconHtml: groupBadgeHtml(g),
            tail: ftSwitchHtml('group', g.id, on, g.name),
        }) + (expanded ? groupChildrenHtml(g, f) : '')
    );
}

function renderFilterSidebar() {
    const f = collectFacets();
    const top =
        map.groups.map((g) => groupTreeHtml(g, f)).join('') +
        f.categories
            .filter((c) => !groupById(map, c.groupId))
            .map((c) => categoryTreeHtml(c, f))
            .join('');
    byId('filter-tree').innerHTML = top || '<p class="text-[#666] text-[0.8rem] italic">Nothing on this layer yet.</p>';
    const layer = activeLayer();
    byId('annotations-toggle').classList.toggle('hidden', !(layer && layer.elements.some((el) => !isCategorized(el))));
    byId('filter-show-annotations').checked = !filterState.hideAnnotations;
}

function paintFilterTree() {
    const tree = byId('filter-tree');
    const f = collectFacets();
    const setSwitch = (sw, on) => {
        if (!sw) return;
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-checked', on);
    };
    qsa('[data-ft]', tree).forEach((row) => {
        const id = row.dataset.id,
            kind = row.dataset.ft;
        let on;
        if (kind === 'group') on = groupIsOn(id, f);
        else if (kind === 'category') on = !filterState.hiddenCategories.has(id);
        else {
            const hit = findElement(id);
            on = !!hit && !filterState.hiddenCategories.has(hit.el.categoryId);
            const check = qs('.ft-found', row),
                found = foundIds.has(id);
            if (found && !check)
                row.insertAdjacentHTML(
                    'beforeend',
                    '<i class="fas fa-circle-check ' + FT_FOUND + '" title="Found"></i>'
                );
            else if (!found && check) check.remove();
        }
        row.classList.toggle('is-off', !on);
        setSwitch(qs(':scope > [data-ft-toggle]', row), on);
    });
}

// Opens/closes a group or category with a height animation
function animateChildren(kind, id, opening) {
    const tree = byId('filter-tree');
    const sel = '[data-children-of="' + kind + ':' + CSS.escape(id) + '"]';
    const rowSel = '[data-ft="' + kind + '"][data-id="' + CSS.escape(id) + '"]';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const set = kind === 'category' ? expandedCategories : collapsedGroups;
    const flip = () => {
        if (set.has(id)) set.delete(id);
        else set.add(id);
    };
    if (!opening) {
        const kids = qs(sel, tree);
        qs(rowSel + ' .ft-chevron', tree)?.classList.remove('open');
        flip();
        saveCurrentViewPrefs();
        if (!kids || reduce) {
            renderFilterSidebar();
            refocus();
            return;
        }
        kids.style.overflow = 'hidden';
        kids.animate(
            [
                { height: kids.offsetHeight + 'px', opacity: 1 },
                { height: '0px', opacity: 0 },
            ],
            { duration: TREE_ANIM_MS, easing: 'ease-in-out' }
        ).onfinish = () => {
            renderFilterSidebar();
            refocus();
        };
        return;
    }
    flip();
    saveCurrentViewPrefs();
    renderFilterSidebar();
    refocus();
    const chev = qs(rowSel + ' .ft-chevron', tree);
    if (chev && !reduce) {
        chev.classList.remove('open');
        void chev.offsetWidth;
        chev.classList.add('open');
    }
    const kids = qs(sel, tree);
    if (!kids || reduce) return;
    kids.style.overflow = 'hidden';
    kids.animate(
        [
            { height: '0px', opacity: 0 },
            { height: kids.offsetHeight + 'px', opacity: 1 },
        ],
        { duration: TREE_ANIM_MS, easing: 'ease-out' }
    ).onfinish = () => {
        kids.style.overflow = '';
    };
    function refocus() {
        qs(rowSel, tree)?.focus({ preventScroll: true });
    }
}

function setAllVisible(on) {
    filterState.hiddenCategories.clear();
    if (!on) {
        collectFacets().categories.forEach((c) => filterState.hiddenCategories.add(c.id));
        if (activeRouteId) setActiveRoute(null);
    }
    setMineHiddenOnLayer(!on);
    afterFacetChange();
}

function handleTreeClick(e) {
    const sw = e.target.closest('[data-ft-toggle]');
    if (sw) {
        const id = sw.dataset.id;
        if (sw.dataset.ftToggle === 'group') {
            const turnOn = !groupIsOn(id);
            groupCategories(id).forEach((c) => {
                if (turnOn) filterState.hiddenCategories.delete(c.id);
                else filterState.hiddenCategories.add(c.id);
            });
        } else if (filterState.hiddenCategories.has(id)) filterState.hiddenCategories.delete(id);
        else filterState.hiddenCategories.add(id);
        afterFacetChange();
        return;
    }
    const row = e.target.closest('[data-ft]');
    if (!row) return;
    const id = row.dataset.id;
    if (row.dataset.ft === 'item') {
        if (isNarrowStage()) viewPanels.setOpen('left', false);
        goToElement(id);
        return;
    }
    animateChildren(row.dataset.ft, id, row.getAttribute('aria-expanded') !== 'true');
}

// Search

function plainText(html) {
    return html
        ? (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim()
        : '';
}

function buildSearchIndex() {
    const docs = [];
    map.layers.forEach((l) =>
        l.elements.forEach((el) => {
            if (!isCategorized(el)) return;
            const cat = categoryById(map, el.categoryId);
            docs.push({
                id: el.id,
                layerId: l.id,
                name: el.name || markerTextOf(el),
                category: cat ? cat.name : '',
                text: plainText(el.description),
            });
        })
    );
    searchIndex = window.Fuse
        ? new Fuse(docs, {
              keys: [
                  { name: 'name', weight: 3 },
                  { name: 'category', weight: 1 },
                  { name: 'text', weight: 1 },
              ],
              threshold: 0.35,
              ignoreLocation: true,
              minMatchCharLength: 2,
          })
        : {
              search: (q) =>
                  docs
                      .filter((d) => (d.name + ' ' + d.category + ' ' + d.text).toLowerCase().includes(q.toLowerCase()))
                      .map((item) => ({ item })),
          };
}

function runSearch(query) {
    const q = query.trim();
    filterState.search = q;
    const host = byId('search-results');
    if (!q) {
        filterState.searchHits = null;
        host.innerHTML = '';
        host.classList.add('hidden');
        applyVisibility();
        return;
    }
    const hits = searchIndex.search(q).map((r) => r.item);
    filterState.searchHits = new Set(hits.map((h) => h.id));
    host.classList.remove('hidden');
    host.innerHTML = hits.length
        ? '<div class="text-[0.68rem] uppercase tracking-[0.04em] text-[#777] px-1 pt-0.5 pb-1">' +
          hits.length +
          ' result' +
          (hits.length === 1 ? '' : 's') +
          '</div>' +
          hits
              .slice(0, 40)
              .map((h, i) => {
                  const hit = findElement(h.id);
                  return searchResultHtml(hit.el, hit.layer, i === 0);
              })
              .join('')
        : '<p class="text-[#666] text-[0.8rem] italic">Nothing matches “' + escapeHtml(q) + '”.</p>';
    applyVisibility();
}

function searchResultHtml(el, layer, first) {
    const cat = categoryById(map, el.categoryId);
    return (
        '<button type="button" class="flex items-center gap-2.5 w-full text-left p-1.5 rounded-lg border bg-transparent text-[#ddd] cursor-pointer hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none ' +
        (first ? 'border-accent/35' : 'border-transparent') +
        '" data-goto="' +
        escapeHtml(el.id) +
        '">' +
        '<span class="w-[26px] h-[26px] flex-none rounded-[7px] bg-input-bg flex items-center justify-center text-[0.75rem] overflow-hidden [&_img]:w-full [&_img]:h-full [&_img]:object-cover">' +
        itemIconHtml(el) +
        '</span>' +
        '<span class="min-w-0 flex flex-col"><span class="text-[0.82rem] font-semibold text-white truncate">' +
        escapeHtml(el.name || markerTextOf(el) || 'Unnamed') +
        '</span>' +
        '<span class="text-[0.7rem] text-[#777] truncate">' +
        escapeHtml(cat ? cat.name : '') +
        (map.layers.length > 1 ? ' · ' + escapeHtml(layerPathName(map, layer)) : '') +
        '</span></span>' +
        '</button>'
    );
}

function wireFilterControls() {
    buildSearchIndex();
    const input = byId('filter-search');
    input.addEventListener('input', () => runSearch(input.value));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const first = qs('#search-results [data-goto]');
            if (first) first.click();
        }
        if (e.key === 'Escape') {
            input.value = '';
            runSearch('');
            input.blur();
        }
    });
    byId('search-results').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-goto]');
        if (!btn) return;
        if (isNarrowStage()) viewPanels.setOpen('left', false);
        goToElement(btn.dataset.goto);
    });
    document.addEventListener('keydown', (e) => {
        if (
            e.key !== '/' ||
            /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) ||
            qs('.modal-overlay:not(.hidden)')
        )
            return;
        e.preventDefault();
        viewPanels.setOpen('left', true);
        input.focus();
    });

    const tree = byId('filter-tree');
    tree.addEventListener('click', handleTreeClick);
    tree.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-ft]')) {
            e.preventDefault();
            handleTreeClick(e);
        }
    });
    byId('filter-show-all').addEventListener('click', () => {
        input.value = '';
        runSearch('');
        setAllVisible(true);
    });
    byId('filter-hide-all').addEventListener('click', () => setAllVisible(false));
    byId('filter-show-annotations').addEventListener('change', (e) => {
        filterState.hideAnnotations = !e.target.checked;
        applyVisibility();
        saveCurrentViewPrefs();
    });
}
