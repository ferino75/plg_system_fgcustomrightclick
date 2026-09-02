const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom() {
    const opts = { [OPT_KEY]: {
        mode: 0, disablePrint: false, disableSelect: false, disableImageDrag: false, blockDevtools: true,
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

function key(w, d, props) {
    const ev = new w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, props));
    d.body.dispatchEvent(ev);
    return ev;
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: Ctrl+Shift+K (Firefox Web Console, previously missing) is now blocked');
{
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true }).defaultPrevented, 'Ctrl+Shift+K blocked (Win/Linux)');
}

console.log('TEST: Cmd+Opt+K (Firefox Web Console on macOS, previously missing) is now blocked');
{
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'k', code: 'KeyK', metaKey: true, altKey: true }).defaultPrevented, 'Cmd+Opt+K blocked (macOS)');
}

console.log('TEST: Cmd+Opt+U (Safari macOS view-source, previously missing since the Ctrl+U check excluded altKey) is now blocked');
{
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'u', code: 'KeyU', metaKey: true, altKey: true }).defaultPrevented, 'Cmd+Opt+U blocked (Safari/macOS)');
}

console.log('TEST: existing coverage is unaffected - F12, Ctrl+U, Ctrl+Shift+I/J/C, Cmd+Opt+I/J/C still work');
{
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'F12', code: 'F12' }).defaultPrevented, 'F12 still blocked');
    assert(key(w, d, { key: 'u', code: 'KeyU', ctrlKey: true }).defaultPrevented, 'plain Ctrl+U (Windows/Linux) still blocked');
    assert(key(w, d, { key: 'i', code: 'KeyI', ctrlKey: true, shiftKey: true }).defaultPrevented, 'Ctrl+Shift+I still blocked');
    assert(key(w, d, { key: 'j', code: 'KeyJ', ctrlKey: true, shiftKey: true }).defaultPrevented, 'Ctrl+Shift+J still blocked');
    assert(key(w, d, { key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true }).defaultPrevented, 'Ctrl+Shift+C still blocked');
    assert(key(w, d, { key: 'i', code: 'KeyI', metaKey: true, altKey: true }).defaultPrevented, 'Cmd+Opt+I still blocked');
    assert(!key(w, d, { key: 'c', code: 'KeyC', ctrlKey: true }).defaultPrevented, 'plain Ctrl+C (no Shift) still NOT blocked');
}

console.log(failures === 0 ? '\nALL DEVTOOLS-COVERAGE-GAP TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
