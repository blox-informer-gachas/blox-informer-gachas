// Color picker: square, hue, opacity, swatches, recent colors
const CP_PRESET_SWATCHES = [
    '#ff6900',
    '#fcb900',
    '#ef4444',
    '#22c55e',
    '#3b82f6',
    '#a855f7',
    '#ec4899',
    '#ffffff',
    '#9ca3af',
    '#141414',
];
const CP_RECENT_KEY = 'mapHubRecentColors';
function cpLoadRecent() {
    try {
        return JSON.parse(localStorage.getItem(CP_RECENT_KEY)) || [];
    } catch (e) {
        return [];
    }
}
function cpPushRecent(hex) {
    if (CP_PRESET_SWATCHES.some((c) => c.toLowerCase() === hex.toLowerCase())) return;
    const list = cpLoadRecent().filter((c) => c.toLowerCase() !== hex.toLowerCase());
    list.unshift(hex);
    try {
        localStorage.setItem(CP_RECENT_KEY, JSON.stringify(list.slice(0, 8)));
    } catch (e) {}
}
function cpHexToRgb(hex) {
    const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i) || ['', 'ff', 'ff', 'ff'];
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function cpRgbToHex(r, g, b) {
    return (
        '#' +
        [r, g, b]
            .map((v) =>
                Math.max(0, Math.min(255, Math.round(v)))
                    .toString(16)
                    .padStart(2, '0')
            )
            .join('')
    );
}
function cpRgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}
function cpHsvToRgb(h, s, v) {
    const c = v * s,
        x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
        m = v - c;
    let r = 0,
        g = 0,
        b = 0;
    if (h < 60) {
        r = c;
        g = x;
    } else if (h < 120) {
        r = x;
        g = c;
    } else if (h < 180) {
        g = c;
        b = x;
    } else if (h < 240) {
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
// A horizontal slider on pointer capture, like the color square
function cpMakeSlider(el, min, max, onValue) {
    const thumb = el.querySelector('.cp-thumb');
    let value = min;
    function show(v) {
        value = v;
        thumb.style.left = ((v - min) / (max - min)) * 100 + '%';
        el.setAttribute('aria-valuenow', Math.round(v));
    }
    function fromPointer(e) {
        const r = el.getBoundingClientRect();
        const v = min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min);
        show(v);
        onValue(v);
    }
    el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.focus();
        el.setPointerCapture(e.pointerId);
        fromPointer(e);
        const onMove = (ev) => fromPointer(ev);
        const onEnd = () => {
            el.dispatchEvent(new CustomEvent('cp-slider-end', { bubbles: true }));
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onEnd);
            el.removeEventListener('pointercancel', onEnd);
        };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onEnd);
        el.addEventListener('pointercancel', onEnd);
    });
    el.addEventListener('keydown', (e) => {
        const step = ((e.shiftKey ? 10 : 1) * (max - min)) / 100;
        const d = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
        if (d === undefined) return;
        e.preventDefault();
        const v = Math.max(min, Math.min(max, value + d));
        show(v);
        onValue(v);
    });
    return { show };
}

function createColorPicker(opts) {
    let hex = '#ffffff',
        alpha = 100,
        panel = null,
        hsv = { h: 0, s: 0, v: 1 },
        openedHex = null;
    let hueSlider = null,
        alphaSlider = null;
    const swatchEl = opts.trigger.querySelector('.cp-trigger-swatch');

    function syncTriggerSwatch() {
        if (!swatchEl) return;
        const rgb = cpHexToRgb(hex);
        swatchEl.style.background = opts.alpha
            ? 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha / 100 + ')'
            : hex;
    }
    function fireChange() {
        syncTriggerSwatch();
        if (opts.onChange) opts.onChange(hex, opts.alpha ? alpha : null);
    }
    function setFromRgb(r, g, b) {
        hex = cpRgbToHex(r, g, b);
        hsv = cpRgbToHsv(r, g, b);
        if (panel) renderPanelState();
        fireChange();
    }

    function closePanel() {
        if (!panel) return;
        const hexInput = panel.querySelector('.cp-hex-input');
        const v = hexInput.value.trim();
        if (/^#?[0-9a-f]{6}$/i.test(v)) {
            const rgb = cpHexToRgb(v.startsWith('#') ? v : '#' + v);
            const typedHex = cpRgbToHex(rgb.r, rgb.g, rgb.b);
            if (typedHex.toLowerCase() !== hex.toLowerCase()) setFromRgb(rgb.r, rgb.g, rgb.b);
        }
        // One recent color per pick, not one per drag step
        if (hex.toLowerCase() !== openedHex) cpPushRecent(hex);
        panel.remove();
        panel = null;
        document.removeEventListener('mousedown', onDocMouseDown, true);
        document.removeEventListener('keydown', onDocKeyDown, true);
        window.removeEventListener('resize', closePanel);
        window.removeEventListener('scroll', closePanel, true);
    }
    function onDocMouseDown(e) {
        if (panel && !panel.contains(e.target) && e.target !== opts.trigger && !opts.trigger.contains(e.target))
            closePanel();
    }
    function onDocKeyDown(e) {
        if (e.key !== 'Escape' || !panel) return;
        e.preventDefault();
        e.stopPropagation();
        closePanel();
        opts.trigger.focus({ preventScroll: true });
    }

    function renderPanelState() {
        const rgb = cpHsvToRgb(hsv.h, hsv.s, hsv.v);
        const sv = panel.querySelector('.cp-sv');
        sv.style.background = 'hsl(' + hsv.h + ',100%,50%)';
        const pointer = panel.querySelector('.cp-sv-pointer');
        pointer.style.left = hsv.s * 100 + '%';
        pointer.style.top = (1 - hsv.v) * 100 + '%';
        hueSlider.show(hsv.h);
        const hexInput = panel.querySelector('.cp-hex-input');
        if (document.activeElement !== hexInput) hexInput.value = hex;
        if (opts.alpha) {
            alphaSlider.show(alpha);
            panel.querySelector('.cp-alpha-track:not(.cp-swatch-checker)').style.background =
                'linear-gradient(to right, transparent, ' + hex + ')';
        }
    }

    function openPanel() {
        if (panel) {
            closePanel();
            return;
        }
        openedHex = hex.toLowerCase();
        panel = document.createElement('div');
        panel.className = 'cp-panel';
        panel.innerHTML =
            '<div class="cp-sv">' +
            '<div class="cp-sv-white"></div><div class="cp-sv-black"></div>' +
            '<div class="cp-sv-pointer"></div>' +
            '</div>' +
            '<div class="cp-slider-row cp-slider cp-hue-slider" role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><div class="cp-hue-track"></div><div class="cp-thumb"></div></div>' +
            (opts.alpha
                ? '<div class="cp-slider-row cp-slider cp-alpha-slider" role="slider" tabindex="0" aria-label="Opacity" aria-valuemin="0" aria-valuemax="100"><div class="cp-alpha-track cp-swatch-checker"></div><div class="cp-alpha-track"></div><div class="cp-thumb"></div></div>'
                : '') +
            '<div class="cp-row">' +
            '<input type="text" class="cp-hex-input" spellcheck="false" />' +
            ('EyeDropper' in window
                ? '<button type="button" class="cp-eyedrop-btn" title="Pick color from screen"><i class="fas fa-eye-dropper"></i></button>'
                : '') +
            '</div>' +
            '<div class="cp-swatches">' +
            (opts.allowUnset
                ? '<button type="button" class="cp-swatch-btn cp-swatch-none" data-cp-unset title="Use default"><i class="fas fa-slash"></i></button>'
                : '') +
            CP_PRESET_SWATCHES.map(
                (c) =>
                    '<button type="button" class="cp-swatch-btn" data-cp-swatch="' +
                    c +
                    '" style="background:' +
                    c +
                    '"></button>'
            ).join('') +
            '</div>' +
            (cpLoadRecent().length
                ? '<div class="cp-section-label">Recently Used</div><div class="cp-swatches">' +
                  cpLoadRecent()
                      .map(
                          (c) =>
                              '<button type="button" class="cp-swatch-btn" data-cp-swatch="' +
                              c +
                              '" style="background:' +
                              c +
                              '" title="Recently used"></button>'
                      )
                      .join('') +
                  '</div>'
                : '');
        document.body.appendChild(panel);
        const r = opts.trigger.getBoundingClientRect();
        const top = Math.min(r.bottom + 6, window.innerHeight - panel.offsetHeight - 8);
        const left = Math.min(r.left, window.innerWidth - panel.offsetWidth - 8);
        panel.style.top = Math.max(8, top) + 'px';
        panel.style.left = Math.max(8, left) + 'px';
        hueSlider = cpMakeSlider(panel.querySelector('.cp-hue-slider'), 0, 360, (v) => {
            hsv.h = Math.min(359.9, v);
            const rgb = cpHsvToRgb(hsv.h, hsv.s, hsv.v);
            hex = cpRgbToHex(rgb.r, rgb.g, rgb.b);
            renderPanelState();
            fireChange();
        });
        if (opts.alpha) {
            alphaSlider = cpMakeSlider(panel.querySelector('.cp-alpha-slider'), 0, 100, (v) => {
                alpha = Math.round(v);
                fireChange();
            });
        }
        renderPanelState();

        const sv = panel.querySelector('.cp-sv');
        function dragSv(e) {
            const rect = sv.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            hsv.s = x;
            hsv.v = 1 - y;
            const rgb = cpHsvToRgb(hsv.h, hsv.s, hsv.v);
            hex = cpRgbToHex(rgb.r, rgb.g, rgb.b);
            renderPanelState();
            fireChange();
        }
        sv.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            sv.setPointerCapture(e.pointerId);
            dragSv(e);
            const onMove = (ev) => dragSv(ev);
            const onEnd = () => {
                sv.removeEventListener('pointermove', onMove);
                sv.removeEventListener('pointerup', onEnd);
                sv.removeEventListener('pointercancel', onEnd);
            };
            sv.addEventListener('pointermove', onMove);
            sv.addEventListener('pointerup', onEnd, { once: true });
            sv.addEventListener('pointercancel', onEnd, { once: true });
        });

        const hexInput = panel.querySelector('.cp-hex-input');
        function commitHexInput() {
            const v = hexInput.value.trim();
            if (/^#?[0-9a-f]{6}$/i.test(v)) {
                const rgb = cpHexToRgb(v.startsWith('#') ? v : '#' + v);
                setFromRgb(rgb.r, rgb.g, rgb.b);
            } else {
                hexInput.value = hex;
            }
        }
        hexInput.addEventListener('change', commitHexInput);
        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commitHexInput();
        });
        const eyedropBtn = panel.querySelector('.cp-eyedrop-btn');
        if (eyedropBtn) {
            eyedropBtn.addEventListener('click', async () => {
                try {
                    const result = await new window.EyeDropper().open();
                    const rgb = cpHexToRgb(result.sRGBHex);
                    setFromRgb(rgb.r, rgb.g, rgb.b);
                } catch (e) {}
            });
        }
        panel.addEventListener('click', (e) => {
            const unsetBtn = e.target.closest('[data-cp-unset]');
            if (unsetBtn) {
                if (opts.onUnset) opts.onUnset();
                closePanel();
                return;
            }
            const swatchBtn = e.target.closest('[data-cp-swatch]');
            if (swatchBtn) {
                const rgb = cpHexToRgb(swatchBtn.dataset.cpSwatch);
                setFromRgb(rgb.r, rgb.g, rgb.b);
            }
        });

        setTimeout(() => document.addEventListener('mousedown', onDocMouseDown, true), 0);
        document.addEventListener('keydown', onDocKeyDown, true);
        window.addEventListener('resize', closePanel);
        window.addEventListener('scroll', closePanel, true);
    }

    opts.trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        openPanel();
    });

    return {
        setValue(newHex, newAlpha) {
            hex = newHex || '#ffffff';
            if (opts.alpha) alpha = newAlpha === undefined || newAlpha === null ? 100 : newAlpha;
            const rgb = cpHexToRgb(hex);
            hsv = cpRgbToHsv(rgb.r, rgb.g, rgb.b);
            syncTriggerSwatch();
            if (panel) renderPanelState();
        },
        getHex() {
            return hex;
        },
        getAlpha() {
            return alpha;
        },
        destroy() {
            closePanel();
        },
    };
}
function attachColorPicker(input, opts) {
    opts = opts || {};
    if (!input || input._colorPicker) return input && input._colorPicker;
    input.style.display = 'none';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className =
        (input.className || 'w-10 h-9 rounded-lg border border-border bg-input-bg') +
        ' cp-trigger relative overflow-hidden';
    trigger.title = input.title || 'Choose a color';
    trigger.innerHTML =
        '<span class="cp-trigger-checker absolute inset-0"></span><span class="cp-trigger-swatch absolute inset-0"></span>';
    input.insertAdjacentElement('afterend', trigger);
    const picker = createColorPicker({
        trigger,
        alpha: !!opts.alpha,
        allowUnset: !!opts.allowUnset,
        onChange: (hex, alpha) => {
            input.value = hex;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            if (opts.onChange) opts.onChange(hex, alpha);
        },
        onUnset: opts.onUnset,
    });
    picker.setValue(input.value, opts.alpha ? opts.initialAlpha : undefined);
    input._colorPicker = picker;
    input._colorPickerTrigger = trigger;
    return picker;
}
function setColorInputValue(input, hex, alpha) {
    input.value = hex;
    if (input._colorPicker) input._colorPicker.setValue(hex, alpha);
}
function updateRangeFill(input) {
    const min = parseFloat(input.min) || 0,
        max = parseFloat(input.max) || 100;
    const pct = max > min ? ((parseFloat(input.value) - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--range-fill', Math.max(0, Math.min(100, pct)) + '%');
}
function setRangeValue(input, value) {
    input.value = value;
    updateRangeFill(input);
}
document.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range' && e.target.classList.contains('ui-range'))
        updateRangeFill(e.target);
});
