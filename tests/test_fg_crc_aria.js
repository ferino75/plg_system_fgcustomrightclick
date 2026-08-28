const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 1,
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

function rightClick(window, target) {
    target.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: popup with a title - aria-labelledby and aria-describedby point at real, matching ids');
{
    const dom = makeDom({
        popup: { enabled: true, title: 'Heads up', message: 'Some message', timeout: 0 },
        closeLabel: 'Zavrieť',
    });
    const w = dom.window;
    const d = w.document;
    rightClick(w, d.getElementById('text'));

    const overlay = d.querySelector('.crc-overlay');
    const titleEl = d.querySelector('.crc-title');
    const bodyEl = d.querySelector('.crc-body');
    const closeBtn = d.querySelector('.crc-close');

    assert(!!titleEl.id, 'title element has an id');
    assert(!!bodyEl.id, 'body element has an id');
    assert(overlay.getAttribute('aria-labelledby') === titleEl.id, 'aria-labelledby matches the title element id exactly');
    assert(overlay.getAttribute('aria-describedby') === bodyEl.id, 'aria-describedby matches the body element id exactly');
    assert(d.getElementById(overlay.getAttribute('aria-labelledby')) === titleEl, 'aria-labelledby id actually resolves to the title element in the DOM');
    assert(d.getElementById(overlay.getAttribute('aria-describedby')) === bodyEl, 'aria-describedby id actually resolves to the body element in the DOM');
    assert(closeBtn.getAttribute('aria-label') === 'Zavrieť', 'close button aria-label uses the localized string from PHP, not a hard-coded "Close"');
}

console.log('TEST: popup with no title - aria-describedby still set, aria-labelledby simply omitted (not faked)');
{
    const dom = makeDom({
        popup: { enabled: true, title: '', message: 'Message only, no title', timeout: 0 },
    });
    const w = dom.window;
    const d = w.document;
    rightClick(w, d.getElementById('text'));

    const overlay = d.querySelector('.crc-overlay');
    const bodyEl = d.querySelector('.crc-body');
    assert(!d.querySelector('.crc-title'), 'no title element rendered when title is empty');
    assert(!overlay.hasAttribute('aria-labelledby'), 'aria-labelledby is not set when there is no title (never points at a nonexistent id)');
    assert(overlay.getAttribute('aria-describedby') === bodyEl.id, 'aria-describedby still correctly set');
}

console.log('TEST: missing closeLabel falls back to the English default gracefully (e.g. stale cached script options)');
{
    const dom = makeDom({
        popup: { enabled: true, title: 'T', message: 'M', timeout: 0 },
        // closeLabel intentionally omitted
    });
    const w = dom.window;
    const d = w.document;
    rightClick(w, d.getElementById('text'));
    assert(d.querySelector('.crc-close').getAttribute('aria-label') === 'Close', 'falls back to "Close" when closeLabel is absent');
}

console.log('TEST: custom menu aria-label is localized via menuLabel, with English fallback');
{
    const dom = makeDom({
        mode: 3,
        menuLabel: 'Kontextové menu',
        menuItems: [{ type: 'link', label: 'Home', icon: '', value: '/', newtab: false }],
    });
    const w = dom.window;
    const d = w.document;
    rightClick(w, d.getElementById('text'));
    assert(d.querySelector('.crc-menu').getAttribute('aria-label') === 'Kontextové menu', 'menu aria-label uses the localized string');
}
{
    const dom = makeDom({
        mode: 3,
        menuItems: [{ type: 'link', label: 'Home', icon: '', value: '/', newtab: false }],
        // menuLabel intentionally omitted
    });
    const w = dom.window;
    const d = w.document;
    rightClick(w, d.getElementById('text'));
    assert(d.querySelector('.crc-menu').getAttribute('aria-label') === 'Context menu', 'menu aria-label falls back to English when menuLabel is absent');
}

console.log(failures === 0 ? '\nALL ARIA-LOCALIZATION TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
