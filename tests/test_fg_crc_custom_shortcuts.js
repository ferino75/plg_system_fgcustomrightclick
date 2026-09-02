const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(customShortcuts) {
    const opts = { [OPT_KEY]: {
        mode: 0, disablePrint: false, disableSelect: false, disableImageDrag: false, disableSave: false,
        customShortcuts,
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

console.log('TEST: a plain Ctrl+K combo blocks exactly that, not variants with extra modifiers');
{
    const dom = makeDom([{ key: 'k', ctrl: true, shift: false, alt: false }]);
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'k', ctrlKey: true }).defaultPrevented, 'Ctrl+K blocked');
    assert(key(w, d, { key: 'K', ctrlKey: true }).defaultPrevented, 'case-insensitive key match (uppercase K)');
    assert(!key(w, d, { key: 'k', ctrlKey: true, shiftKey: true }).defaultPrevented, 'Ctrl+Shift+K NOT blocked - exact modifier match required, admin did not opt into Shift');
    assert(!key(w, d, { key: 'k' }).defaultPrevented, 'plain "k" with no modifier NOT blocked');
}

console.log('TEST: Cmd (metaKey) is treated as equivalent to Ctrl for the same combo');
{
    const dom = makeDom([{ key: 'd', ctrl: true, shift: false, alt: false }]);
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'd', metaKey: true }).defaultPrevented, 'Cmd+D (Mac) matches a combo configured with just "ctrl"');
}

console.log('TEST: a combo with all three modifiers requires all three to be pressed');
{
    const dom = makeDom([{ key: 'x', ctrl: true, shift: true, alt: true }]);
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'x', ctrlKey: true, shiftKey: true, altKey: true }).defaultPrevented, 'Ctrl+Shift+Alt+X blocked when all three configured');
    assert(!key(w, d, { key: 'x', ctrlKey: true, shiftKey: true }).defaultPrevented, 'Ctrl+Shift+X (missing Alt) NOT blocked');
}

console.log('TEST: multiple configured shortcuts are each checked independently');
{
    const dom = makeDom([
        { key: 'k', ctrl: true, shift: false, alt: false },
        { key: 'e', ctrl: true, shift: true, alt: false },
    ]);
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'k', ctrlKey: true }).defaultPrevented, 'first configured shortcut (Ctrl+K) blocked');
    assert(key(w, d, { key: 'e', ctrlKey: true, shiftKey: true }).defaultPrevented, 'second configured shortcut (Ctrl+Shift+E) blocked');
    assert(!key(w, d, { key: 'e', ctrlKey: true }).defaultPrevented, 'Ctrl+E alone (not matching either full combo) NOT blocked');
}

console.log('TEST: named (non-printable) keys work the same way as single characters');
{
    const dom = makeDom([{ key: 'Escape', ctrl: false, shift: false, alt: false }]);
    const w = dom.window;
    const d = w.document;
    assert(key(w, d, { key: 'Escape' }).defaultPrevented, 'a named key like Escape can be blocked too');
}

console.log('TEST: empty customShortcuts array means the handler is not even attached (no-op, no crash, nothing blocked)');
{
    const dom = makeDom([]);
    const w = dom.window;
    const d = w.document;
    let threw = false;
    let ev;
    try {
        ev = key(w, d, { key: 'k', ctrlKey: true });
    } catch (e) {
        threw = true;
    }
    assert(!threw, 'no crash with an empty shortcuts list');
    assert(!ev.defaultPrevented, 'nothing is blocked when the shortcuts list is empty');
}

console.log('TEST: no stopImmediatePropagation - consistent with every other keyboard handler in this plugin');
{
    const dom = makeDom([{ key: 'k', ctrl: true, shift: false, alt: false }]);
    const w = dom.window;
    const d = w.document;
    let otherFired = false;
    d.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'k') { otherFired = true; }
    }, false);
    const ev = key(w, d, { key: 'k', ctrlKey: true });
    assert(ev.defaultPrevented, 'custom shortcut still prevented');
    assert(otherFired, 'an unrelated listener on the same combo still received the event');
}

console.log(failures === 0 ? '\nALL CUSTOM-SHORTCUTS TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
