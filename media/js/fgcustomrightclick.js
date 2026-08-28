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

    /**
     * Whitelisted custom-menu actions. No admin-provided string is ever
     * executed as code - each entry here is a fixed, audited function.
     * Kept in sync with ALLOWED_ACTIONS in Fgcustomrightclick.php.
     */
    const ACTIONS = {
        reload: () => window.location.reload(),
        copy_url: () => {
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(window.location.href).catch(() => {});
            }
        },
        print: () => window.print(),
        scroll_top: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        share: () => {
            if (navigator.share) {
                navigator.share({ url: window.location.href, title: document.title }).catch(() => {});
            } else if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(window.location.href).catch(() => {});
            }
        },
    };

    /**
     * Whitelist of URL schemes a 'link' menu item may use. Kept in sync
     * with ALLOWED_LINK_SCHEMES in Fgcustomrightclick.php. This is the
     * same check PHP already applies when it builds cfg.menuItems - it is
     * repeated here as defense-in-depth (e.g. against a future dev error
     * that bypasses the PHP-side filter, or hand-edited script options).
     */
    const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
    const LINK_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

    const isSafeLinkValue = (value) => {
        // Strip control characters and leading whitespace - browsers
        // ignore these when parsing a URL scheme, so a naive check
        // without this step is bypassable with e.g. "java\tscript:".
        const normalised = String(value).replace(/[\x00-\x1F\x7F]/g, '').replace(/^\s+/, '');
        const match = normalised.match(LINK_SCHEME_RE);
        return !match || ALLOWED_LINK_SCHEMES.has(match[0].toLowerCase());
    };

    // menuItems may arrive as an array or (after JSON round-trips) an object
    let menuItems = [];
    if (cfg.menuItems) {
        menuItems = Array.isArray(cfg.menuItems)
            ? cfg.menuItems
            : Object.values(cfg.menuItems);
        menuItems = menuItems.filter((it) => it && (
            it.type === 'separator'
            || (it.type === 'action' && it.label && ACTIONS[it.action])
            || (it.type !== 'action' && it.label && it.value && isSafeLinkValue(it.value))
        ));
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

    // "Only for images" means exactly that: <img>/<picture>. canvas has no
    // native "Save image as" on right-click in any browser to begin with
    // (blocking it protects nothing), and inline <svg> is very often an
    // icon/logo inside an otherwise-interactive button - including it here
    // produced surprising false positives. video and CSS background images
    // are separate, opt-in concerns (protectVideo / protectBackgroundImages
    // below) since they're a different kind of content with different
    // false-positive risk.
    const isImageTarget = (target) => !!(target?.closest && target.closest('img, picture'));

    const isVideoTarget = (target) => !!(target?.closest && target.closest('video'));

    // Deliberately checks the clicked/dragged element itself only - NOT its
    // ancestors. Walking up the tree (as an earlier version did) meant
    // right-clicking anywhere inside a card, banner, or button that merely
    // *had* a background image further up the DOM would block the native
    // menu on unrelated nested content (text, links, other buttons) inside
    // it. Checking only the exact element the event fired on means this
    // only fires when the background image is actually on the thing you
    // clicked.
    const hasOwnBackgroundImage = (target) => {
        if (!target || target.nodeType !== 1) {
            return false;
        }
        const bg = window.getComputedStyle(target).backgroundImage;
        return !!(bg && bg !== 'none' && bg.includes('url('));
    };

    // Used by mode 2 ("Only for images"): image, plus whichever opt-in
    // extras (video / background images) are enabled in the plugin options.
    const isProtectedMediaTarget = (target) => (
        isImageTarget(target)
        || (cfg.protectVideo && isVideoTarget(target))
        || (cfg.protectBackgroundImages && hasOwnBackgroundImage(target))
    );

    const isEditable = (target) => {
        if (!target) {
            return false;
        }
        const tag = (target.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
    };

    // Elements that keep their normal browser behaviour (right-click menu,
    // text selection/copy) even when protections are active, so the
    // protections don't break form usability, editors, or the very common
    // "right click a link -> open in new tab" gesture. Gated by the
    // protectInteractive config flag (default on).
    const INTERACTIVE_EXEMPT_SELECTOR = 'input, textarea, select, button, a, [contenteditable="true"], [contenteditable=""]';

    const isInteractiveExempt = (target) => {
        if (!cfg.protectInteractive || !target?.closest) {
            return false;
        }
        return !!target.closest(INTERACTIVE_EXEMPT_SELECTOR);
    };

    // isEditable() is always exempt (form fields/editors must stay usable
    // regardless of the toggle); isInteractiveExempt() additionally covers
    // buttons and links, only when protectInteractive is enabled.
    const isProtectionExempt = (target) => isEditable(target) || isInteractiveExempt(target);

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

    /**
     * Minimal allowlist HTML sanitiser for the admin-authored popup message.
     *
     * The message field is admin-only (same trust level as any other
     * plugin parameter), so this is defense-in-depth against a
     * compromised admin account or a copy-pasted message containing
     * stray markup - not a boundary against untrusted visitor input
     * (none reaches this field). Only a small set of inline/structural
     * tags survive; everything else (script, iframe, object, embed,
     * style, event-handler attributes, javascript:/data: URLs, ...) is
     * stripped, tag and all.
     */
    const SANITIZE_ALLOWED_TAGS = new Set(['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'P', 'SPAN', 'UL', 'OL', 'LI']);
    const SANITIZE_ALLOWED_ATTRS = { A: ['href', 'title', 'target'] };
    const SANITIZE_SAFE_URL = /^(https?:|mailto:|tel:)/i;

    const sanitizeHtml = (html) => {
        const template = document.createElement('template');
        template.innerHTML = String(html);

        const clean = (root) => {
            Array.from(root.childNodes).forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE || !SANITIZE_ALLOWED_TAGS.has(node.tagName)) {
                    node.remove();
                    return;
                }
                const allowedAttrs = SANITIZE_ALLOWED_ATTRS[node.tagName] || [];
                Array.from(node.attributes).forEach((attr) => {
                    if (!allowedAttrs.includes(attr.name.toLowerCase())) {
                        node.removeAttribute(attr.name);
                    }
                });
                if (node.tagName === 'A') {
                    const href = (node.getAttribute('href') || '').trim();
                    if (!SANITIZE_SAFE_URL.test(href)) {
                        node.removeAttribute('href');
                    }
                    if (node.getAttribute('target') && node.getAttribute('target') !== '_blank') {
                        node.removeAttribute('target');
                    }
                    // Always force safe rel when opening in a new tab
                    node.setAttribute('rel', 'noopener noreferrer');
                }
                clean(node);
            });
        };

        clean(template.content);
        return template.innerHTML;
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
        // Admin-authored HTML, restricted to a safe tag/attribute allowlist
        // (see sanitizeHtml above) before it is ever injected into the page.
        body.innerHTML = cfg.popup?.message ? sanitizeHtml(cfg.popup.message) : '';
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

    const runMenuAction = (item) => {
        if (item.type === 'action') {
            ACTIONS[item.action]?.();
            return;
        }
        // 'link' - re-checked here (not just at menu-build time) in case
        // this item ever reaches this point through any other path.
        if (!isSafeLinkValue(item.value)) {
            console.warn?.('[fgcustomrightclick] blocked link item with an unsafe URL scheme');
            return;
        }
        const url = item.value.split('{url}').join(encodeURIComponent(window.location.href));
        if (item.newtab) {
            window.open(url, '_blank', 'noopener');
        } else {
            window.location.href = url;
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
                runMenuAction(item);
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
                if (isProtectedMediaTarget(e.target)) {
                    e.preventDefault();
                }
                return;
            }

            // Interactive elements (links, forms, buttons, editors) keep
            // their normal right-click menu by default - see
            // isInteractiveExempt(). Set "Skip on interactive elements" to
            // No in the plugin options to block truly everywhere instead.
            if (isInteractiveExempt(e.target)) {
                return;
            }

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
        if (cfg.protectInteractive) {
            document.documentElement.classList.add(`${PREFIX}-noselect-interactive-exempt`);
        }

        ['copy', 'cut', 'selectstart'].forEach((type) => {
            document.addEventListener(type, (e) => {
                if (!isProtectionExempt(e.target)) {
                    e.preventDefault();
                }
            }, true);
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !isProtectionExempt(e.target)) {
                const k = e.key.toLowerCase();
                if (k === 'c' || k === 'x' || k === 'a') {
                    e.preventDefault();
                }
            }
        }, true);
    }

    // Disable image dragging (and video, if protectVideo is enabled -
    // background-image elements are not natively draggable in browsers,
    // so there is nothing to prevent there)
    if (cfg.disableImageDrag) {
        document.addEventListener('dragstart', (e) => {
            if (isImageTarget(e.target) || (cfg.protectVideo && isVideoTarget(e.target))) {
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
