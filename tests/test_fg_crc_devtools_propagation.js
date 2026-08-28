const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

// Sanity: the removed call must not have crept back in. Checks for the
// actual call syntax, not just the word - both handlers now legitimately
// mention "stopImmediatePropagation" in an explanatory comment.
if (js.includes('.stopImmediatePropagation(')) {
    console.log('FAIL: a .stopImmediatePropagation( call is still present somewhere in the shipped script');
    process.exit(1);
}
console.log('PASS: no stopImmediatePropagation() call anywhere in the shipped script (comments referencing it by name are fine)');

function makeDom() {
    const opts = { [OPT_KEY]: {
        mode: 0, disablePrint: false, disableSelect: false, disableImageDrag: false,
        blockDevtools: true,
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

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: preventDefault() still blocks the native devtools shortcut, but an unrelated listener on the same combo still fires');
{
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;

    // Simulate a third-party widget on the page that happens to listen for
    // the same physical key combo for something completely unrelated to
    // devtools (e.g. a command palette bound to Ctrl+Shift+C).
    let widgetFired = false;
    d.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
            widgetFired = true;
        }
    }, false); // bubble-phase listener, like most real page widgets use

    const ev = new w.KeyboardEvent('keydown', {
        key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
    });
    d.body.dispatchEvent(ev);

    assert(ev.defaultPrevented, 'the devtools combo (Ctrl+Shift+C) is still preventDefault()\'d, so the browser won\'t open devtools');
    assert(widgetFired === true, 'an unrelated bubble-phase listener on the SAME key combo still received the event (propagation not stopped)');
}

console.log('TEST: F12 and Ctrl+U are still blocked as before (no functional regression from removing stopImmediatePropagation)');
{
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;
    const key = (props) => {
        const ev = new w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, props));
        d.body.dispatchEvent(ev);
        return ev;
    };
    assert(key({ key: 'F12', code: 'F12' }).defaultPrevented, 'F12 still blocked');
    assert(key({ key: 'u', code: 'KeyU', ctrlKey: true }).defaultPrevented, 'Ctrl+U still blocked');
    assert(!key({ key: 'c', code: 'KeyC', ctrlKey: true }).defaultPrevented, 'plain Ctrl+C (no Shift) still NOT blocked');
}

console.log(failures === 0 ? '\nALL DEVTOOLS-PROPAGATION TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
