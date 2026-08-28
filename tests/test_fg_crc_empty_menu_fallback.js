const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(menuItems) {
    const opts = { [OPT_KEY]: {
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems,
    }};
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
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: mode 3 never configured with any items - native menu shows instead of nothing');
{
    const dom = makeDom([]);
    const w = dom.window;
    const d = w.document;
    const ev = rightClick(w, d.getElementById('text'));
    assert(!ev.defaultPrevented, 'contextmenu default NOT prevented -> native browser menu is shown');
    assert(!d.querySelector('.crc-menu.crc-visible'), 'no empty/broken custom menu is left visible either');
}

console.log('TEST: mode 3 configured, but every item gets filtered out by the safety whitelist - native menu fallback still applies');
{
    // All three of these get dropped: unsafe scheme, unknown action key, and an empty label.
    const dom = makeDom([
        { type: 'link', label: 'Evil', icon: '', value: 'javascript:alert(1)', newtab: false },
        { type: 'action', label: 'Fake', icon: '', action: 'not_a_real_action' },
        { type: 'link', label: '', icon: '', value: 'https://example.com', newtab: false },
    ]);
    const w = dom.window;
    const d = w.document;
    const ev = rightClick(w, d.getElementById('text'));
    assert(!ev.defaultPrevented, 'all items filtered out at build time -> falls back to native menu, not a dead right-click');
}

console.log('TEST: mode 3 with at least one valid item still shows the custom menu as before (no regression)');
{
    const dom = makeDom([
        { type: 'link', label: 'Home', icon: '', value: '/', newtab: false },
    ]);
    const w = dom.window;
    const d = w.document;
    const ev = rightClick(w, d.getElementById('text'));
    assert(ev.defaultPrevented, 'custom menu case still prevents the native menu as expected');
    assert(d.querySelector('.crc-menu.crc-visible'), 'custom menu is shown with its one valid item');
}

console.log(failures === 0 ? '\nALL EMPTY-MENU-FALLBACK TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
