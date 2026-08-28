/**
 * plg_system_fgcustomrightclick
 * (C) 2026 Fero - GPL v2+
 *
 * Modes:
 *   0 = default browser menu (only other protections may be active)
 *   1 = right click disabled everywhere, optional popup message
 *   2 = right click disabled on images only
 *   3 = right click disabled, custom context menu shown instead
 */
(() => {
    'use strict';

    const loadConfig = () => {
        // Preferred way
        const opts = window.Joomla?.getOptions?.('plg_system_fgcustomrightclick');
        if (opts) {
            return opts;
        }
        // Fallback: read the options JSON directly (works even when core.js
        // is missing or runs after us)
        const nodes = document.querySelectorAll('script.joomla-script-options');
        for (const node of nodes) {
            try {
                const data = JSON.parse(node.textContent || '{}');
                if (data?.plg_system_fgcustomrightclick) {
                    return data.plg_system_fgcustomrightclick;
                }
            } catch (e) { /* ignore */ }
        }
        return null;
    };

    const cfg = loadConfig();

    if (!cfg) {
        return;
    }

    const PREFIX = 'crc';

    // menuItems may arrive as an array or (after JSON round-trips) an object
    let menuItems = [];
    if (cfg.menuItems) {
        menuItems = Array.isArray(cfg.menuItems)
            ? cfg.menuItems
            : Object.values(cfg.menuItems);
        menuItems = menuItems.filter((it) => it && (it.type === 'separator' || (it.label && it.value)));
    }

    let popupEl = null;
    let popupTimer = 0;
    let menuEl = null;
    let previouslyFocused = null;

    const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), '
        + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = (container) => Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));

    const trapFocus = (container, e) => {
        const focusables = getFocusable(container);
        if (!focusables.length) {
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    const captureFocus = (initialTarget) => {
        previouslyFocused = document.activeElement;
        initialTarget?.focus?.();
    };

    const restoreFocus = () => {
        if (previouslyFocused && document.contains(previouslyFocused) && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
        previouslyFocused = null;
    };

    /* ------------------------------------------------------------------ *
     *  Helpers
     * ------------------------------------------------------------------ */

    const isImageTarget = (target) => {
        if (!target?.closest) {
            return false;
        }
        if (target.closest('img, picture, svg, canvas, video')) {
            return true;
        }
        // Elements with CSS background image
        let el = target;
        for (let i = 0; el && i < 4; i++) {
            const bg = window.getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none' && bg.includes('url(')) {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    };

    const isEditable = (target) => {
        if (!target) {
            return false;
        }
        const tag = (target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
    };

    /* ------------------------------------------------------------------ *
     *  Popup (mode 1)
     * ------------------------------------------------------------------ */

    const closePopup = () => {
        if (popupTimer) {
            window.clearTimeout(popupTimer);
            popupTimer = 0;
        }
        if (popupEl?.classList.contains(`${PREFIX}-visible`)) {
            popupEl.classList.remove(`${PREFIX}-visible`);
            restoreFocus();
        }
    };

    const buildPopup = () => {
        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}-overlay`;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const box = document.createElement('div');
        box.className = `${PREFIX}-popup`;

        const close = document.createElement('button');
        close.type = 'button';
        close.className = `${PREFIX}-close`;
        close.innerHTML = '&times;';
        close.setAttribute('aria-label', 'Close');
        close.addEventListener('click', closePopup);

        box.appendChild(close);

        if (cfg.popup?.title) {
            const h = document.createElement('div');
            h.className = `${PREFIX}-title`;
            h.textContent = cfg.popup.title;
            box.appendChild(h);
        }

        const body = document.createElement('div');
        body.className = `${PREFIX}-body`;
        // Message is admin-provided HTML (matches original plugin behaviour)
        body.innerHTML = cfg.popup?.message || '';
        box.appendChild(body);

        overlay.appendChild(box);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closePopup();
            }
        });

        document.body.appendChild(overlay);
        return overlay;
    };

    const showPopup = () => {
        if (!cfg.popup?.enabled) {
            return;
        }
        if (!cfg.popup.title && !cfg.popup.message) {
            return;
        }
        if (!popupEl) {
            popupEl = buildPopup();
        }
        popupEl.classList.add(`${PREFIX}-visible`);
        captureFocus(popupEl.querySelector(`.${PREFIX}-close`));

        if (popupTimer) {
            window.clearTimeout(popupTimer);
            popupTimer = 0;
        }
        if (cfg.popup.timeout > 0) {
            popupTimer = window.setTimeout(closePopup, cfg.popup.timeout * 1000);
        }
    };

    /* ------------------------------------------------------------------ *
     *  Custom context menu (mode 3)
     * ------------------------------------------------------------------ */

    const closeMenu = () => {
        if (menuEl?.classList.contains(`${PREFIX}-visible`)) {
            menuEl.classList.remove(`${PREFIX}-visible`);
            restoreFocus();
        }
    };

    const buildMenu = () => {
        const menu = document.createElement('div');
        menu.className = `${PREFIX}-menu`;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Context menu');

        menuItems.forEach((item) => {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = `${PREFIX}-menu-sep`;
                sep.setAttribute('role', 'separator');
                menu.appendChild(sep);
                return;
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `${PREFIX}-menu-item`;
            btn.setAttribute('role', 'menuitem');
            btn.tabIndex = -1;

            if (item.icon) {
                const ic = document.createElement('span');
                ic.className = `${PREFIX}-menu-icon`;
                if (/^(fa[a-z-]*|icon-|bi-|crc-)/.test(item.icon)) {
                    ic.className += ` ${item.icon}`;
                } else {
                    ic.textContent = item.icon; // emoji / plain text
                }
                btn.appendChild(ic);
            }

            const lbl = document.createElement('span');
            lbl.className = `${PREFIX}-menu-label`;
            lbl.textContent = item.label;
            btn.appendChild(lbl);

            btn.addEventListener('click', () => {
                closeMenu();
                if (item.type === 'js') {
                    try {
                        /* Admin-provided JS snippet, executed in page context.
                           {url} placeholder is replaced with current URL. */
                        const code = item.value.split('{url}').join(window.location.href);
                        new Function(code)();
                    } catch (err) {
                        console.error?.('[fgcustomrightclick] menu item JS error:', err);
                    }
                } else {
                    const url = item.value.split('{url}').join(encodeURIComponent(window.location.href));
                    if (item.newtab) {
                        window.open(url, '_blank', 'noopener');
                    } else {
                        window.location.href = url;
                    }
                }
            });

            menu.appendChild(btn);
        });

        document.body.appendChild(menu);
        return menu;
    };

    const showMenu = (x, y) => {
        if (!menuItems.length) {
            console.warn?.('[fgcustomrightclick] mode=3 but no menu items configured');
            return;
        }
        if (!menuEl) {
            menuEl = buildMenu();
        }

        menuEl.classList.add(`${PREFIX}-visible`);

        const items = Array.from(menuEl.querySelectorAll(`.${PREFIX}-menu-item`));
        items.forEach((it, i) => { it.tabIndex = i === 0 ? 0 : -1; });
        captureFocus(items[0]);

        // Keep inside viewport (menu is position:fixed, use client coords)
        const rect = menuEl.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;

        let posX = x;
        let posY = y;

        if (posX + rect.width > vw) {
            posX = Math.max(0, vw - rect.width - 4);
        }
        if (posY + rect.height > vh) {
            posY = Math.max(0, vh - rect.height - 4);
        }

        menuEl.style.left = `${posX}px`;
        menuEl.style.top = `${posY}px`;
    };

    /* ------------------------------------------------------------------ *
     *  Event wiring
     * ------------------------------------------------------------------ */

    // Right click handling
    if (cfg.mode > 0) {
        document.addEventListener('contextmenu', (e) => {
            if (cfg.mode === 2) {
                if (isImageTarget(e.target)) {
                    e.preventDefault();
                }
                return;
            }

            // Do not break form fields usability in menu/popup modes? The
            // original plugin blocks everywhere - keep it consistent.
            e.preventDefault();

            if (cfg.mode === 1) {
                showPopup();
            } else if (cfg.mode === 3) {
                closeMenu();

                // Keyboard-triggered contextmenu (Shift+F10 / Menu key) can
                // report clientX/clientY as 0,0 in some browsers. Anchor the
                // menu to the focused/target element instead of the corner.
                let x = e.clientX;
                let y = e.clientY;
                if (!x && !y && e.target?.getBoundingClientRect) {
                    const rect = e.target.getBoundingClientRect();
                    x = rect.left;
                    y = rect.bottom;
                }

                showMenu(x, y);
            }
        }, true);
    }

    // Close menu / popup on outside interaction
    document.addEventListener('click', (e) => {
        if (menuEl && !menuEl.contains(e.target)) {
            closeMenu();
        }
    }, true);

    const focusMenuItem = (items, target) => {
        items.forEach((it) => { it.tabIndex = -1; });
        target.tabIndex = 0;
        target.focus();
    };

    document.addEventListener('keydown', (e) => {
        const popupOpen = popupEl?.classList.contains(`${PREFIX}-visible`);
        const menuOpen = menuEl?.classList.contains(`${PREFIX}-visible`);

        if (e.key === 'Escape') {
            if (popupOpen || menuOpen) {
                closeMenu();
                closePopup();
            }
            return;
        }

        // Focus trap inside the popup dialog
        if (popupOpen && e.key === 'Tab') {
            trapFocus(popupEl, e);
            return;
        }

        // Roving-tabindex arrow-key navigation inside the custom menu
        if (menuOpen) {
            const items = Array.from(menuEl.querySelectorAll(`.${PREFIX}-menu-item`));
            if (!items.length) {
                return;
            }
            const idx = items.indexOf(document.activeElement);

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusMenuItem(items, items[(idx + 1 + items.length) % items.length]);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                focusMenuItem(items, items[(idx - 1 + items.length) % items.length]);
            } else if (e.key === 'Home') {
                e.preventDefault();
                focusMenuItem(items, items[0]);
            } else if (e.key === 'End') {
                e.preventDefault();
                focusMenuItem(items, items[items.length - 1]);
            } else if (e.key === 'Tab') {
                // Tabbing out of a menu closes it (standard menu widget behaviour)
                closeMenu();
            }
        }
    });

    window.addEventListener('scroll', closeMenu, { passive: true });
    window.addEventListener('resize', closeMenu, { passive: true });

    // Disable text selection + copy/cut
    if (cfg.disableSelect) {
        document.documentElement.classList.add(`${PREFIX}-noselect`);

        ['copy', 'cut', 'selectstart'].forEach((type) => {
            document.addEventListener(type, (e) => {
                if (!isEditable(e.target)) {
                    e.preventDefault();
                }
            }, true);
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !isEditable(e.target)) {
                const k = e.key.toLowerCase();
                if (k === 'c' || k === 'x' || k === 'a') {
                    e.preventDefault();
                }
            }
        }, true);
    }

    // Disable image dragging
    if (cfg.disableImageDrag) {
        document.addEventListener('dragstart', (e) => {
            if (isImageTarget(e.target)) {
                e.preventDefault();
            }
        }, true);
    }

    // Block developer tools keyboard shortcuts
    if (cfg.blockDevtools) {
        document.addEventListener('keydown', (e) => {
            const code = e.code || '';
            const mod = e.ctrlKey || e.metaKey;

            const block =
                // F12
                (e.key === 'F12' || code === 'F12')
                // Ctrl+Shift+I / J / C (Win/Linux) and Cmd+Shift+I/J/C
                || (mod && e.shiftKey && (code === 'KeyI' || code === 'KeyJ' || code === 'KeyC'))
                // Cmd+Opt+I / J / C (macOS)
                || (e.metaKey && e.altKey && (code === 'KeyI' || code === 'KeyJ' || code === 'KeyC'))
                // Ctrl+U / Cmd+U - view source
                || (mod && !e.shiftKey && !e.altKey && code === 'KeyU');

            if (block) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }

    // Disable printing
    if (cfg.disablePrint) {
        // Hide content in print media
        const style = document.createElement('style');
        style.textContent = '@media print { body > * { display: none !important; } body::before { content: "Printing is disabled on this website."; display: block; padding: 2rem; font: 16px/1.5 sans-serif; } }';
        document.head.appendChild(style);

        // Block Ctrl/Cmd+P
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }
})();
