document.addEventListener('DOMContentLoaded', () => {
    /* --- STATE --- */
    const units = ['hex', 'rgb', 'hsl'];
    let currentUnitIndex = 0; 
    let lastPassStatus = null; 
    let firstUserInteractionOccurred = false;
    let soundEnabled = false;
    let passingHistory = []; // Stores objects: { fg: {r,g,b,a}, bg: {r,g,b}, isNonText: bool }

    /* --- DOM ELEMENTS --- */
    const fgPicker = document.getElementById('fg-picker');
    const fgAlpha = document.getElementById('fg-alpha');
    const bgPicker = document.getElementById('bg-picker');
    const fontSizeSelect = document.getElementById('font-size');
    const fontWeightSelect = document.getElementById('font-weight');
    const noTextCheckbox = document.getElementById('no-text-legend-checkbox');
    const unitGroup = document.getElementById('unit-group');
    const contrastRatioSpan = document.getElementById('contrast-ratio');
    const neededRatioSpan = document.getElementById('needed-ratio');
    const aaOverallStatusSpan = document.getElementById('aa-overall-status');
    const aaTextTypeSpan = document.getElementById('aa-text-type');
    const statusAnnouncer = document.getElementById('status-announcer');
    const resultsContainer = document.getElementById('results-container');
    const successMessage = document.getElementById('success-message');
    const suggestionsContainer = document.querySelector('.suggestions-container');
    const suggestionsList = document.getElementById('suggestions-list');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const unitToggleBtn = document.getElementById('unit-toggle-btn');
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const fgCopyBtn = document.getElementById('fg-copy-btn');
    const bgCopyBtn = document.getElementById('bg-copy-btn');

    /* --- AUDIO FEEDBACK --- */
    let audioCtx = null;

    const initAudio = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    };

    const playTone = (freq, type = 'sine', duration = 0.1, volume = 0.05) => {
        if (!soundEnabled) return;
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    };

    const playPassSound = () => {
        playTone(660, 'sine', 0.15);
        setTimeout(() => playTone(880, 'sine', 0.15), 100);
    };

    const playFailSound = () => {
        playTone(330, 'square', 0.2, 0.03);
    };

    /* --- TOOLTIP ESC LOGIC --- */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.hasAttribute('data-tooltip')) {
                activeEl.classList.add('tooltip-hidden');
                activeEl.addEventListener('blur', () => activeEl.classList.remove('tooltip-hidden'), { once: true });
            }
            const hoveredEls = document.querySelectorAll('[data-tooltip]:hover');
            hoveredEls.forEach(el => {
                el.classList.add('tooltip-hidden');
                el.addEventListener('mouseleave', () => el.classList.remove('tooltip-hidden'), { once: true });
            });
        }
    });

    /* --- SANITIZE HELPER --- */
    const sanitizeHex = (v) => /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#000';
    /* --- ICON HELPER --- */
    const svgIcon = (id, extra = '') => `<svg class="icon"${extra}><use href="#icon-${id}"/></svg>`;

    /* --- HELPERS --- */
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return null;
        return {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        };
    };

    const rgbToHex = (rgb) => {
        const toH = (v) => Math.round(v).toString(16).padStart(2, '0');
        let hex = "#" + toH(rgb.r) + toH(rgb.g) + toH(rgb.b);
        if (rgb.a !== undefined && rgb.a < 1) {
            hex += toH(Math.round(rgb.a * 255));
        }
        return hex;
    };
    const getFullFgRgb = () => {
        const rgb = hexToRgb(fgPicker.value);
        const a = fgAlpha.value === "" ? 100 : parseInt(fgAlpha.value);
        return { ...rgb, a: Math.max(0, Math.min(100, a)) / 100 };
    };
    const formatColor = (rgbObj, format) => {
        const a = rgbObj.a !== undefined ? rgbObj.a : 1.0;

        if (format === 'rgb') {
            if (a < 1) {
                return `rgba(${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b}, ${a.toFixed(2)})`;
            }
            return `rgb(${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b})`;
        }

        if (format === 'hsl') {
            const { h, s, l } = rgbToHsl(rgbObj);
            const hh = Math.round(h * 360);
            const ss = Math.round(s * 100);
            const ll = Math.round(l * 100);
            if (a < 1) {
                return `hsla(${hh}, ${ss}%, ${ll}%, ${a.toFixed(2)})`;
            }
            return `hsl(${hh}, ${ss}%, ${ll}%)`;
        }

        const toH = (v) => Math.round(v).toString(16).padStart(2, '0');
        const hex = "#" + toH(rgbObj.r) + toH(rgbObj.g) + toH(rgbObj.b);
        if (a < 1) return `${hex} ${Math.round(a * 100)}%`;
        return hex;
    };

    const updateUnitToggleButton = () => {
        const nextIndex = (currentUnitIndex + 1) % units.length;
        const nextUnit = units[nextIndex].toUpperCase();
        unitToggleBtn.textContent = nextUnit;
        renderHistory(); 
    };

    /* --- HISTORY LOGIC --- */
    function isCombinationStored(fg, bg, isNonText) {
        const key = `${rgbToHex(fg)}_${rgbToHex(bg)}_${isNonText}`;
        return passingHistory.some(h => `${rgbToHex(h.fg)}_${rgbToHex(h.bg)}_${h.isNonText}` === key);
    }

    function saveHistory() {
        if (chrome?.storage?.local) {
            chrome.storage.local.set({ passingHistory });
        }
    }

    function addCombination(fg, bg, isNonText) {
        const key = `${rgbToHex(fg)}_${rgbToHex(bg)}_${isNonText}`;
        const index = passingHistory.findIndex(h => `${rgbToHex(h.fg)}_${rgbToHex(h.bg)}_${h.isNonText}` === key);

        if (index > -1) {
            passingHistory.splice(index, 1);
        } else {
            passingHistory.unshift({ fg, bg, isNonText });
            if (passingHistory.length > 30) passingHistory.pop();
        }

        saveHistory();
        renderHistory();
        checkContrast(false);
    }

    function renderHistory() {
        historyList.innerHTML = '';
        if (passingHistory.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-history-msg';
            emptyMsg.textContent = "Save your favourite passing combinations here";
            historyList.appendChild(emptyMsg);
            clearHistoryBtn.style.display = 'none';
            return;
        }

        clearHistoryBtn.style.display = 'block';
        const activeUnit = units[currentUnitIndex];
        
        passingHistory.forEach(item => {
            const swatch = document.createElement('div');
            swatch.className = 'history-swatch';
            swatch.tabIndex = 0;
            swatch.role = "button";
            
            const fgFlat = alphaBlend(item.fg, item.bg, item.fg.a);

            swatch.style.backgroundColor = rgbToHex(item.bg);
            swatch.style.color = rgbToHex(fgFlat);
            
            if (item.isNonText) {
                swatch.innerHTML = svgIcon('check');
            } else {
                swatch.textContent = "PASS";
            }
            
            const fgStr = formatColor(item.fg, activeUnit);
            const bgStr = formatColor(item.bg, activeUnit);
            const tooltipText = `Copy ${fgStr} on ${bgStr}`;
            swatch.setAttribute('data-tooltip', tooltipText);
            swatch.ariaLabel = tooltipText;

            swatch.onclick = () => {
                const combined = `${fgStr} on ${bgStr}`;
                navigator.clipboard.writeText(combined).catch(() => {});
                const originalContent = swatch.innerHTML;
                swatch.innerHTML = svgIcon('copy');
                setTimeout(() => { swatch.innerHTML = originalContent; }, 1000);
            };

            swatch.onkeydown = (e) => {
                if (e.key === 'Enter') swatch.click();
            };
            historyList.appendChild(swatch);
        });
    }

    /* --- LISTENERS --- */
    [fgPicker, fgAlpha, bgPicker, fontSizeSelect, fontWeightSelect, noTextCheckbox].forEach(el => {
        el.addEventListener('input', () => triggerCheck(false));
    });

    unitToggleBtn.addEventListener('click', () => {
        currentUnitIndex = (currentUnitIndex + 1) % units.length;
        updateUnitToggleButton();
        triggerCheck(false); 
    });

    soundToggleBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundToggleBtn.querySelector('svg use').setAttribute('href', soundEnabled ? '#icon-vol-high' : '#icon-vol-xmark');
        soundToggleBtn.setAttribute('data-tooltip', soundEnabled ? 'Mute sound feedback' : 'Enable sound feedback');
    });

    clearHistoryBtn.addEventListener('click', () => {
        passingHistory = [];
        saveHistory();
        renderHistory();
        checkContrast(false);
    });

    document.querySelectorAll('input[name="font-size-unit"]').forEach(radio => {
        radio.addEventListener('change', () => {
            updateFontSizeOptions();
            triggerCheck(false);
        });
    });

    noTextCheckbox.addEventListener('change', (e) => {
        const isNoText = e.target.checked;
        fontSizeSelect.disabled = isNoText;
        fontWeightSelect.disabled = isNoText;
        document.querySelectorAll('input[name="font-size-unit"]').forEach(r => r.disabled = isNoText);
        unitGroup.classList.toggle('disabled', isNoText);
        triggerCheck(false);
    });

    const copyToClipboard = (btn, text) => {
        navigator.clipboard.writeText(text).catch(() => {});
        const useEl = btn.querySelector('svg use');
        if (useEl) {
            useEl.setAttribute('href', '#icon-check');
            setTimeout(() => { useEl.setAttribute('href', '#icon-copy'); }, 1500);
        }
    };

    fgCopyBtn.addEventListener('click', (e) => copyToClipboard(e.currentTarget, formatColor(getFullFgRgb(), units[currentUnitIndex])));
    bgCopyBtn.addEventListener('click', (e) => copyToClipboard(e.currentTarget, formatColor(hexToRgb(bgPicker.value), units[currentUnitIndex])));

    function updateFontSizeOptions() {
        const unitEl = document.querySelector('input[name="font-size-unit"]:checked');
        const unit = unitEl ? unitEl.value : 'px';
        const prevIdx = fontSizeSelect.selectedIndex >= 0 ? fontSizeSelect.selectedIndex : 0;
        fontSizeSelect.innerHTML = '';
        const opts = unit === 'pt'
            ? [{ v: 12, t: 'Less than 14' }, { v: 14, t: '14 to 17.99' }, { v: 18, t: '18 or more' }]
            : [{ v: 16, t: 'Less than 18.5' }, { v: 18.5, t: '18.5 to 23.99' }, { v: 24, t: '24 or more' }];

        opts.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.v;
            o.textContent = opt.t;
            fontSizeSelect.appendChild(o);
        });
        fontSizeSelect.selectedIndex = prevIdx;
    }

    function triggerCheck(isInitial = false) {
        if (!isInitial) initAudio();
        checkContrast(isInitial);
    }

    function getBadgeStyles(isEnlarged = false) {
        const weight = fontWeightSelect.value === '700' ? 'bold' : 'normal';
        if (isEnlarged) return { size: '19px', weight: 'bold' };
        const idx = fontSizeSelect.selectedIndex;
        const sizeMap = ['16px', '20px', '24px'];
        return { size: sizeMap[idx] || '16px', weight: weight };
    }

    function checkContrast(isInitial = false) {
        const isNonText = noTextCheckbox.checked;
        const fgRaw = getFullFgRgb(); 
        const bgRgb = hexToRgb(bgPicker.value);
        const activeUnit = units[currentUnitIndex];

        const fgDisplayColor = formatColor(fgRaw, activeUnit);
        const bgDisplayColor = formatColor(bgRgb, activeUnit);

        fgPicker.style.opacity = fgRaw.a;
        fgCopyBtn.setAttribute('data-tooltip', "Copy " + fgDisplayColor);
        fgCopyBtn.setAttribute('aria-label', "Copy " + fgDisplayColor);
        bgCopyBtn.setAttribute('data-tooltip', "Copy " + bgDisplayColor);
        bgCopyBtn.setAttribute('aria-label', "Copy " + bgDisplayColor);

        const fgFlat = alphaBlend(fgRaw, bgRgb, fgRaw.a);

        const ratio = getContrastRatio(fgFlat, bgRgb);
        contrastRatioSpan.textContent = ratio.toFixed(2);

        let needed = 4.5;
        let isLarge = false;

        if (isNonText) {
            needed = 3.0;
        } else {
            const fs = parseFloat(fontSizeSelect.value);
            const unit = document.querySelector('input[name="font-size-unit"]:checked').value;
            const weight = parseInt(fontWeightSelect.value, 10);

            if (unit === 'pt') {
                isLarge = (fs >= 18) || (fs >= 14 && weight >= 700);
            } else {
                isLarge = (fs >= 24) || (fs >= 18.5 && weight >= 700);
            }
            needed = isLarge ? 3.0 : 4.5;
        }

        const passes = ratio >= needed;
        const isPartial = !isNonText && ratio >= 3.0 && ratio < 4.5;

        if (!isInitial) {
            if (!firstUserInteractionOccurred) {
                if (passes) playPassSound(); else playFailSound();
                statusAnnouncer.textContent = passes ? 'Passes' : 'Fails';
                firstUserInteractionOccurred = true;
            } else if (lastPassStatus !== null && lastPassStatus !== passes) {
                if (passes) playPassSound(); else playFailSound();
                statusAnnouncer.textContent = passes ? 'Passes' : 'Fails';
            }
        }
        lastPassStatus = passes;

        let statusColor = 'var(--fail-color)';
        if (passes) statusColor = 'var(--pass-color)';
        else if (isPartial) statusColor = 'var(--warning-color)';

        contrastRatioSpan.style.color = statusColor;
        resultsContainer.style.borderColor = statusColor;
        neededRatioSpan.textContent = needed.toFixed(2);

        const bStyles = getBadgeStyles();
        if (isNonText) {
            aaOverallStatusSpan.innerHTML = svgIcon(passes ? 'check' : 'xmark', ` style="font-size:${bStyles.size}; line-height:1;"`);
        } else {
            aaOverallStatusSpan.textContent = passes ? 'PASS' : 'FAIL';
            aaOverallStatusSpan.style.fontSize = bStyles.size;
            aaOverallStatusSpan.style.fontWeight = bStyles.weight;
        }
        aaOverallStatusSpan.style.color = rgbToHex(fgFlat);
        aaOverallStatusSpan.style.backgroundColor = bgPicker.value;
        aaTextTypeSpan.textContent = isNonText ? '(Graphics/UI)' : `(${isLarge ? 'Large text' : 'Normal text'})`;

        if (passes) {
            suggestionsContainer.style.display = 'none';
            successMessage.style.display = 'block';
            const scNumber = isNonText ? "1.4.11" : "1.4.3";
            const scUrl = isNonText ? "https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast" : "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html";
            const isFav = isCombinationStored(fgRaw, bgRgb, isNonText);
            const favIcon = isFav ? 'star-solid' : 'star-regular';
            const fgStr = formatColor(fgRaw, activeUnit);
            const bgStr = formatColor(bgRgb, activeUnit);
            const comboStr = `${fgStr} on ${bgStr}`;

            successMessage.innerHTML = `
                <div style="font-size: 15px; margin-bottom: 2px;">Well done!</div>
                <div style="padding-right: 64px;">Your contrast meets <a href="${scUrl}" target="_blank" style="color: inherit; text-decoration: underline;">WCAG SC${scNumber}</a>!</div>
                <div class="success-btn-group">
                    <button id="success-fav-btn" class="fav-btn" type="button" data-tooltip="Store as favourite" aria-label="Add to stored combinations">
                        ${svgIcon(favIcon)}
                    </button>
                    <button id="success-copy-btn" class="copy-small-btn" type="button" data-tooltip="Copy ${comboStr}" aria-label="Copy ${comboStr}">
                        ${svgIcon('copy')}
                    </button>
                </div>
            `;
            document.getElementById('success-fav-btn').onclick = () => addCombination(fgRaw, bgRgb, isNonText);
            document.getElementById('success-copy-btn').onclick = () => copyToClipboard(document.getElementById('success-copy-btn'), comboStr);
        } else {
            suggestionsContainer.style.display = 'flex';
            successMessage.style.display = 'none';
            generateSuggestions(fgRaw, bgRgb, needed, isNonText, isLarge, ratio);
        }
    }

    function generateSuggestions(fgRaw, bgRgb, needed, isNonText, isLarge, currentRatio) {
        suggestionsList.innerHTML = '';
        const activeUnit = units[currentUnitIndex];
        const currentBgHex = sanitizeHex(bgPicker.value);
        const currentBgActive = formatColor(bgRgb, activeUnit);
        const currentFrontActive = formatColor(fgRaw, activeUnit);
        const currentFrontAlphaValidHex = sanitizeHex(rgbToHex(fgRaw)); 
        
        let count = 0;

        const addSuggestion = (html) => {
            const div = document.createElement('div');
            div.className = 'suggestion';
            div.innerHTML = html;
            suggestionsList.appendChild(div);
            count++;
            return div;
        };

        const getBadgeHTML = (isPass, fg, bg, isEnlarged = false) => {
            const styles = getBadgeStyles(isEnlarged);
            if (isNonText) {
                return svgIcon(isPass ? 'check' : 'xmark', ` style="font-size:${styles.size}; line-height:1;"`);
            }
            const label = isPass ? 'PASS' : 'FAIL';
            return `<span style="font-size:${styles.size}; font-weight:${styles.weight}; line-height:1;">${label}</span>`;
        };

        if (!isNonText && currentRatio >= 3.0 && currentRatio < 4.5) {
            addSuggestion(`<div class="status" style="color:${currentFrontAlphaValidHex}; background-color:${currentBgHex}; padding: 0;">${svgIcon('check', ' style="font-size:16px;"')}</div>
                  <div style="flex-grow:1;"><div style="color:var(--color-border-input); font-weight:500;">Use this colour combination only for <b>graphics and User Interface components</b>, not for text on background.</div></div>`);
        }

        if (!isNonText && !isLarge && currentRatio >= 3.0) {
            addSuggestion(`<div class="status" style="color:${currentFrontAlphaValidHex}; background-color:${currentBgHex}; padding: 0;">${getBadgeHTML(true, currentFrontAlphaValidHex, currentBgHex, true)}</div>
                  <div style="flex-grow:1;"><div style="color:var(--color-border-input); font-weight:500;">Enlarge text: min 18.5px bold or 24px regular.</div>
                  <div style="font-size:12px; color:var(--color-border-input);">Ratio: ${currentRatio.toFixed(2)} with Background ${currentBgActive}</div></div>`);
        }

        const setupSuggestionButtons = (el, fg, bg, isNonText, colorStr) => {
            const copyBtn = el.querySelector('.copy-small-btn');
            const favBtn = el.querySelector('.fav-btn');
            const isFav = isCombinationStored(fg, bg, isNonText);
            favBtn.querySelector('svg use').setAttribute('href', isFav ? '#icon-star-solid' : '#icon-star-regular');
            copyBtn.onclick = () => copyToClipboard(copyBtn, colorStr);
            favBtn.onclick = () => addCombination(fg, bg, isNonText);
        };

        const solidFg = { ...fgRaw, a: 1.0 };
        if (getContrastRatio(solidFg, bgRgb) >= needed && fgRaw.a < 1.0) {
            const pA = findPassingAlpha(fgRaw, bgRgb, needed);
            if (pA) {
                const colorObj = { ...fgRaw, a: pA };
                const colorStr = formatColor(colorObj, activeUnit);
                const el = addSuggestion(`<div class="status" style="color:${rgbToHex(colorObj)}; background-color:${currentBgHex};">${getBadgeHTML(true)}</div>
                    <div style="flex-grow:1; display:flex; flex-direction:column;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:var(--color-border-input);">Set <b>Front opacity</b> to <b style="font-family:monospace;">${Math.round(pA * 100)}%</b></span>
                            <div class="suggestion-btn-group">
                                <button class="fav-btn" type="button" data-tooltip="Store as favourite" aria-label="Add to stored combinations">${svgIcon('star-regular')}</button>
                                <button class="copy-small-btn" type="button" data-tooltip="Copy ${colorStr}" aria-label="Copy ${colorStr}">${svgIcon('copy')}</button>
                            </div>
                        </div>
                        <span style="font-size:12px; color:var(--color-border-input);">Ratio: ${needed.toFixed(2)} with Background ${currentBgActive}</span>
                    </div>`);
                setupSuggestionButtons(el, colorObj, bgRgb, isNonText, colorStr);
            }
        }

        const sFg = findPassingFgColor(fgRaw, bgRgb, fgRaw.a, needed);
        if (sFg) {
            const colorObj = { ...sFg.rgb, a: fgRaw.a };
            const colorStr = formatColor(colorObj, activeUnit);
            const el = addSuggestion(`<div class="status" style="color:${rgbToHex(colorObj)}; background-color:${currentBgHex};">${getBadgeHTML(true)}</div>
                <div style="flex-grow:1; display:flex; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--color-border-input);">Replace <b>Front</b> with <b style="font-family:monospace;">${colorStr}</b></span>
                        <div class="suggestion-btn-group">
                            <button class="fav-btn" type="button" data-tooltip="Store as favourite" aria-label="Add to stored combinations">${svgIcon('star-regular')}</button>
                            <button class="copy-small-btn" type="button" data-tooltip="Copy ${colorStr}" aria-label="Copy ${colorStr}">${svgIcon('copy')}</button>
                        </div>
                    </div>
                    <span style="font-size:12px; color:var(--color-border-input);">Ratio: ${sFg.ratio.toFixed(2)} with Background ${currentBgActive}</span>
                </div>`);
            setupSuggestionButtons(el, colorObj, bgRgb, isNonText, colorStr);
        }

        const sBg = findPassingBgColor(fgRaw, bgRgb, fgRaw.a, needed);
        if (sBg) {
            const colorStr = formatColor(sBg.rgb, activeUnit);
            const el = addSuggestion(`<div class="status" style="color:${currentFrontAlphaValidHex}; background-color:${rgbToHex(sBg.rgb)};">${getBadgeHTML(true)}</div>
                <div style="flex-grow:1; display:flex; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--color-border-input);">Replace <b>Background</b> with <b style="font-family:monospace;">${colorStr}</b></span>
                        <div class="suggestion-btn-group">
                            <button class="fav-btn" type="button" data-tooltip="Store as favourite" aria-label="Add to stored combinations">${svgIcon('star-regular')}</button>
                            <button class="copy-small-btn" type="button" data-tooltip="Copy ${colorStr}" aria-label="Copy ${colorStr}">${svgIcon('copy')}</button>
                        </div>
                    </div>
                    <span style="font-size:12px; color:var(--color-border-input);">Ratio: ${sBg.ratio.toFixed(2)} with Front ${currentFrontActive}</span>
                </div>`);
            setupSuggestionButtons(el, fgRaw, sBg.rgb, isNonText, colorStr);
        }

        if (count === 0) {
            const info = document.createElement('div');
            info.className = 'no-suggestions-message';
            info.innerHTML = `No simple adjustments found. Try picking a significantly different color.`;
            suggestionsList.appendChild(info);
        }
    }

    /* --- MATH CORE --- */

    function getLuminance(rgb) {
        const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function getContrastRatio(rgb1, rgb2) {
        const l1 = getLuminance(rgb1);
        const l2 = getLuminance(rgb2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function rgbToHsl(rgb) {
        const r = rgb.r / 255;
        const g = rgb.g / 255;
        const b = rgb.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h, s;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6;
        }

        return { h, s, l };
    }

    function hslToRgb(hsl) {
        const { h, s, l } = hsl;
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            const hueToRgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            r = hueToRgb(p, q, h + 1 / 3);
            g = hueToRgb(p, q, h);
            b = hueToRgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    function alphaBlend(fg, bg, a) {
        return {
            r: Math.round(a * fg.r + (1 - a) * bg.r),
            g: Math.round(a * fg.g + (1 - a) * bg.g),
            b: Math.round(a * fg.b + (1 - a) * bg.b)
        };
    }

    function findPassingFgColor(fg, bg, a, req) {
        const hsl = rgbToHsl(fg);
        const dir = getLuminance(bg) > 0.5 ? -1 : 1;

        for (let i = 0; i <= 100; i++) {
            const l = Math.max(0, Math.min(1, hsl.l + (i * 0.01 * dir)));
            const cand = hslToRgb({ ...hsl, l });
            const blended = alphaBlend(cand, bg, a);
            const ratio = getContrastRatio(blended, bg);
            if (ratio >= req) return { rgb: cand, ratio };
        }
        return null;
    }

    function findPassingBgColor(fg, bg, a, req) {
        const hsl = rgbToHsl(bg);
        const dir = getLuminance(fg) > 0.5 ? -1 : 1;

        for (let i = 0; i <= 100; i++) {
            const l = Math.max(0, Math.min(1, hsl.l + (i * 0.01 * dir)));
            const cand = hslToRgb({ ...hsl, l });
            const blended = alphaBlend(fg, cand, a);
            const ratio = getContrastRatio(blended, cand);
            if (ratio >= req) return { rgb: cand, ratio };
        }
        return null;
    }

    function findPassingAlpha(fg, bg, req) {
        for (let a = 0.01; a <= 1.0; a += 0.01) {
            const blended = alphaBlend(fg, bg, a);
            if (getContrastRatio(blended, bg) >= req) {
                return parseFloat(a.toFixed(2));
            }
        }
        return null;
    }

    updateFontSizeOptions();
    updateUnitToggleButton();

    // Load persisted history, then render
    if (chrome?.storage?.local) {
        chrome.storage.local.get('passingHistory', (result) => {
            if (result.passingHistory) passingHistory = result.passingHistory;
            renderHistory();
            triggerCheck(true);
        });
    } else {
        renderHistory();
        triggerCheck(true);
    }
});
