# Changelog - plg_system_fgcustomrightclick

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
