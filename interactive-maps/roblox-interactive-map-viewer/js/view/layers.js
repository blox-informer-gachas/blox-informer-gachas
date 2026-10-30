// Layer tabs
function renderLayerTabs() {
    const bar = byId('layer-tab-bar');
    if (!map || map.layers.length <= 1) {
        bar.innerHTML = '';
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');
    bar.innerHTML = layerTabRows(map, activeLayerId)
        .map((row, depth) => {
            const parent = layerById(map, row.parentId);
            return (
                '<div class="flex items-center gap-1.5 overflow-x-auto' +
                (depth ? ' pl-[calc((var(--depth)-1)*14px)]' : '') +
                '" style="--depth:' +
                depth +
                '">' +
                (parent
                    ? '<span class="flex-none w-[18px] text-[#555] text-[0.75rem] inline-flex justify-center" title="Inside ' +
                      escapeHtml(parent.name) +
                      '"><i class="fas fa-turn-up fa-rotate-90"></i></span>'
                    : '') +
                row.layers
                    .map((l) => {
                        const on = l.id === activeLayerId,
                            inPath = l.id === row.activeId;
                        const kids = childLayers(map, l.id).length;
                        const size = depth
                            ? 'px-3 py-1.5 text-[0.8rem] rounded-full '
                            : 'px-4 py-2 text-[0.85rem] rounded-lg ';
                        const look = on
                            ? 'bg-accent/[0.12] border-accent text-accent shadow-[inset_0_0_0_1px_#ff6900]'
                            : inPath
                              ? 'bg-input-bg border-accent/50 text-[#ffb27a]'
                              : 'bg-input-bg border-border text-[#ccc] hover:border-accent hover:text-accent';
                        return (
                            '<button type="button" class="' +
                            'flex-none whitespace-nowrap border font-semibold cursor-pointer inline-flex items-center gap-[7px] ' +
                            size +
                            look +
                            '" data-action="switch-layer" data-layer-id="' +
                            escapeHtml(l.id) +
                            '"' +
                            (kids ? ' title="' + kids + ' area' + (kids === 1 ? '' : 's') + ' inside"' : '') +
                            '>' +
                            '<span>' +
                            escapeHtml(l.name) +
                            '</span>' +
                            (kids ? '<i class="fas fa-layer-group text-[0.65rem] opacity-60"></i>' : '') +
                            '</button>'
                        );
                    })
                    .join('') +
                '</div>'
            );
        })
        .join('');
}

function switchLayer(id) {
    const layer = map.layers.find((l) => l.id === id);
    if (!layer) return;
    const changed = activeLayerId !== id;
    activeLayerId = id;
    closeTooltip();
    if (typeof cancelMineDrawing === 'function') cancelMineDrawing();
    renderLayerTabs();
    renderFilterSidebar();
    showLayerOnMap(layer);
    if (changed) syncUrlToElement(null);
}

function wireLayerTabs() {
    byId('layer-tab-bar').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="switch-layer"]');
        if (btn) switchLayer(btn.dataset.layerId);
    });
}
