// Modal open/close with focus trapping
const modalFocusTraps = {};

function focusableEls(container) {
    return qsa(
        'a[href], button:not([disabled]), textarea, input:not([type="hidden"]), select, [tabindex]:not([tabindex="-1"])',
        container
    ).filter((el) => el.offsetParent !== null);
}

function openModal(id) {
    if (window.hideTooltip) hideTooltip();
    const m = byId(id);
    const box = qs('.modal-box', m);
    box.tabIndex = -1;
    const returnFocus = document.activeElement;
    m.classList.remove('hidden');
    m.style.pointerEvents = '';
    document.documentElement.classList.add('modal-open');
    requestAnimationFrame(() => {
        m.classList.remove('opacity-0');
        m.classList.add('flex');
        box.classList.remove('scale-95');
        if (IS_TOUCH) box.focus({ preventScroll: true });
        else (focusableEls(box)[0] || box).focus();
    });
    const trapHandler = (e) => {
        if (e.key !== 'Tab') return;
        const focusables = focusableEls(box);
        if (!focusables.length) return;
        const first = focusables[0],
            last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
    document.addEventListener('keydown', trapHandler);
    modalFocusTraps[id] = { trapHandler, returnFocus };
}

function closeModal(id) {
    const m = byId(id);
    m.style.pointerEvents = 'none';
    m.classList.add('opacity-0');
    qs('.modal-box', m).classList.add('scale-95');
    setTimeout(() => {
        m.classList.add('hidden');
        m.classList.remove('flex');
        if (!qsa('.modal-overlay:not(.hidden)').length) document.documentElement.classList.remove('modal-open');
    }, 180);
    const trap = modalFocusTraps[id];
    if (trap) {
        document.removeEventListener('keydown', trap.trapHandler);
        if (trap.returnFocus && document.body.contains(trap.returnFocus)) trap.returnFocus.focus();
        delete modalFocusTraps[id];
    }
}

let modalBackdropPress = null;
document.addEventListener('pointerdown', (e) => {
    modalBackdropPress = e.target.classList && e.target.classList.contains('modal-overlay') ? e.target : null;
});
document.addEventListener('click', (e) => {
    if (e.target === modalBackdropPress && modalFocusTraps[e.target.id]) closeModal(e.target.id);
    modalBackdropPress = null;
});

function setSegmentedButtons(cls, dataAttr, value) {
    qsa('.' + cls).forEach((b) => {
        const active = b.dataset[dataAttr] === value;
        b.classList.toggle('border-accent', active);
        b.classList.toggle('text-accent', active);
    });
}
