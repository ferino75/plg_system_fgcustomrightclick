# Changelog - plg_system_fgcustomrightclick

## 1.6.2 (2026-08-28)

### Accessibility & localization fix

- **Popup dialog now has complete ARIA bindings.** `role="dialog"` and
  `aria-modal="true"` were already present, but the accessible name/
  description were missing: `aria-labelledby` and `aria-describedby` are
  now set on the overlay, pointing at real `id`s on the title and body
  elements. When there is no title (it's an optional field),
  `aria-labelledby` is simply omitted rather than pointing at a
  nonexistent element - a screen reader still gets the description via
  `aria-describedby` either way.
- **The popup's close button and the custom menu's `aria-label` were
  hard-coded in English** (`"Close"` / `"Context menu"`) regardless of
  the site's language. Both are now translated via the plugin's own
  language file (`Text::_()`), loaded explicitly with `$this->loadLanguage()`
  only when the popup or custom menu mode is actually active - consistent
  with `autoloadLanguage = false` and the reasoning already documented on
  that property. Both strings fall back to their English default if a
  script-options payload somehow lacks them (e.g. a stale cache from
  before this upgrade), so nothing breaks visually either way.
- Added `test_fg_crc_aria.js` (12 jsdom assertions): the `aria-labelledby`/
  `aria-describedby` ids resolve to the real elements in the DOM (not just
  string-matched), the no-title case doesn't fabricate a label, and both
  localized strings use the configured value with a verified English
  fallback when absent.

## 1.6.1 (2026-08-28)

### CSS robustness fix

- Added `!important` to the `disableSelect` CSS rules (both the blocking
  rule and the `input`/`textarea`/`select`/`[contenteditable]`/link/button
  exemptions). Without it, the exemption relied entirely on the two rules
  having equal CSS specificity (`.crc-noselect body *` and e.g.
  `.crc-noselect input` are both `(0,1,1)`) and this plugin's stylesheet
  happening to be the *last* one loaded with that specificity for the
  affected elements. A template's own CSS setting `user-select` on form
  fields with the same or higher specificity, loaded after this
  stylesheet in the page's `<head>`, could silently win and leave inputs
  unselectable even though the JS-level copy/cut/select event handling
  (`isProtectionExempt()`) already correctly allowed it. `!important` on
  both sides removes that dependency on load order.
- JS-level behaviour is unchanged - `isProtectionExempt()` already
  correctly exempted these elements from the `copy`/`cut`/`selectstart`
  event handlers and the Ctrl+C/X/A shortcut block; this fix closes the
  matching gap on the purely visual/native-selection side.

## 1.6.0 (2026-08-28)

### Scope fix (behaviour change) - "Only for images" mode

- **"Only for images" now means exactly `<img>`/`<picture>`.** It
  previously also matched `svg`, `canvas`, and `video`, plus any element
  with a CSS `background-image` found by walking up to 4 ancestor
  elements. That caused two kinds of surprise: (1) `canvas` was included
  even though no browser offers "Save image as" on a canvas via
  right-click in the first place, so blocking it protected nothing;
  inline `<svg>` icons inside otherwise-interactive buttons were also
  frequently caught, and (2) the ancestor walk meant right-clicking
  *anywhere* inside a card, banner, or button that merely had a
  background image further up the DOM - including unrelated nested text,
  links, or other buttons - could get blocked.
- `svg` and `canvas` are dropped from image detection entirely (not
  reintroduced even as an opt-in), for the reasons above.
- Added two new options, both **off by default**, only shown when the
  right-click mode is "Only for images":
  - **"Also protect video"** - extends the protection (and, if
    "Disable image dragging" is on, drag prevention too) to `<video>`
    elements.
  - **"Also protect CSS background images"** - extends the protection to
    elements whose *own* computed style has a background image. Unlike
    the old behaviour, only the exact element that was right-clicked is
    checked - never its ancestors - so a button or link nested inside a
    background-image banner/card is never affected, only the
    banner/card element itself when clicked directly.
- `disableImageDrag` follows the same narrowed scope: it always covers
  `<img>`/`<picture>`, and now also covers `<video>` when "Also protect
  video" is enabled. Background-image elements are not natively
  draggable by browsers in the first place, so no change was needed
  there.
- Added `test_fg_crc_image_scope.js` (13 jsdom assertions) covering the
  narrowed default scope, both new opt-in toggles independently, that a
  background-image container's own nested button is no longer
  collaterally blocked, and that drag-prevention follows the same rules.

## 1.5.0 (2026-08-28)

### UX/usability fix (behaviour change)

- **Right-click blocking (mode "Yes") and the custom menu (mode "Custom
  menu") no longer apply, by default, to links, form fields, buttons, or
  editable content.** Previously every mode-1/mode-3 protection called
  `e.preventDefault()` unconditionally, which also broke the extremely
  common "right-click a link -> open in new tab" browser gesture, could
  interfere with pasting into search/contact-form fields, and disrupted
  third-party editors, maps, and video embeds relying on their own
  right-click behaviour.
- Added a new "Skip on interactive elements" option (`protect_interactive`),
  **enabled by default**. When on, `input`, `textarea`, `select`, `button`,
  `a`, and `[contenteditable]` elements keep their normal browser
  right-click menu and text-selection/copy behaviour, even while the
  protections above are active on the rest of the page. Images remain
  fully protected regardless of this setting - the point of the plugin
  (deterring easy image saving) is unaffected.
- Turning the option off restores the previous "block truly everywhere,
  including links and forms" behaviour, for site owners who deliberately
  want that.
- The `disableSelect` (copy/cut/selection blocking) protection now honours
  the same exemption for links and buttons; form fields and editable
  content were already exempt from it regardless of this setting (that
  part of the behaviour, from earlier versions, is unchanged).
- Added `test_fg_crc_interactive_exempt.js` (16 jsdom assertions) covering
  both states of the new toggle, the "images only" mode being unaffected,
  and that the `disableSelect` copy-blocking behaviour follows the same
  exemption rules.

## 1.4.2 (2026-08-28)

### Security fix

- **Corrects an inconsistency left by the 1.4.0 security fix.** Removing
  the `js` menu-item type closed the direct `eval`/`new Function` path,
  but `link` item values were never scheme-validated. Assigning
  `window.location.href` to a `javascript:` URL executes it exactly like
  `eval` would - so an admin-authored (or a compromised-admin-authored)
  "link" pointing at `javascript:...` was an equivalent code-execution
  path that the earlier fix did not close.
- Added a strict scheme whitelist for `link` item values, enforced in
  **two places** (PHP at menu-build time, JS again right before
  navigation as defense-in-depth): schemeless values (relative paths,
  `#anchors`, `?query` strings) are always allowed; an explicit scheme
  must be one of `http:`, `https:`, `mailto:`, `tel:`. Everything else -
  `javascript:`, `data:`, `vbscript:`, `file:`, and any other scheme - is
  rejected. Items with a rejected URL are dropped from the menu entirely,
  the same way invalid `action` items already were.
- The scheme check strips ASCII control characters and leading whitespace
  before matching, since browsers ignore these when parsing a URL scheme
  and a naive check without this step is bypassable with tricks like
  `"java\tscript:"` or a leading NUL byte.
- Added `test_fg_crc_link_scheme.php` (16 PHP-side assertions via
  reflection, including the control-character/whitespace bypass attempts)
  and extended the jsdom suite with `test_fg_crc_link_scheme.js` (9
  assertions) confirming unsafe-scheme items never render and safe ones
  are unaffected.

## 1.4.1 (2026-08-28)

### Hardening

- The popup message field (`popup_message`) still accepts admin-authored
  HTML as before, but it is now run through a minimal allowlist sanitiser
  before being injected into the page. Only `a`, `strong`, `em`, `b`, `i`,
  `br`, `p`, `span`, `ul`, `ol`, `li` survive; every other tag (`script`,
  `iframe`, `object`, `embed`, `style`, ...) is stripped entirely. All
  attributes are stripped except `href`/`title`/`target` on `<a>`, event
  handler attributes (`onclick`, `onerror`, ...) included. `<a href>` is
  additionally validated against an `https?:`/`mailto:`/`tel:` allowlist -
  a `javascript:` or other unsafe scheme is dropped, and `rel="noopener
  noreferrer"` is always forced.
- This is defense-in-depth, not a fix for an exploitable vulnerability:
  the message field is admin-only configuration with no visitor-supplied
  input reaching it, the same trust model Joomla itself uses for article
  content and the Custom HTML module. The hardening specifically narrows
  the blast radius if an admin account is ever compromised.
- The popup title was already rendered via `textContent` (never HTML) and
  is unaffected.
- Added a dedicated jsdom test suite (`test_fg_crc_sanitizer.js`, 19
  assertions) covering script-tag stripping, event-handler-attribute
  stripping, `javascript:`-URL stripping with safe-URL preservation,
  `iframe`/`object`/`style` stripping, and that the allowlisted formatting
  tags still render correctly.

## 1.4.0 (2026-08-28)

### Security fix (breaking change)

- **Removed the "JavaScript" custom-menu item type entirely.** It previously
  built a code string from the admin-configured value (with the `{url}`
  placeholder replaced by the raw, unescaped current page URL) and executed
  it via `new Function()`. This meant: (1) a compromised admin account
  could inject arbitrary code that runs on every page view, (2) the plugin
  required `unsafe-eval` in any Content-Security-Policy, and (3) because
  the page URL was spliced into the JS source text rather than passed as a
  function argument, a crafted URL fragment (e.g. containing `'`, `;`, or
  backticks - characters browsers do not URL-encode in a fragment) could
  break out of the intended snippet and inject additional code.
- **Replaced it with a fixed, audited whitelist of built-in actions**:
  reload page, copy page URL to clipboard, print page, scroll to top,
  share page (Web Share API with clipboard fallback). The admin form now
  offers a dropdown of these actions instead of a free-text code field -
  there is no field left anywhere in the plugin that can reach `eval`,
  `new Function`, or similar.
- Existing "Custom menu" configurations using the old JavaScript item type
  are dropped (not migrated) on upgrade - `getMenuItems()` only recognises
  `link`, `action`, and `separator` types now. Re-create those items using
  the new "Built-in action" type after upgrading.
- Link items are unaffected: the `{url}` placeholder there was already
  `encodeURIComponent()`-escaped and only ever used as a URL, never as code.
- Added a dedicated jsdom security-regression suite
  (`test_fg_crc_security.js`) that asserts `new Function(` does not appear
  anywhere in the shipped script, that whitelisted actions run the real
  (stubbed) browser API and nothing else, that a forged/out-of-whitelist
  action key is a silent no-op, and that a deliberately crafted
  `{url}`-breaking page URL is only ever used as a URL string.

## 1.3.0 (2026-08-27)

Rebranded into the FG series as `plg_system_fgcustomrightclick` (previously
a standalone `plg_system_customrightclick` build). Same functionality,
carried forward from v1.2.1:

- Element/folder/namespace renamed to the `fg` convention: PHP namespace
  `FG\Plugin\System\Fgcustomrightclick`, class `Fgcustomrightclick`
- Language files renamed to the Joomla-required `plg_<group>_<element>.*`
  pattern (`plg_system_fgcustomrightclick.ini` / `.sys.ini`, en-GB + sk-SK)
- Media files renamed (`fgcustomrightclick.js` / `.css`); `addScriptOptions`
  key updated to match
- Added `<updateservers>` block pointing at `updates.xml` on GitHub
  (`ferino75/plg_system_fgcustomrightclick`, master branch)
- Author/copyright set to Fero
- No functional changes to plugin behaviour in this release

### Carried-forward feature set (from the pre-rebrand v1.0.0-v1.2.1 history)

- User-group targeting (empty selection = applies to everyone)
- Disable printing (blocks Ctrl/Cmd+P, hides content via `@media print`)
- Disable text selection & copy (mouse + Ctrl+C/X/A; form fields stay usable)
- Disable image dragging
- Block developer-tools keyboard shortcuts (F12, Ctrl+Shift+I/J/C,
  Cmd+Opt+I/J/C, Ctrl/Cmd+U) - keyboard shortcuts only, DevTools remains
  reachable via the browser's own menu
- Four right-click modes: default browser menu / disabled with optional
  popup / disabled for images only / custom menu
- Popup: title, HTML message, optional auto-close timer
- Custom context menu builder (subform): link / JavaScript / separator
  items, emoji or CSS-class icons, `{url}` placeholder, open-in-new-tab
- Custom menu accessibility: `role="menu"`/`role="menuitem"`, roving
  tabindex, Arrow Up/Down navigation with wrap-around, Home/End, Tab closes
  the menu, Escape closes and returns focus to the previously focused
  element
- Popup accessibility: `role="dialog"`, focus trapped inside via Tab,
  initial focus on the close button, focus returned to the trigger element
  on close
- Keyboard-triggered `contextmenu` events (Shift+F10 / Menu key) that
  report `clientX`/`clientY` as `0,0` are anchored to the focused element's
  bounding rect instead of the viewport corner
- Custom menu positioned with `position: fixed`, clamped to stay inside the
  viewport, closes on outside click/scroll/resize
- ES6+ frontend JS (`const`/`let`, arrow functions, template literals,
  optional chaining) - safe for Joomla 6 native (no IE11 support required)
- Config loaded via `Joomla.getOptions()` with a fallback that reads the
  `script.joomla-script-options` JSON element directly, and a `['core']`
  script dependency so `Joomla.getOptions` is guaranteed to exist before
  this script runs
- Verified throughout via a jsdom behavioural test suite (41 assertions
  covering all modes, accessibility, and edge cases) rather than manual
  testing alone
