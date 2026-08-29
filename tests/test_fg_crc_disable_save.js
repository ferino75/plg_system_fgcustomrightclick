const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 0, disablePrint: false, disableSelect: false, disableImageDrag: false, disableSave: false,
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

function key(w, d, props) {
    const ev = new w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, props));
    d.body.dispatchEvent(ev);
    return ev;
}

console.log('TEST: disableSave=true blocks Ctrl+S and Cmd+S');
{
    const dom = makeDom({ disableSave: true });
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 's', ctrlKey: true }).defaultPrevented, 'Ctrl+S blocked');
    assert(key(w, d, { key: 'S', ctrlKey: true }).defaultPrevented, 'uppercase "S" key value (e.g. Caps Lock on) still matches via case-insensitive comparison');
    assert(key(w, d, { key: 's', metaKey: true }).defaultPrevented, 'Cmd+S (Mac) blocked');
}

console.log('TEST: disableSave=false (default) does NOT block Ctrl+S');
{
    const dom = makeDom({ disableSave: false });
    const w = dom.window;
    const d = w.document;
    assert(!key(w, d, { key: 's', ctrlKey: true }).defaultPrevented, 'Ctrl+S NOT blocked when the option is off');
}

console.log('TEST: plain "s" (no modifier) is never blocked, disableSave on or off');
{
    const domOn = makeDom({ disableSave: true });
    assert(!key(domOn.window, domOn.window.document, { key: 's' }).defaultPrevented, 'plain "s" key not blocked even with disableSave on');
}

console.log('TEST: no stopImmediatePropagation - an unrelated listener on the same combo still fires (consistent with Ctrl+P/devtools handling)');
{
    const dom = makeDom({ disableSave: true });
    const w = dom.window;
    const d = w.document;
    let otherListenerFired = false;
    d.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            otherListenerFired = true;
        }
    }, false);
    const ev = key(w, d, { key: 's', ctrlKey: true });
    assert(ev.defaultPrevented, 'Ctrl+S still prevented (browser save dialog blocked)');
    assert(otherListenerFired, 'an unrelated bubble-phase listener on the same combo still received the event');
}

console.log('TEST: disableSave alone (mode 0, nothing else on) is enough to activate the script - not silently skipped');
{
    const dom = makeDom({ disableSave: true, mode: 0 });
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 's', ctrlKey: true }).defaultPrevented, 'disableSave works even when mode=0 and no other protection is enabled');
}

console.log(failures === 0 ? '\nALL DISABLE-SAVE TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
