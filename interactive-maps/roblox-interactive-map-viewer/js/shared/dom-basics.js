// DOM, string and toast helpers
const qs = (s, ctx) => (ctx || document).querySelector(s);
const qsa = (s, ctx) => Array.from((ctx || document).querySelectorAll(s));
const byId = (id) => document.getElementById(id);
const IS_TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
function clickWord(cap) {
    const w = IS_TOUCH ? 'tap' : 'click';
    return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

function escapeHtml(s) {
    return String(s).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
}

function slugify(s) {
    return (
        (s || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'untitled'
    );
}

function formatDaysAgo(d) {
    if (d <= 0) return 'today';
    if (d === 1) return '1 day ago';
    if (d < 7) return d + ' days ago';
    const plural = (n, unit) => n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
    if (d < 30) return plural(Math.round(d / 7), 'week');
    if (d < 365) return plural(Math.max(1, Math.round(d / 30.44)), 'month');
    return plural(Math.round(d / 365.25), 'year');
}

function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 9);
}

function showToast(msg, icon) {
    const host = byId('toastHost');
    const el = document.createElement('div');
    el.className =
        'animate-[toastIn_0.25s_ease_forwards] absolute bottom-0 -translate-x-1/2 bg-[#181818] border border-border text-white text-sm px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 whitespace-nowrap';
    el.innerHTML = '<i class="fas ' + (icon || 'fa-check') + ' text-accent"></i> ' + escapeHtml(msg);
    host.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity .3s';
        setTimeout(() => el.remove(), 300);
    }, 2200);
}
