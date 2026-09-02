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
     * Copies text to the clipboard, with fallbacks for non-secure
     * contexts and for browsers that may drop execCommand entirely in
     * the future. navigator.clipboard requires a secure context (HTTPS
     * or localhost) - on a plain HTTP site it's simply undefined, so
     * relying on it alone means "Copy URL"/"Share" silently do nothing
     * there with no error and no feedback. document.execCommand('copy')
     * is deprecated but still works in every major browser today and has
     * no secure-context requirement, so it's tried next. Feature-detected
     * (not just try/catch-ed) so a browser that has removed it entirely
     * is treated the same as one that never had it, rather than throwing.
     */
    const copyTextLegacy = (text) => {
        if (typeof document.execCommand !== 'function') {
            return false;
        }
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '0';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            const ok = document.execCommand('copy');
            textarea.remove();
            return ok;
        } catch (e) {
            return false;
        }
    };

    // Small transient status message so "Copy URL"/"Share" give visible
    // confirmation either way, instead of the click appearing to do
    // nothing (which was the actual complaint on HTTP sites, where the
    // Clipboard API is unavailable and the action previously failed
    // silently with no feedback at all).
    let toastEl = null;
    let toastTimer = 0;

    const showToast = (message) => {
        if (!message) {
            return;
        }
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = `${PREFIX}-toast`;
            toastEl.setAttribute('role', 'status');
            toastEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add(`${PREFIX}-toast-visible`);
        if (toastTimer) {
            window.clearTimeout(toastTimer);
        }
        toastTimer = window.setTimeout(() => {
            toastEl.classList.remove(`${PREFIX}-toast-visible`);
        }, 2200);
    };

    const notifyCopyResult = (ok) => {
        showToast(ok
            ? (cfg.copiedMessage || 'Copied to clipboard')
            : (cfg.copyFailedMessage || 'Could not copy to clipboard'));
    };

    // Third and final tier: if neither the Clipboard API nor
    // execCommand('copy') is available (a future browser having dropped
    // both, or a Permissions-Policy blocking scripted clipboard access),
    // show the text in a pre-selected, read-only field so the visitor can
    // still copy it with their own Ctrl+C/Cmd+C - the browser's native
    // keyboard copy, which does not depend on any scripted clipboard API
    // at all and so cannot be broken the same way. Stays open until
    // dismissed, unlike the transient toast, since the visitor needs a
    // moment to actually press the key.
    let copyFallbackEl = null;

    const hideCopyFallback = () => {
        if (copyFallbackEl?.classList.contains(`${PREFIX}-visible`)) {
            copyFallbackEl.classList.remove(`${PREFIX}-visible`);
            restoreFocus();
        }
    };

    const buildCopyFallback = () => {
        const box = document.createElement('div');
        box.className = `${PREFIX}-copy-fallback`;
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', cfg.manualCopyMessage || 'Copy this link');

        const close = document.createElement('button');
        close.type = 'button';
        close.className = `${PREFIX}-copy-fallback-close`;
        close.innerHTML = '&times;';
        close.setAttribute('aria-label', cfg.closeLabel || 'Close');
        close.addEventListener('click', hideCopyFallback);
        box.appendChild(close);

        const msg = document.createElement('div');
        msg.className = `${PREFIX}-copy-fallback-msg`;
        box.appendChild(msg);

        const input = document.createElement('input');
        input.type = 'text';
        input.readOnly = true;
        input.className = `${PREFIX}-copy-fallback-input`;
        box.appendChild(input);

        document.body.appendChild(box);
        return box;
    };

    const showManualCopyFallback = (text) => {
        if (!copyFallbackEl) {
            copyFallbackEl = buildCopyFallback();
        }

        copyFallbackEl.querySelector(`.${PREFIX}-copy-fallback-msg`).textContent =
            cfg.manualCopyMessage || 'Could not copy automatically. Press Ctrl+C (or Cmd+C on Mac) to copy:';

        const input = copyFallbackEl.querySelector(`.${PREFIX}-copy-fallback-input`);
        input.value = text;

        copyFallbackEl.classList.add(`${PREFIX}-visible`);
        captureFocus(input);
        input.select();
    };

    // Orchestrates all three tiers for "Copy URL" / "Share"'s clipboard
    // fallback: modern Clipboard API -> execCommand -> manual-select UI.
    // Only ever shows ONE result to the visitor (either the toast or the
    // manual-copy box), never both.
    const performCopy = (text) => {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => notifyCopyResult(true))
                .catch(() => {
                    if (copyTextLegacy(text)) {
                        notifyCopyResult(true);
                    } else {
                        showManualCopyFallback(text);
                    }
                });
            return;
        }
        if (copyTextLegacy(text)) {
            notifyCopyResult(true);
        } else {
            showManualCopyFallback(text);
        }
    };

    /**
     * Whitelisted custom-menu actions. No admin-provided string is ever
     * executed as code - each entry here is a fixed, audited function.
     * Kept in sync with ALLOWED_ACTIONS in Fgcustomrightclick.php.
     */
    const ACTIONS = {
        reload: () => window.location.reload(),
        copy_url: () => {
            performCopy(window.location.href);
        },
        print: () => window.print(),
        scroll_top: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        share: () => {
            if (navigator.share) {
                navigator.share({ url: window.location.href, title: document.title }).catch(() => {});
            } else {
                performCopy(window.location.href);
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
    // protections don't break form usability, editors, embedded
    // third-party widgets, or the very common "right click a link -> open
    // in new tab" gesture. Gated by the protectInteractive config flag
    // (default on).
    //
    // Includes: form controls, links/buttons, ARIA button-role elements
    // (common in component libraries that don't use native <button>),
    // <summary>/<details> (natively interactive disclosure widgets),
    // <label>, <iframe> (embedded YouTube/Maps/cookie-consent widgets -
    // note this only matters for a right-click landing on the iframe's
    // own border/padding area in the PARENT document; a click inside the
    // embed's own content never reaches this listener at all, since
    // contextmenu events do not cross a same-origin OR cross-origin frame
    // boundary), <canvas> (canvas-rendered map libraries like Leaflet/
    // OpenLayers/MapLibre GL, which may use right-click-drag for panning/
    // rotation), and <audio> (native player controls).
    //
    // Known limitation: this is a plain CSS selector, so it cannot see
    // inside a Shadow DOM. A right-click inside a web component's shadow
    // tree is retargeted to the custom element host by the browser before
    // this code ever sees it, so an arbitrary custom element is only
    // exempted if the host itself matches one of these selectors (e.g. it
    // sets role="button" on itself) - there is no general way to detect
    // "this custom element wraps something interactive" from outside it.
    const INTERACTIVE_EXEMPT_SELECTOR = 'input, textarea, select, button, a, iframe, canvas, audio, '
        + 'summary, details, label, [role="button" i], '
        + '[contenteditable="true"], [contenteditable=""]';

    /**
     * Admin-defined additional CSS selectors (Exclusions/Custom Shortcuts
     * settings) to also treat as interactive-exempt, for sites with a
     * custom widget or web component this plugin doesn't recognise by
     * default - the one general escape hatch for the Shadow DOM
     * limitation documented above (custom elements can only be exempted
     * by matching a selector against the host element itself; an admin
     * who knows their own site's markup can add exactly that selector
     * here instead of waiting for a plugin update).
     *
     * Validated once here, not on every event: an invalid selector string
     * would make target.closest()/querySelector() throw a SyntaxError, so
     * each configured selector is tested up front against an inert,
     * detached fragment (cheap, no real DOM touched) and silently dropped
     * with a console warning if it doesn't parse, rather than ever
     * risking a thrown error inside a live event handler.
     */
    const EXTRA_EXEMPT_SELECTOR = (() => {
        const raw = Array.isArray(cfg.extraExemptSelectors) ? cfg.extraExemptSelectors : [];
        const valid = [];
        raw.forEach((selector) => {
            const trimmed = String(selector || '').trim();
            if (!trimmed) {
                return;
            }
            try {
                document.createDocumentFragment().querySelector(trimmed);
                valid.push(trimmed);
            } catch (e) {
                console.warn?.('[fgcustomrightclick] ignoring invalid custom exception selector:', trimmed);
            }
        });
        return valid.join(', ');
    })();

    const isInteractiveExempt = (target) => {
        if (!cfg.protectInteractive || !target?.closest) {
            return false;
        }
        if (target.closest(INTERACTIVE_EXEMPT_SELECTOR)) {
            return true;
        }
        if (EXTRA_EXEMPT_SELECTOR && target.closest(EXTRA_EXEMPT_SELECTOR)) {
            return true;
        }
        // <video> is exempt by the same reasoning as the rest of this
        // list (native player controls shouldn't break) UNLESS the admin
        // has explicitly opted in to protecting video via "Also protect
        // video" (protectVideo) - that's a deliberate signal they want
        // video treated as protected content, not as a UI control.
        return !cfg.protectVideo && !!target.closest('video');
    };

    // isEditable() is always exempt (form fields/editors must stay usable
    // regardless of the toggle); isInteractiveExempt() additionally covers
    // the elements above, only when protectInteractive is enabled.
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
     * stripped. A handful of genuinely dangerous tags are removed along
     * with their content (see SANITIZE_STRIP_ENTIRELY_TAGS); any other
     * disallowed tag is unwrapped instead - its text/child content is
     * kept, only the wrapping tag itself is dropped (e.g. <h2>Hi</h2>
     * becomes "Hi", not nothing).
     */
    const SANITIZE_ALLOWED_TAGS = new Set(['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'P', 'SPAN', 'UL', 'OL', 'LI']);
    const SANITIZE_ALLOWED_ATTRS = { A: ['href', 'title', 'target'] };
    const SANITIZE_STRIP_ENTIRELY_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG']);

    const sanitizeHtml = (html) => {
        const template = document.createElement('template');
        template.innerHTML = String(html);

        const clean = (root) => {
            let node = root.firstChild;
            while (node) {
                const next = node.nextSibling; // captured before node might move/vanish

                if (node.nodeType === Node.TEXT_NODE) {
                    node = next;
                    continue;
                }

                const isAllowed = node.nodeType === Node.ELEMENT_NODE && SANITIZE_ALLOWED_TAGS.has(node.tagName);

                if (!isAllowed) {
                    const stripEntirely = node.nodeType !== Node.ELEMENT_NODE
                        || SANITIZE_STRIP_ENTIRELY_TAGS.has(node.tagName);

                    let firstPromoted = null;
                    if (!stripEntirely) {
                        // Unwrap: promote this element's children to take
                        // its place, keeping their (still-to-be-sanitised)
                        // content instead of discarding it with the tag.
                        let child = node.firstChild;
                        while (child) {
                            const childNext = child.nextSibling;
                            root.insertBefore(child, node);
                            if (!firstPromoted) {
                                firstPromoted = child;
                            }
                            child = childNext;
                        }
                    }

                    node.remove();
                    // Resume scanning from whatever was promoted (so it
                    // still gets sanitised/recursed into), or from `next`
                    // if nothing was promoted or the whole subtree was
                    // dropped.
                    node = firstPromoted || next;
                    continue;
                }

                const allowedAttrs = SANITIZE_ALLOWED_ATTRS[node.tagName] || [];
                Array.from(node.attributes).forEach((attr) => {
                    if (!allowedAttrs.includes(attr.name.toLowerCase())) {
                        node.removeAttribute(attr.name);
                    }
                });
                if (node.tagName === 'A') {
                    // Same allowlist used for custom-menu links, so both
                    // places agree on what "safe" means: schemeless values
                    // (relative paths, #anchors, ?query) are fine, an
                    // explicit scheme must be http(s)/mailto/tel.
                    if (!isSafeLinkValue(node.getAttribute('href') || '')) {
                        node.removeAttribute('href');
                    }
                    if (node.getAttribute('target') && node.getAttribute('target') !== '_blank') {
                        node.removeAttribute('target');
                    }
                    // Always force safe rel when opening in a new tab
                    node.setAttribute('rel', 'noopener noreferrer');
                }

                clean(node);
                node = next;
            }
        };

        clean(template.content);
        return template.innerHTML;
    };

    // Namespaced beyond the short "crc" class prefix to avoid colliding
    // with any id the site's own markup might already use.
    const POPUP_TITLE_ID = 'fgcustomrightclick-popup-title';
    const POPUP_BODY_ID = 'fgcustomrightclick-popup-body';

    const buildPopup = () => {
        const overlay = document.createElement('div');
        overlay.className = `${PREFIX}-overlay`;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-describedby', POPUP_BODY_ID);

        const box = document.createElement('div');
        box.className = `${PREFIX}-popup`;

        const close = document.createElement('button');
        close.type = 'button';
        close.className = `${PREFIX}-close`;
        close.innerHTML = '&times;';
        close.setAttribute('aria-label', cfg.closeLabel || 'Close');
        close.addEventListener('click', closePopup);

        box.appendChild(close);

        if (cfg.popup?.title) {
            const h = document.createElement('div');
            h.className = `${PREFIX}-title`;
            h.id = POPUP_TITLE_ID;
            h.textContent = cfg.popup.title;
            box.appendChild(h);
            overlay.setAttribute('aria-labelledby', POPUP_TITLE_ID);
        }

        const body = document.createElement('div');
        body.className = `${PREFIX}-body`;
        body.id = POPUP_BODY_ID;
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
        // {url} is normally percent-encoded, since the placeholder is
        // usually embedded inside a URL component (e.g. "?text={url}") and
        // needs escaping there to avoid breaking the surrounding query
        // string. But when the whole (trimmed) value is nothing but
        // "{url}", it represents the current page as a complete
        // destination URL on its own - encoding it in that case turns it
        // into a percent-encoded string with no "://", which browsers then
        // treat as a broken relative path instead of navigating back to
        // the site.
        const trimmedValue = item.value.trim();
        const url = trimmedValue === '{url}'
            ? window.location.href
            : item.value.split('{url}').join(encodeURIComponent(window.location.href));
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
        menu.setAttribute('aria-label', cfg.menuLabel || 'Context menu');

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

    // Elements belonging to the plugin's OWN rendered UI (the custom
    // menu, the popup, its overlay backdrop, the toast) - never the
    // "isInteractiveExempt" for these just because a menu item or the
    // popup's close button happens to be a <button>. That exemption
    // exists for the SITE's own interactive content, not for our control
    // surface layered on top of it; without this guard, right-clicking a
    // custom-menu item (or the popup close button) would incorrectly let
    // the native browser menu show through instead of being blocked.
    const OWN_UI_SELECTOR = `.${PREFIX}-overlay, .${PREFIX}-menu, .${PREFIX}-toast`;
    const isOwnUiTarget = (target) => !!(target?.closest && target.closest(OWN_UI_SELECTOR));

    // Set true for the remainder of a touch gesture once our own
    // long-press timer has already handled it, so a native `contextmenu`
    // that some mobile browsers (notably Android Chrome) still fire
    // shortly afterwards doesn't try to handle the exact same gesture a
    // second time (which could reposition/flicker an already-open menu).
    let longPressHandledThisGesture = false;

    /**
     * The actual "should this right-click/long-press be blocked, and
     * should our popup/menu open" decision - shared between the desktop
     * `contextmenu` listener and the touch long-press detector below, so
     * both paths apply the exact same rules (own-UI guard, image-only
     * mode, interactive-element exemption, empty-menu native fallback).
     *
     * @param {Element} target   The element the gesture landed on.
     * @param {number}  clientX  Viewport X to anchor the menu at.
     * @param {number}  clientY  Viewport Y to anchor the menu at.
     * @param {Function} preventDefault  Called when the native menu/
     *   callout for this gesture should be suppressed. Passed in rather
     *   than assumed, since a touch long-press has no single `Event` to
     *   call preventDefault() on by the time the timer fires.
     */
    const handleContextTrigger = (target, clientX, clientY, preventDefault) => {
        if (isOwnUiTarget(target)) {
            preventDefault();
            return;
        }

        if (cfg.mode === 2) {
            if (isProtectedMediaTarget(target)) {
                preventDefault();
            }
            return;
        }

        // Interactive elements (links, forms, buttons, editors) keep
        // their normal right-click menu by default - see
        // isInteractiveExempt(). Set "Skip on interactive elements" to
        // No in the plugin options to block truly everywhere instead.
        if (isInteractiveExempt(target)) {
            return;
        }

        // Mode 3 with no usable menu items (never configured, or every
        // item got filtered out by the link-scheme/action whitelist)
        // must NOT suppress the native menu - doing so unconditionally
        // would leave the visitor with no context menu at all: no
        // native one (blocked) and no custom one (nothing to show).
        // Falling back to the native menu here is strictly better than
        // leaving right-click/long-press completely dead.
        if (cfg.mode === 3 && !menuItems.length) {
            console.warn?.('[fgcustomrightclick] mode=3 but no menu items configured - falling back to the native context menu');
            return;
        }

        preventDefault();

        if (cfg.mode === 1) {
            showPopup();
        } else if (cfg.mode === 3) {
            closeMenu();
            showMenu(clientX, clientY);
        }
    };

    // Right click handling
    if (cfg.mode > 0) {
        document.addEventListener('contextmenu', (e) => {
            // A touch long-press already handled this exact gesture (see
            // below) - don't process the native contextmenu that some
            // mobile browsers still fire afterwards as a second, separate
            // trigger.
            if (longPressHandledThisGesture) {
                longPressHandledThisGesture = false;
                e.preventDefault();
                return;
            }

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

            handleContextTrigger(e.target, x, y, () => e.preventDefault());
        }, true);
    }

    // Long-press detection for touch devices. Desktop's `contextmenu`
    // event is not a reliable substitute here: iOS Safari largely does
    // not fire it at all on a long-press (a long-standing WebKit
    // limitation, distinct from -webkit-touch-callout above, which only
    // suppresses the native "Save Image" sheet and does nothing to open
    // OUR menu); Android Chrome fires it more consistently but not every
    // mobile browser does. This bridges a touch long-press to the exact
    // same handleContextTrigger() logic used for a desktop right-click.
    if (cfg.mode > 0) {
        const LONG_PRESS_MS = 500;
        const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

        let longPressTimer = 0;
        let longPressStartX = 0;
        let longPressStartY = 0;
        let longPressTarget = null;

        const clearLongPressTimer = () => {
            if (longPressTimer) {
                window.clearTimeout(longPressTimer);
                longPressTimer = 0;
            }
            longPressTarget = null;
        };

        document.addEventListener('touchstart', (e) => {
            // Ignore multi-touch gestures (pinch-to-zoom, two-finger
            // scroll, ...) - only a single, stationary touch counts as a
            // long-press.
            if (e.touches.length !== 1) {
                clearLongPressTimer();
                return;
            }

            const touch = e.touches[0];
            longPressStartX = touch.clientX;
            longPressStartY = touch.clientY;
            longPressTarget = e.target;

            clearLongPressTimer();
            longPressTimer = window.setTimeout(() => {
                longPressTimer = 0;
                longPressHandledThisGesture = true;
                // No-op preventDefault: by the time an async setTimeout
                // callback runs, the browser has already committed to its
                // touchstart-time scrolling/selection decision - calling
                // preventDefault() here cannot retroactively change that.
                // Suppressing the native callout/selection is instead
                // handled synchronously via CSS (-webkit-touch-callout,
                // user-select) elsewhere in this file/stylesheet.
                handleContextTrigger(longPressTarget, longPressStartX, longPressStartY, () => {});
            }, LONG_PRESS_MS);
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!longPressTimer) {
                return;
            }
            const touch = e.touches[0];
            if (!touch) {
                return;
            }
            const dx = Math.abs(touch.clientX - longPressStartX);
            const dy = Math.abs(touch.clientY - longPressStartY);
            if (dx > LONG_PRESS_MOVE_TOLERANCE_PX || dy > LONG_PRESS_MOVE_TOLERANCE_PX) {
                clearLongPressTimer();
            }
        }, { passive: true });

        document.addEventListener('touchend', clearLongPressTimer, { passive: true });
        document.addEventListener('touchcancel', clearLongPressTimer, { passive: true });
    }

    // Close menu / popup / copy-fallback box on outside interaction
    document.addEventListener('click', (e) => {
        if (menuEl && !menuEl.contains(e.target)) {
            closeMenu();
        }
        if (copyFallbackEl && !copyFallbackEl.contains(e.target)) {
            hideCopyFallback();
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
        const copyFallbackOpen = copyFallbackEl?.classList.contains(`${PREFIX}-visible`);

        if (e.key === 'Escape') {
            if (popupOpen || menuOpen || copyFallbackOpen) {
                closeMenu();
                closePopup();
                hideCopyFallback();
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

    // Discourage developer-tools keyboard shortcuts. NOTE: this is not a
    // security measure (see the admin field description) - preventDefault()
    // alone is enough to stop the browser's own devtools/view-source
    // action. Deliberately NOT calling stopImmediatePropagation() here:
    // doing so would also block any other, unrelated listener on the page
    // (a widget, a third-party script) from ever seeing the same keydown,
    // which is a bigger side effect than this feature's modest goal justifies.
    if (cfg.blockDevtools) {
        document.addEventListener('keydown', (e) => {
            const code = e.code || '';
            const mod = e.ctrlKey || e.metaKey;

            const block =
                // F12
                (e.key === 'F12' || code === 'F12')
                // Ctrl+Shift+I / J / C / K (Win/Linux) and Cmd+Shift+I/J/C/K -
                // K is Firefox's Web Console shortcut, distinct from J
                // (Chrome's JS console)
                || (mod && e.shiftKey && (code === 'KeyI' || code === 'KeyJ' || code === 'KeyC' || code === 'KeyK'))
                // Cmd+Opt+I / J / C / K (macOS - Firefox uses Cmd+Opt+K for
                // its Web Console on Mac, matching the I/J/C pattern)
                || (e.metaKey && e.altKey && (code === 'KeyI' || code === 'KeyJ' || code === 'KeyC' || code === 'KeyK'))
                // Ctrl+U / Cmd+U - view source (Windows/Linux, and Chrome/
                // Firefox on macOS)
                || (mod && !e.shiftKey && !e.altKey && code === 'KeyU')
                // Cmd+Opt+U - view source (Safari's own shortcut on macOS,
                // different from the Chrome/Firefox one above)
                || (e.metaKey && e.altKey && code === 'KeyU');

            if (block) {
                e.preventDefault();
            }
        }, true);
    }

    // Disable printing. Delivered via a CSS class toggled on <html> (see
    // fgcustomrightclick.css) rather than a dynamically-injected <style>
    // tag: a site running a Content-Security-Policy without 'unsafe-inline'
    // in style-src would silently drop an inline <style>, making the
    // print-block invisible. An externally-loaded stylesheet is not
    // affected by that. The message text is translated server-side and
    // delivered here via a data attribute, read in CSS with attr() - this
    // keeps the localized string out of the stylesheet entirely, so no
    // inline style content is ever needed for it either.
    if (cfg.disablePrint) {
        document.documentElement.classList.add(`${PREFIX}-print-disabled`);
        document.body.setAttribute(
            'data-crc-print-message',
            cfg.printDisabledMessage || 'Printing is disabled on this website.'
        );

        // Block Ctrl/Cmd+P. preventDefault() alone stops the browser's own
        // print dialog; not calling stopImmediatePropagation() here for the
        // same reason as the devtools handler above - it shouldn't also
        // block unrelated page functionality bound to the same combo.
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault();
            }
        }, true);
    }

    // Disable Ctrl/Cmd+S ("Save Page As"). Same reasoning as the print
    // handler above: preventDefault() alone is enough to stop the
    // browser's own save dialog, and no stopImmediatePropagation() so a
    // site's own unrelated Ctrl/Cmd+S handler (e.g. an in-page editor)
    // still gets the event.
    if (cfg.disableSave) {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
            }
        }, true);
    }

    // Admin-defined custom keyboard shortcuts. Modifier matching is exact:
    // a shortcut configured as plain Ctrl+S does NOT also match Ctrl+Shift+S,
    // since the admin explicitly chose which modifiers are part of the
    // combo. Ctrl and Cmd (metaKey) are treated as the same "ctrl" modifier
    // for cross-platform Windows/Mac parity, consistent with every other
    // shortcut handler in this file. No stopImmediatePropagation(), for the
    // same reason as the handlers above.
    if (cfg.customShortcuts && cfg.customShortcuts.length) {
        document.addEventListener('keydown', (e) => {
            const pressedKey = (e.key || '').toLowerCase();
            const hasCtrl = e.ctrlKey || e.metaKey;

            for (const shortcut of cfg.customShortcuts) {
                const wantKey = String(shortcut.key || '').toLowerCase();
                if (
                    wantKey
                    && pressedKey === wantKey
                    && hasCtrl === !!shortcut.ctrl
                    && e.shiftKey === !!shortcut.shift
                    && e.altKey === !!shortcut.alt
                ) {
                    e.preventDefault();
                    break;
                }
            }
        }, true);
    }

    // iOS Safari (and other WebKit-based browsers on iOS) still offer a
    // "Save Image"/"Save Video" action sheet on a long-press even when
    // contextmenu and dragstart are both prevented - that native "callout"
    // isn't routed through either of those DOM events on iOS. Without
    // -webkit-touch-callout: none, the images-only protection mode in
    // particular does almost nothing on an iPhone/iPad. This is CSS-only,
    // so it's applied via classes rather than per-element inline styles.
    if (cfg.mode > 0 || cfg.disableImageDrag) {
        document.documentElement.classList.add(`${PREFIX}-touch-callout-off`);
    }
    if (cfg.protectVideo) {
        document.documentElement.classList.add(`${PREFIX}-touch-callout-off-video`);
    }
})();
