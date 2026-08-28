# Tests

jsdom-based behavioural tests (JS) and reflection-based unit tests (PHP)
for `plg_system_fgcustomrightclick`. These are development/CI tooling only
— they are never shipped in the Joomla install ZIP.

## Requirements

- Node.js with `jsdom` installed (`npm install jsdom` from this directory
  or the repo root)
- PHP 8.1+ with the `dom` extension enabled (`php -m | grep dom`)

## Running

From this `tests/` directory:

```bash
./run.sh
```

Or individually:

```bash
node test_fg_crc.js
php test_fg_crc_link_scheme.php
```

Each file is self-contained and prints `PASS`/`FAIL` per assertion, with a
final summary line and a non-zero exit code on any failure.

## What each file covers

- `test_fg_crc.js` — core functional behaviour: all four right-click
  modes, popup, custom menu, devtools-shortcut blocking
- `test_fg_crc_security.js` — the whitelisted-actions system (no `eval`/
  `new Function` anywhere), crafted-URL injection attempts
- `test_fg_crc_sanitizer.js`, `test_fg_crc_sanitizer_consistency.js` —
  the popup message HTML sanitiser (allowlist, unwrap-not-remove,
  unified link-scheme checking)
- `test_fg_crc_link_scheme.js` / `.php` — the custom-menu link URL
  scheme whitelist, on both the JS and PHP sides
- `test_fg_crc_popup_sanitize_php.php` — the server-side
  `sanitizePopupMessage()` `InputFilter` wiring (uses a stub matching
  Joomla's real API, not a reimplementation of it)
- `test_fg_crc_interactive_exempt.js` /
  `test_fg_crc_interactive_exempt_expanded.js` — the "Skip on
  interactive elements" exemption list
- `test_fg_crc_image_scope.js` — the "Only for images" mode's element
  scope and the video/background-image opt-ins
- `test_fg_crc_aria.js` — popup `aria-labelledby`/`aria-describedby`
  wiring and localized ARIA strings
- `test_fg_crc_devtools_propagation.js` — confirms devtools/print
  blocking doesn't call `stopImmediatePropagation()`
- `test_fg_crc_url_placeholder.js` — the `{url}` placeholder's
  whole-value vs. embedded-in-a-query-string substitution behaviour
- `test_fg_crc_empty_menu_fallback.js` — native-menu fallback when mode 3
  has no usable items
- `test_fg_crc_print_and_touch.js` — the CSP-safe print-block delivery
  and the iOS touch-callout classes
- `test_fg_crc_copy_feedback.js` — the clipboard copy/fallback and toast
  feedback
- `test_fg_crc_css_theming.js` — structural checks on the stylesheet
  (dark-mode theme detection, reduced-motion, RTL logical properties)

## A note on the PHP stubs

`test_fg_crc_link_scheme.php` and `test_fg_crc_popup_sanitize_php.php`
define minimal stand-in classes for `Joomla\CMS\Plugin\CMSPlugin` and
`Joomla\Filter\InputFilter` so the plugin class can be loaded and
reflected on outside a full Joomla installation. These stubs are
deliberately kept in sync with Joomla's real public API (verified against
official documentation) rather than with whatever the plugin code
currently assumes — a mismatch between the two is exactly what caused the
v1.7.0 production incident documented in CHANGELOG.md, where a stub
modelled a method (`InputFilter::getInstance()`) that doesn't actually
exist on the real class.
