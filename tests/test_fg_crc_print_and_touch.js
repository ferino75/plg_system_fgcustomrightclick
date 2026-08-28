const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

// Sanity: the dynamic inline <style> injection for the print block must
// be gone entirely (CSP concern) - only the noselect/menu <style> content
// injection pattern should remain absent too; the plugin's only <style>
// usage should now be none at all for print (delivered via the external
// stylesheet + CSS classes instead).
if (js.includes("createElement('style')")) {
    console.log('FAIL: the script still dynamically creates a <style> element for the print block');
    process.exit(1);
}
console.log('PASS: no dynamically-injected <style> element anywhere in the shipped script');

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 0,
        disablePrint: false,
        disableSelect: false,
        disableImageDrag: false,
    }, cfgOverrides) };
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body><p id="text">Hello</p></body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    window.eval(`
        window.Joomla = { getOptions: function (k) {
            var el = document.querySelector('script.joomla-script-options');
            return JSON.parse(el.textContent)[k];
        }};
    `);
    window.eval(js);
    return dom;
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: disablePrint adds the CSS class and a localized data-attribute message, no inline <style> at all');
{
    const dom = makeDom({ disablePrint: true, printDisabledMessage: 'Tlač je zakázaná.' });
    const w = dom.window;
    const d = w.document;
    assert(d.documentElement.classList.contains('crc-print-disabled'), 'crc-print-disabled class added to <html>');
    assert(d.body.getAttribute('data-crc-print-message') === 'Tlač je zakázaná.', 'localized message set as a data attribute on <body>');
    assert(!d.querySelector('style'), 'no inline <style> element was created (CSP-safe)');
}

console.log('TEST: missing printDisabledMessage falls back to the English default');
{
    const dom = makeDom({ disablePrint: true }); // printDisabledMessage intentionally omitted
    const w = dom.window;
    const d = w.document;
    assert(d.body.getAttribute('data-crc-print-message') === 'Printing is disabled on this website.', 'falls back to English default when the translated string is absent');
}

console.log('TEST: Ctrl/Cmd+P is still blocked as before (no regression from removing the inline <style> path)');
{
    const dom = makeDom({ disablePrint: true });
    const w = dom.window;
    const d = w.document;
    const ev = new w.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
    d.body.dispatchEvent(ev);
    assert(ev.defaultPrevented, 'Ctrl+P still prevented');
}

console.log('TEST: touch-callout-off class added whenever a right-click mode or image-drag protection is active');
{
    const domMode1 = makeDom({ mode: 1 });
    assert(domMode1.window.document.documentElement.classList.contains('crc-touch-callout-off'), 'mode 1 adds touch-callout-off');

    const domMode2 = makeDom({ mode: 2 });
    assert(domMode2.window.document.documentElement.classList.contains('crc-touch-callout-off'), 'mode 2 adds touch-callout-off');

    const domMode3 = makeDom({ mode: 3, menuItems: [] });
    assert(domMode3.window.document.documentElement.classList.contains('crc-touch-callout-off'), 'mode 3 adds touch-callout-off');

    const domDragOnly = makeDom({ mode: 0, disableImageDrag: true });
    assert(domDragOnly.window.document.documentElement.classList.contains('crc-touch-callout-off'), 'mode 0 + disableImageDrag alone still adds touch-callout-off');

    const domNone = makeDom({ mode: 0, disableImageDrag: false, disableSelect: true });
    assert(!domNone.window.document.documentElement.classList.contains('crc-touch-callout-off'), 'mode 0 with no image protection at all does NOT add the class');
}

console.log('TEST: touch-callout-off-video class only added when protectVideo is enabled');
{
    const domVideoOn = makeDom({ mode: 2, protectVideo: true });
    assert(domVideoOn.window.document.documentElement.classList.contains('crc-touch-callout-off-video'), 'protectVideo=true adds the video-specific class');

    const domVideoOff = makeDom({ mode: 2, protectVideo: false });
    assert(!domVideoOff.window.document.documentElement.classList.contains('crc-touch-callout-off-video'), 'protectVideo=false (default) does NOT add the video-specific class');
}

console.log(failures === 0 ? '\nALL PRINT-CSP-AND-TOUCH-CALLOUT TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
