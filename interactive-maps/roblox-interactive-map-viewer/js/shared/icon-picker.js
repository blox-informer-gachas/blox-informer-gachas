// Icon grid with search (game-icons.net via Iconify)
const ICONIFY_API = 'https://api.iconify.design';
const ICON_SEARCH_SETS = 'game-icons';
const ICON_SEARCH_LIMIT = 96;

const SUGGESTED_GAME_ICONS = [
    'crossed-swords',
    'broadsword',
    'pocket-bow',
    'shield',
    'crowned-skull',
    'skull-crossed-bones',
    'dragon-head',
    'wolf-head',
    'goblin-head',
    'orc-head',
    'spider-face',
    'bear-head',
    'boar',
    'wyvern',
    'kraken-tentacle',
    'hydra',
    'imp-laugh',
    'ghost',
    'open-treasure-chest',
    'locked-chest',
    'cut-diamond',
    'two-coins',
    'swap-bag',
    'health-potion',
    'magic-potion',
    'scroll-unfurled',
    'spell-book',
    'wizard-staff',
    'anvil',
    'cauldron',
    'campfire',
    'castle',
    'tower-flag',
    'village',
    'house',
    'church',
    'pagoda',
    'temple-gate',
    'tavern-sign',
    'shop',
    'cave-entrance',
    'mountain-cave',
    'dungeon-gate',
    'magic-portal',
    'teleport',
    'stairs',
    'ladder',
    'elevator',
    'wooden-door',
    'key',
    'boss-key',
    'bridge',
    'crossroad',
    'wooden-sign',
    'treasure-map',
    'compass',
    'flag-objective',
    'checkered-flag',
    'hooded-figure',
    'wizard-face',
    'ninja-heroic-stance',
    'chess-king',
    'crown',
    'person',
    'public-speaker',
    'anchor',
    'sailboat',
    'bus',
    'horse-head',
    'mining',
    'ore',
    'fishing-pole',
    'wheat',
    'pine-tree',
    'mushroom-gills',
    'crystal-growth',
    'fire',
    'lightning-arc',
    'waterfall',
    'volcano',
    'meat',
    'cooking-pot',
    'beer-stein',
    'bed',
    'save',
    'trophy-cup',
    'sword-altar',
    'hammer-nails',
].map((n) => 'game-icons:' + n);

const SUGGESTED_ICONS = SUGGESTED_GAME_ICONS;
const ICON_CREDIT_HTML =
    '<p class="text-[0.65rem] text-[#666] mt-1.5 [&_a]:text-[#999] [&_a]:underline [&_a:hover]:text-[#ff9a4d]">Game icons by <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> (CC BY 3.0), via Iconify.</p>';
const iconSearchCache = new Map();

function iconLabel(spec) {
    return spec.split(':').pop().replace(/-/g, ' ');
}

function iconMatches(spec, q) {
    return iconLabel(spec).includes(q) || spec.includes(q);
}

function searchIconCatalog(q) {
    if (!iconSearchCache.has(q)) {
        const url =
            ICONIFY_API +
            '/search?query=' +
            encodeURIComponent(q) +
            '&prefixes=' +
            ICON_SEARCH_SETS +
            '&limit=' +
            ICON_SEARCH_LIMIT;
        const req = fetch(url)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((d) => d.icons || []);
        req.catch(() => iconSearchCache.delete(q));
        iconSearchCache.set(q, req);
    }
    return iconSearchCache.get(q);
}

function iconButtonsHtml(specs, active, dataAttr) {
    return specs
        .map(
            (spec) =>
                '<button type="button" class="icon-btn aspect-square rounded-[7px] bg-input-bg border border-border text-[#ccc] cursor-pointer text-[0.85rem] flex items-center justify-center [&:hover:not(.active)]:border-accent [&:hover:not(.active)]:text-white [&.active]:bg-accent/[0.16] [&.active]:border-accent [&.active]:text-accent' +
                (spec === active ? ' active' : '') +
                '" ' +
                dataAttr +
                '="' +
                escapeHtml(spec) +
                '" title="' +
                escapeHtml(iconLabel(spec)) +
                '">' +
                iconSpecHtml(spec) +
                '</button>'
        )
        .join('');
}

// Wires a search input + grid
function attachIconPicker(searchEl, gridEl, getActive, dataAttr, suggested) {
    const pool = suggested || SUGGESTED_ICONS;
    let timer = null;
    let latest = '';

    function paint(q, remote, state) {
        const active = getActive() || '';
        const local = q ? pool.filter((s) => iconMatches(s, q)) : pool;
        const seen = new Set(local);
        const specs = local.concat((remote || []).filter((s) => !seen.has(s)));
        let html = iconButtonsHtml(specs, active, dataAttr);
        if (state === 'loading')
            html +=
                '<p class="col-span-full text-[0.72rem] text-[#777] px-0.5 py-1.5 leading-[1.4]"><i class="fas fa-spinner fa-spin"></i> Searching all icons…</p>';
        else if (state === 'error')
            html +=
                '<p class="col-span-full text-[0.72rem] text-[#777] px-0.5 py-1.5 leading-[1.4]">Couldn’t reach the icon library. Showing suggestions only.</p>';
        else if (!specs.length)
            html =
                '<p class="col-span-full text-[0.72rem] text-[#777] px-0.5 py-1.5 leading-[1.4]">No icons match “' +
                escapeHtml(q) +
                '”. Try another word, like “sword” or “chest”.</p>';
        gridEl.innerHTML = html;
    }

    function render() {
        const q = searchEl.value.trim().toLowerCase();
        latest = q;
        clearTimeout(timer);
        if (q.length < 2) {
            paint(q, null, 'idle');
            return;
        }
        paint(q, null, 'loading');
        timer = setTimeout(() => {
            searchIconCatalog(q).then(
                (icons) => {
                    if (latest === q) paint(q, icons, 'done');
                },
                () => {
                    if (latest === q) paint(q, null, 'error');
                }
            );
        }, 250);
    }

    searchEl.addEventListener('input', render);
    render();
    return { render };
}
