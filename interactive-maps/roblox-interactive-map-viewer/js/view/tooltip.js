// The info card shown when a marker or zone is clicked
function tooltipImageHtml(src) {
    if (!src) return '';
    if (/^(https?:)?\/\//.test(src) || src.indexOf('data:') === 0) {
        return '<img class="map-tooltip-image" data-gallery-main src="' + escapeHtml(src) + '" alt="">';
    }
    return '<div class="map-tooltip-image map-tooltip-image-icon" data-gallery-main>' + iconSpecHtml(src) + '</div>';
}

function popupMediaHtml(el) {
    const images = [el.tooltipImage].concat(Array.isArray(el.extraImages) ? el.extraImages : []).filter(Boolean);
    if (!images.length) return '';
    const thumbs =
        images.length > 1
            ? '<div class="popup-thumbs">' +
              images
                  .map(
                      (src, i) =>
                          '<button type="button" class="popup-thumb' +
                          (i === 0 ? ' active' : '') +
                          '" data-popup-action="show-image" data-src="' +
                          escapeHtml(src) +
                          '" aria-label="Image ' +
                          (i + 1) +
                          '">' +
                          (isImageIcon(src) ? '<img src="' + escapeHtml(src) + '" alt="">' : iconSpecHtml(src)) +
                          '</button>'
                  )
                  .join('') +
              '</div>'
            : '';
    return tooltipImageHtml(images[0]) + thumbs;
}

function popupVideoHtml(el) {
    const v = videoEmbedInfo(el.videoUrl);
    if (!v) return '';
    if (v.link)
        return (
            '<a class="popup-video-link" href="' +
            escapeHtml(v.link) +
            '" target="_blank" rel="noopener nofollow"><i class="fas fa-circle-play"></i> Watch the video</a>'
        );
    return (
        '<button type="button" class="popup-video" data-popup-action="play-video" data-embed="' +
        escapeHtml(v.embed) +
        '"' +
        (v.thumb ? ' style="background-image:url(&quot;' + escapeHtml(v.thumb) + '&quot;)"' : '') +
        ' aria-label="Play the ' +
        v.site +
        ' video">' +
        '<span class="popup-video-play"><i class="fas fa-play"></i></span><span class="popup-video-site">' +
        v.site +
        '</span></button>'
    );
}

function safeDescriptionHtml(html) {
    if (window.DOMPurify) return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    return escapeHtml(new DOMParser().parseFromString(html, 'text/html').body.textContent || '');
}

function tooltipMetaHtml(el) {
    const cat = categoryById(map, el.categoryId);
    if (!cat) return '';
    const g = groupById(map, cat.groupId);
    return (
        '<div class="map-tooltip-meta"><span class="map-tooltip-cat-icon">' +
        categoryBadgeHtml(map, cat, 16) +
        '</span>' +
        escapeHtml(cat.name) +
        (g ? ' · ' + escapeHtml(g.name) : '') +
        '</div>'
    );
}

function foundButtonHtml(el) {
    const on = foundIds.has(el.id);
    return (
        '<button type="button" class="popup-btn' +
        (on ? ' is-on' : '') +
        '" data-popup-action="toggle-found" data-id="' +
        escapeHtml(el.id) +
        '">' +
        '<i class="fas ' +
        (on ? 'fa-circle-check' : 'fa-circle') +
        '"></i> ' +
        (on ? 'Found' : 'Mark as found') +
        '</button>'
    );
}

function popupContentHtml(el) {
    const portal = el.linkLayerId && map.layers.find((l) => l.id === el.linkLayerId);
    const hasDesc = !!(el.description && el.description.trim());
    return (
        popupMediaHtml(el) +
        '<h3 class="map-tooltip-name">' +
        escapeHtml(el.name || '') +
        '</h3>' +
        tooltipMetaHtml(el) +
        (hasDesc ? '<div class="map-tooltip-desc">' + safeDescriptionHtml(el.description) + '</div>' : '') +
        popupVideoHtml(el) +
        '<div class="popup-actions">' +
        (portal
            ? '<button type="button" class="popup-btn primary" data-popup-action="go-layer" data-layer-id="' +
              escapeHtml(portal.id) +
              '"><i class="fas fa-stairs"></i> Go to ' +
              escapeHtml(portal.name) +
              '</button>'
            : '') +
        (isTrackable(el) ? foundButtonHtml(el) : '') +
        '<span class="popup-icon-btns"><button type="button" class="popup-btn icon-only [.static_&]:hidden" data-popup-action="suggest-fix" data-id="' +
        escapeHtml(el.id) +
        '" title="Suggest a fix: wrong spot, wrong info, gone from the game" aria-label="Suggest a fix"><i class="fas fa-flag"></i></button>' +
        '<button type="button" class="popup-btn icon-only [.static.embed_&]:hidden" data-popup-action="copy-link" data-id="' +
        escapeHtml(el.id) +
        '" title="Copy a link to this spot" aria-label="Copy a link to this spot"><i class="fas fa-link"></i></button></span>' +
        '</div>'
    );
}

let popupFitTimer = 0;
function refreshOpenPopup() {
    const p = cam && cam.lmap._popup;
    if (!p || !p.isOpen()) return;
    p._updateLayout();
    p._updatePosition();
    clearTimeout(popupFitTimer);
    popupFitTimer = setTimeout(fitOpenPopup, 60);
}

function fitOpenPopup() {
    const lmap = cam.lmap,
        p = lmap._popup;
    if (!p || !p.isOpen()) return;
    const pr = p.getElement().getBoundingClientRect(),
        cr = lmap.getContainer().getBoundingClientRect();
    const pad = 16,
        covered = coveredMapSides();
    const top = Math.max(cr.top, 0) + pad,
        bottom = Math.min(cr.bottom, window.innerHeight) - pad;
    const left = cr.left + covered.left + pad,
        right = cr.right - covered.right - pad;
    let dx = 0,
        dy = 0;
    if (pr.top < top) dy = pr.top - top;
    else if (pr.bottom > bottom) dy = Math.min(pr.bottom - bottom, pr.top - top);
    if (pr.left < left) dx = pr.left - left;
    else if (pr.right > right) dx = Math.min(pr.right - right, pr.left - left);
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) lmap.panBy([dx, dy], { animate: !document.hidden });
}

function settlePopupImages(popupEl) {
    if (!popupEl) return;
    qsa('img', popupEl).forEach((img) => {
        if (!img.complete) img.addEventListener('load', refreshOpenPopup, { once: true });
    });
}

function wirePopupActions() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-popup-action]');
        if (!btn) return;
        const action = btn.dataset.popupAction;
        if (action === 'toggle-found') {
            toggleFound(btn.dataset.id);
            btn.outerHTML = foundButtonHtml(findElement(btn.dataset.id).el);
        } else if (action === 'copy-link') {
            copyElementLink(btn.dataset.id);
        } else if (action === 'go-layer') {
            cam.lmap.closePopup();
            switchLayer(btn.dataset.layerId);
        } else if (action === 'suggest-fix') {
            openReportModal(btn.dataset.id);
        } else if (action === 'play-video') {
            const frame = document.createElement('iframe');
            frame.className = 'popup-video-frame';
            frame.src = btn.dataset.embed;
            frame.title = 'Video';
            frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
            frame.setAttribute('allowfullscreen', '');
            btn.replaceWith(frame);
            refreshOpenPopup();
        } else if (action === 'show-image') {
            const wrap = btn.closest('.leaflet-popup-content');
            const main = wrap && wrap.querySelector('[data-gallery-main]');
            if (!main) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = tooltipImageHtml(btn.dataset.src);
            const next = tmp.firstElementChild;
            if (next.tagName === 'IMG') next.addEventListener('load', refreshOpenPopup, { once: true });
            main.replaceWith(next);
            qsa('.popup-thumb', wrap).forEach((b) => b.classList.toggle('active', b === btn));
            refreshOpenPopup();
        }
    });
}

function closeTooltip() {
    if (cam) cam.lmap.closePopup();
}
