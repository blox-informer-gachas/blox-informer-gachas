// Retractable glass panels over a full-width map
function isNarrowStage() {
    return window.matchMedia('(max-width: 720px)').matches;
}

function createOverlayPanels(stageEl, prefsKey) {
    const sides = ['left', 'right'].filter((s) => qs('.side-panel--' + s, stageEl));

    function isOpen(side) {
        return !stageEl.classList.contains(side + '-collapsed');
    }

    function save() {
        if (!prefsKey) return;
        try {
            const prefs = {};
            sides.forEach((s) => {
                prefs[s] = isOpen(s);
            });
            localStorage.setItem(prefsKey, JSON.stringify(prefs));
        } catch (e) {}
    }

    function setOpen(side, open, persist) {
        stageEl.classList.toggle(side + '-collapsed', !open);
        if (open && isNarrowStage()) {
            sides.filter((s) => s !== side).forEach((s) => stageEl.classList.add(s + '-collapsed'));
        }
        if (persist !== false && !isNarrowStage()) save();
    }

    function init() {
        let prefs = {};
        try {
            prefs = (prefsKey && JSON.parse(localStorage.getItem(prefsKey))) || {};
        } catch (e) {}
        sides.forEach((s) => setOpen(s, !isNarrowStage() && prefs[s] !== false, false));
    }

    function unobscuredRange() {
        let left = 0,
            right = stageEl.clientWidth;
        if (isNarrowStage()) return { left, right };
        const lp = qs('.side-panel--left', stageEl),
            rp = qs('.side-panel--right', stageEl);
        if (lp && isOpen('left')) left = lp.offsetLeft + lp.offsetWidth;
        if (rp && isOpen('right')) right = rp.offsetLeft;
        return { left, right };
    }

    return { init, isOpen, setOpen, toggle: (side) => setOpen(side, !isOpen(side)), unobscuredRange };
}
