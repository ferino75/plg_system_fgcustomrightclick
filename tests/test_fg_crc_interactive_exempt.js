const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 1,
        disablePrint: false,
        disableSelect: true,
        disableImageDrag: false,
        popup: { enabled: true, title: 'Notice', message: 'msg', timeout: 0 },
    }, cfgOverrides) };
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body>
<p id="text">Some paragraph text</p>
<a id="link" href="https://example.com">a link</a>
<input id="input" type="text" value="hello">
<textarea id="textarea">hi</textarea>
<button id="button">Click me</button>
<div id="editable" contenteditable="true">editable</div>
</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
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

console.log('TEST: protectInteractive=true (default) - links/forms/buttons keep native context menu, plain text stays protected');
{
    const dom = makeDom({ protectInteractive: true });
    const w = dom.window;
    const d = w.document;

    assert(!rightClick(w, d.getElementById('link')).defaultPrevented, 'right-click on <a> NOT blocked (native "open in new tab" still works)');
    assert(!rightClick(w, d.getElementById('input')).defaultPrevented, 'right-click on <input> NOT blocked');
    assert(!rightClick(w, d.getElementById('textarea')).defaultPrevented, 'right-click on <textarea> NOT blocked');
    assert(!rightClick(w, d.getElementById('button')).defaultPrevented, 'right-click on <button> NOT blocked');
    assert(!rightClick(w, d.getElementById('editable')).defaultPrevented, 'right-click on [contenteditable] NOT blocked');
    assert(rightClick(w, d.getElementById('text')).defaultPrevented, 'right-click on plain <p> text IS still blocked (popup shown)');
}

console.log('TEST: protectInteractive=false - blocks everywhere, including links/forms (opt-in maximal restriction)');
{
    const dom = makeDom({ protectInteractive: false });
    const w = dom.window;
    const d = w.document;

    assert(rightClick(w, d.getElementById('link')).defaultPrevented, 'right-click on <a> IS blocked when protectInteractive is off');
    assert(rightClick(w, d.getElementById('input')).defaultPrevented, 'right-click on <input> IS blocked when protectInteractive is off');
    assert(rightClick(w, d.getElementById('button')).defaultPrevented, 'right-click on <button> IS blocked when protectInteractive is off');
    assert(rightClick(w, d.getElementById('text')).defaultPrevented, 'right-click on plain text still blocked either way');
}

console.log('TEST: disableSelect + protectInteractive=true - copy/select still blocked on plain text, but not inside a link/input');
{
    const dom = makeDom({ protectInteractive: true, mode: 0, disableSelect: true });
    const w = dom.window;
    const d = w.document;

    const fireCopy = (target) => {
        const ev = new w.Event('copy', { bubbles: true, cancelable: true });
        target.dispatchEvent(ev);
        return ev;
    };

    assert(fireCopy(d.getElementById('text')).defaultPrevented, 'copy blocked on plain paragraph text');
    assert(!fireCopy(d.getElementById('link')).defaultPrevented, 'copy NOT blocked inside a link');
    assert(!fireCopy(d.getElementById('input')).defaultPrevented, 'copy NOT blocked inside an input (already exempt regardless of toggle)');
    assert(!fireCopy(d.getElementById('button')).defaultPrevented, 'copy NOT blocked inside a button');
}

console.log('TEST: mode 2 (images only) is unaffected by protectInteractive - it was already scoped to images');
{
    const dom = makeDom({ mode: 2, protectInteractive: true, disableSelect: false });
    const w = dom.window;
    const d = w.document;
    assert(!rightClick(w, d.getElementById('text')).defaultPrevented, 'mode 2: plain text unaffected as before');
    assert(!rightClick(w, d.getElementById('link')).defaultPrevented, 'mode 2: link unaffected as before');
}

console.log(failures === 0 ? '\nALL INTERACTIVE-EXEMPT TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
