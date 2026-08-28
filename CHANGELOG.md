# Changelog - plg_system_fgcustomrightclick

## 1.8.0 (2026-08-28)

### Theming/accessibility fixes + admin UX cleanup

**Dark mode now follows the site's own template theme, not just the OS:**
- The popup/menu previously used `@media (prefers-color-scheme: dark)`
  unconditionally, so a light-themed site rendered a mismatched dark
  popup/menu whenever the visitor's OS happened to be set to dark (and a
  dark-themed site got a mismatched light popup for a light-OS visitor).
  Now checks, in priority order: Bootstrap 5's `data-bs-theme` (used by
  Joomla 5/6's default Cassiopeia template and most Bootstrap-5-based
  third-party templates), then `data-color-scheme` (an alternate
  convention some templates use), and only falls back to
  `prefers-color-scheme` when the page declares neither attribute.
  Implemented via CSS custom properties so the light/dark values live in
  exactly one place each.

**Accessibility:**
- Added a `prefers-reduced-motion: reduce` override that disables every
  transition this plugin adds (popup fade/slide, menu scale, toast
  fade), for visitors who have that OS-level accessibility setting on.

**RTL support:**
- Replaced hard-coded physical CSS properties with logical ones so the
  popup/menu render correctly in right-to-left languages: `text-align:
  left` → `text-align: start`, the close button's `right` position →
  `inset-inline-end`, and the title/body's `margin-right` spacing →
  `margin-inline-end`. The custom menu's pop-out animation now anchors
  from the correct corner via `:dir(rtl)`. (Positioning driven by JS from
  click/touch coordinates - the menu and toast's `left`/`top` - is
  unaffected, since mouse/touch coordinates are never mirrored for RTL.)

**Admin UX:**
- The "Popup" and "Custom menu" fieldsets' fields are now hidden unless
  the matching right-click mode is actually selected
  (`showon="rightclick_mode:1"` / `:3"`, combined with the existing
  `popup_enabled` condition via `[AND]` where applicable), instead of
  always being visible regardless of the selected mode. Fieldset-level
  `showon` (hiding the whole tab) was considered but not used - its
  Joomla-core support could not be confirmed with the same confidence as
  field-level `showon`, which is thoroughly documented back to Joomla
  3.2.4; the field-level approach achieves the same practical outcome
  (irrelevant settings hidden) without depending on that.
- "Apply to user groups" now uses
  `layout="joomla.form.field.list-fancy-select"` (Joomla's improved
  checkbox-tree-with-search widget for multi-select fields) instead of a
  plain HTML multi-select box, confirmed against Joomla's own
  documentation and a core pull request that made this exact change to
  the same field type.
- Removed the hard-coded `1.3.0` left over in all four language file
  header comments since the FG rebrand (should have been updated on every
  release since - this is why it's better not to duplicate the version
  number in more than one place: the header comment no longer states a
  version at all, so it can't go stale again).
- Added `test_fg_crc_css_theming.js` (21 structural assertions checking
  the stylesheet's content directly): confirms the explicit-theme
  selectors and the prefers-color-scheme fallback scoping, that every
  animated element is covered by the reduced-motion override, that no
  hard-coded `text-align: left` remains, and that the theming custom
  properties are both defined and actually used by the components that
  need to change colour for dark mode.

## 1.7.2 (2026-08-28)

### Print/action conflict warning + clipboard fix on HTTP

- **Documented the "Disable printing" + "Print the page" menu-action
  interaction.** Both features work correctly together technically - the
  menu item still opens the browser's print dialog, and the print CSS
  still shows the "printing is disabled" message on the printed output -
  but an admin combining both without realising it would get a "Print"
  button that visibly does nothing useful, with no explanation why. Added
  an explicit note to the action field's description rather than silently
  dropping the menu item (which would have been its own kind of
  confusing: a configured item quietly missing from the menu, with no
  indication why).
- **Fixed "Copy URL" and "Share" (clipboard fallback) failing completely
  silently on plain HTTP sites.** `navigator.clipboard` requires a secure
  context (HTTPS or localhost) and is simply `undefined` otherwise - the
  previous code checked for it and did nothing at all if absent, so
  clicking the menu item on an HTTP site appeared to do nothing, with no
  error and no way to tell whether it worked.
  - Added a `document.execCommand('copy')`-based fallback (deprecated but
    still supported by every major browser, with no secure-context
    requirement) for when the modern Clipboard API isn't available.
  - Added a small toast/status message ("Copied to clipboard" /
    "Could not copy to clipboard", both translated via `Text::_()`) shown
    after every copy attempt, success or failure, so the action always
    gives visible feedback instead of silently doing nothing either way.
- Added `test_fg_crc_copy_feedback.js` (9 jsdom assertions): the modern
  Clipboard API path still works and shows the success toast, the
  no-Clipboard-API path attempts the fallback and always shows a result
  toast (jsdom doesn't implement `execCommand` at all, so this exercises
  and confirms the failure-feedback path specifically), and the English
  fallback when a localized message is missing.

## 1.7.1 (2026-08-28)

### "Skip on interactive elements" was too narrow

- **Expanded the interactive-elements exemption** (`protectInteractive`,
  default on) beyond `input, textarea, select, button, a,
  [contenteditable]`. It now also covers: `iframe` (embedded YouTube/Maps/
  cookie-consent widgets - though a right-click *inside* such an embed's
  own content was never actually intercepted in the first place, since
  contextmenu events never cross a frame boundary, same-origin or not;
  this specifically fixes a right-click landing on the iframe's own
  border/padding area in the parent document), `canvas` (canvas-rendered
  map libraries such as Leaflet, OpenLayers, and MapLibre GL, some of
  which use right-click-drag for panning/rotation), `audio` (native
  player controls), `summary`/`details` (natively interactive disclosure
  widgets), `label`, and `[role="button" i]` (common in component
  libraries that style a `div`/`span` as a button rather than using a
  native `<button>`; matched case-insensitively).
- **`video` is exempt by the same reasoning, but only while "Also protect
  video" is off.** If that option is explicitly enabled, video keeps
  being treated as protected content (blocked), matching the admin's
  clear intent - it does not silently become exempt again just because
  `protectInteractive` is on.
- **Fixed a related CSS gap**: the JS-side exemption already recognised
  both `[contenteditable="true"]` and `[contenteditable=""]` (per the
  HTML spec, an empty value means the same "true" state), but the CSS
  rule that keeps text selectable inside those elements only listed
  `[contenteditable="true"]`. `[contenteditable=""]` elements could
  therefore still have visually-blocked text selection even though the
  copy/right-click JS logic already correctly allowed them - fixed by
  adding the missing selector.
- Known, documented limitation: this is a plain CSS selector, so it
  cannot see inside a web component's Shadow DOM. A right-click event
  originating inside a custom element's shadow tree is retargeted by the
  browser to the custom element host before this code ever runs, so an
  arbitrary custom element (e.g. `<my-map-widget>`) is only exempted if
  the host element itself matches one of the selectors above (most
  commonly by exposing `role="button"`) - there is no general way to
  detect "this custom element wraps something interactive" from outside
  it. This is now documented in the field description and in the code
  comments rather than silently unhandled.
- Added `test_fg_crc_interactive_exempt_expanded.js` (15 jsdom
  assertions): every newly-added element type, the conditional video
  behaviour in both directions, `protectInteractive=false` still disabling
  all of it, and that the copy/selection-blocking path picks up the same
  expanded list automatically (since it's built on the same helper).

## 1.7.0 (2026-08-28) - CRITICAL HOTFIX

**If you are running 1.6.6 or 1.6.7, upgrade immediately.** Both versions
have a fatal error in `sanitizePopupMessage()` that crashes every single
page load when the "Disable right click" mode is set to "Yes" (mode 1),
regardless of whether a popup message is actually configured - the method
still runs and throws before the page can render. This is a site-breaking
bug, reported directly from a production installation.

### Root cause and fix

- **`Joomla\Filter\InputFilter::getInstance()` does not exist.** That
  static factory method only exists on the separate, CMS-specific
  `Joomla\CMS\Filter\InputFilter` subclass - the plain framework class
  (`Joomla\Filter\InputFilter`, which is what was imported and used) only
  has a public constructor. Calling the nonexistent static method threw
  `Error: Call to undefined method Joomla\Filter\InputFilter::getInstance()`
  on every request that reached it, which - because this runs inside
  `onBeforeCompileHead`, before the page body is built - took the entire
  page down with a fatal error, not just the popup feature.
  Fixed by instantiating the class directly with `new InputFilter(...)`
  instead, which is available and has an identical signature on both the
  framework and the CMS subclass.
- **A second, more serious bug was found while fixing the first one**: the
  broken code passed `1, 1` for the `tagsMethod`/`attrMethod` constructor
  arguments, intending "whitelist mode" (allow only the listed tags/
  attributes). Per Joomla's own API documentation, `1` is actually
  `ONLY_BLOCK_DEFINED_TAGS`/`ONLY_BLOCK_DEFINED_ATTRIBUTES` - **blacklist**
  mode - the exact opposite of the intended behaviour. Had the crash not
  happened, this would have silently let `<script>`, `<iframe>`, and
  everything else *through* the "safe" tag list is meant to block, while
  stripping the tags that were actually meant to be allowed. Fixed by
  using the named constants (`InputFilter::ONLY_ALLOW_DEFINED_TAGS`,
  `InputFilter::ONLY_ALLOW_DEFINED_ATTRIBUTES`, both value `0`) instead of
  magic numbers, specifically to make this mistake structurally harder to
  repeat.
- **Root cause of both bugs**: the PHP-side unit test written for this
  method in 1.6.6 used a hand-written stub of `Joomla\Filter\InputFilter`
  that itself incorrectly modelled a `getInstance()` method (matching the
  broken assumption, not the real class), so it gave false confidence -
  the test passed while the real code was fatally broken. The stub has
  been corrected to match Joomla's actual public API exactly (verified
  directly against `api.joomla.org`'s framework documentation for this
  release), and now captures the constructor's `tagsMethod`/`attrMethod`
  arguments so the test asserts the *correct constant* is used, not just
  that the call succeeds. Deliberately reintroducing both original bugs
  during development of this fix confirmed the corrected test suite now
  catches them.
- No other file changed in this release - this is a pure hotfix to
  `Fgcustomrightclick.php` and its test suite.

## 1.6.7 (2026-08-28)

### Localization/CSP fix + iOS long-press fix

- **The print-disabled message ("Printing is disabled on this website.")
  was hard-coded in English**, unlike the ARIA strings which already go
  through `Text::_()`. Worse, it was delivered via a dynamically-injected
  `<style>` tag - on a site running a Content-Security-Policy without
  `'unsafe-inline'` in `style-src` (e.g. via a Joomla CSP plugin), that
  inline style is silently dropped by the browser and the print-block
  simply doesn't apply. Fixed both problems together: the CSS moved into
  the plugin's own external stylesheet (already loaded via
  `<link rel="stylesheet">`, which ordinary CSP configurations don't
  restrict the way inline `<style>` is), gated behind a class JS toggles
  on `<html>`. The message text itself is translated server-side via
  `Text::_()` and delivered as a `data-crc-print-message` attribute on
  `<body>`, read in CSS with `attr()` - so no localized string needs to
  live in CSS at all, and there is no inline style content of any kind
  left for this feature.
- **Added `-webkit-touch-callout: none` for images (and video, when
  "Also protect video" is on).** `contextmenu`/`dragstart` prevention has
  no effect on iOS Safari's (and other WebKit-on-iOS browsers') native
  long-press "Save Image"/"Save Video" action sheet - that callout isn't
  routed through either DOM event on iOS. Without this, the "Only for
  images" mode in particular did almost nothing on an iPhone/iPad. Applied
  via CSS classes (`crc-touch-callout-off`, `crc-touch-callout-off-video`)
  toggled whenever right-click protection or "Disable image dragging" is
  active, rather than per-element inline styles.
- As before, this remains a deterrent, not DRM - a long-press screenshot
  or any other capture method is unaffected and always will be.
- Added `test_fg_crc_print_and_touch.js` (12 jsdom assertions): confirms
  no `<style>` element is ever dynamically created, the localized message
  is correctly delivered via the data attribute with an English fallback,
  Ctrl+P blocking still works, and both touch-callout classes are added
  under exactly the right conditions.

## 1.6.6 (2026-08-28)

### Popup HTML sanitizer fixes (server-side hardening + two consistency bugs)

- **Added server-side sanitization of the popup message, before it ever
  reaches `addScriptOptions()`.** Previously the field used `filter="raw"`
  in the manifest and the ONLY sanitization was client-side JS
  (`sanitizeHtml()`), so the raw admin-authored HTML was always present
  in the page's script-options payload regardless. A new
  `sanitizePopupMessage()` method runs `Joomla\Filter\InputFilter` with
  the same tag/attribute allowlist as the JS side, as a second,
  independent layer - defense-in-depth against a compromised admin
  account, matching the reasoning already applied elsewhere in this
  plugin (e.g. the link-scheme whitelist). The manifest field keeps
  `filter="raw"` rather than switching to `filter="safehtml"`: Joomla's
  built-in "safehtml" filter uses its own broader, fixed tag list that we
  don't control, which would drift from the exact allowlist used here and
  in the JS sanitizer. Calling `InputFilter` ourselves keeps both layers
  using the identical set.
- **Fixed an inconsistency: relative/anchor/query `<a href>` values in the
  popup message were being stripped**, while the exact same kind of value
  in a custom-menu link item was correctly allowed. The popup sanitizer's
  own `SANITIZE_SAFE_URL` regex required an explicit `http(s)/mailto/tel`
  prefix on every href; a value like `/kontakt` or `#sekcia` has no
  scheme at all and so failed that check and lost its href. Fixed by
  reusing the exact same `isSafeLinkValue()` function already used for
  custom-menu links in the JS sanitizer (and its PHP counterpart in the
  new server-side pass above), which correctly treats schemeless values
  as safe.
- **Fixed content loss on disallowed tags**: `<h2>Ahoj</h2>` previously
  vanished entirely (tag *and* text), since the sanitizer called
  `node.remove()` on anything not in the tag allowlist. It now unwraps
  disallowed-but-harmless tags instead - keeping their text/child content
  and dropping only the wrapping tag - while a small set of genuinely
  dangerous tags (`script`, `style`, `iframe`, `object`, `embed`,
  `noscript`, `template`, `svg`) are still removed entirely, content
  included, exactly as before. This required rewriting the sanitizer's
  tree walk from a snapshot-based loop to one that resumes scanning from
  any newly-promoted children after an unwrap, so nested cases (a
  disallowed tag inside another disallowed tag, itself containing a
  dangerous tag) are still fully sanitised in one pass rather than being
  silently skipped.
- On the specific claim that `javascript:` hrefs could bypass the popup
  sanitizer via the same control-character trick used against the
  menu-link whitelist: on inspection this particular check was an
  *allow-list* match (`must start with http(s)/mailto/tel`), not a
  deny-list one, so the described bypass direction did not apply here.
  The real, fixed issue was the duplicated/divergent logic itself
  (previous two bullets) - unifying both paths onto `isSafeLinkValue()`
  closes that gap regardless and keeps any future scheme-check hardening
  automatically shared between both.
- Added `test_fg_crc_popup_sanitize_php.php` (9 PHP-side assertions,
  reflection-based with a pass-through `InputFilter` stub targeting only
  the new href re-validation logic) and
  `test_fg_crc_sanitizer_consistency.js` (17 jsdom assertions covering
  relative-href preservation, unwrap-keeps-text, dangerous tags still
  fully removed, and a deeply-nested unwrap-then-remove case).

## 1.6.5 (2026-08-28)

### Bug fix - mode 3 ("Custom menu") with no usable items

- **Fixed a dead-end: with the right-click mode set to "Custom menu" but
  no usable menu items, visitors lost the context menu entirely** - not
  the native one (blocked by `preventDefault()`), and not the custom one
  (nothing to show, since `showMenu()` just logged a console warning and
  returned). This could happen either because no items were ever
  configured, or - more subtly - because every configured item got
  filtered out at runtime by the security whitelist (e.g. all links used
  a disallowed URL scheme), which an admin could trigger without any
  visible warning in the plugin's own configuration screen.
- Fixed by checking whether there is anything to show *before* calling
  `preventDefault()`: with zero usable menu items, the handler now leaves
  the event alone entirely and the visitor gets the normal browser
  context menu instead of no menu at all. This covers both causes above
  in one fix, including the "items were filtered out after saving" case
  that admin-side "require at least one item" validation on its own would
  not have caught.
- The mode field's description now documents this fallback behaviour.
- Added `test_fg_crc_empty_menu_fallback.js` (5 jsdom assertions):
  no items configured, every item filtered out by the safety whitelist,
  and the normal (non-empty) case is unaffected.

## 1.6.4 (2026-08-28)

### Bug fix - {url} placeholder in custom-menu link items

- **A link item whose value was nothing but `{url}` (e.g. a "link to this
  page" menu entry) was broken.** The placeholder was always
  percent-encoded before substitution, which is correct when `{url}` sits
  inside a URL component (e.g. `?text={url}`) but wrong when it *is* the
  whole destination: the result (`https%3A%2F%2Fexample.com%2F...`) has no
  `://`, so the browser treated it as a broken relative path instead of
  navigating to the page.
- Fixed by special-casing the whole-value case: when the (trimmed) value
  is exactly `{url}`, the raw, unencoded page URL is used directly.
  Everywhere else - the common case of `{url}` embedded inside a link,
  e.g. a share-intent query string - it is still percent-encoded exactly
  as before, so existing configurations using that pattern are unaffected.
- This is a targeted fix for the reported case rather than a general
  templating engine: `{url}` combined with extra text that is *not* a
  query string (e.g. `{url}#section`) still falls back to the
  percent-encoded substitution, which is documented as a known limitation
  in both the field description and the new test suite below, rather than
  silently mishandled.
- Added `test_fg_crc_url_placeholder.js` (5 jsdom assertions) covering the
  whole-value case (with and without surrounding whitespace), the
  unaffected query-string case, and the documented partial-value
  limitation.

## 1.6.3 (2026-08-28)

### Honesty & UX fix - developer-tools deterrent

- **Renamed and re-explained the "Block developer tools keys" option**
  (now "Discourage developer-tools shortcuts") to stop implying it's a
  security measure. It never protected source code or page content - it
  only removes a handful of keyboard shortcuts. The description now says
  so explicitly and lists what it does *not* stop: the browser's own
  menu, extensions, external tools, disabling JavaScript, cached copies,
  a plain HTTP client, or a screenshot/OCR. The underlying setting key
  (`block_devtools`) is unchanged, so existing installs keep whatever
  they had configured across the upgrade - only the label and description
  text changed.
- **Removed `stopImmediatePropagation()` from both the devtools-shortcut
  handler and the Ctrl/Cmd+P print-blocking handler** (same issue, same
  fix, applied consistently to both). `preventDefault()` alone is
  sufficient to stop the browser's own devtools/print action;
  `stopImmediatePropagation()` additionally prevented *any other*
  listener on the page - a third-party widget, another script - from ever
  seeing that keydown at all, which is a much bigger side effect than
  this feature's modest goal justifies.
- Added `test_fg_crc_devtools_propagation.js` (5 jsdom assertions):
  confirms no `.stopImmediatePropagation(` call remains anywhere in the
  shipped script, that an unrelated listener bound to the exact same key
  combo (e.g. Ctrl+Shift+C) now still receives the event, and that F12/
  Ctrl+U/Ctrl+P are still blocked as before with no functional regression.

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
