const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 1, disablePrint: false, disableSelect: false, disableImageDrag: false,
        popup: { enabled: true, title: 'Notice', message: 'msg', timeout: 0 },
        protectInteractive: true,
    }, cfgOverrides) };
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body>
<p id="text">Plain text</p>
<my-map-widget id="widget" data-interactive="true">Custom element</my-map-widget>
<div id="third-party" class="chart-tooltip">Tooltip content</div>
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

console.log('TEST: an admin-defined custom selector exempts a custom element the built-in list does not recognise');
{
    const dom = makeDom({ extraExemptSelectors: ['my-map-widget', '.chart-tooltip'] });
    const w = dom.window;
    const d = w.document;

    assert(!rightClick(w, d.getElementById('widget')).defaultPrevented, 'custom element matching the admin-defined tag selector is exempt');
    assert(!rightClick(w, d.getElementById('third-party')).defaultPrevented, 'element matching the admin-defined class selector is exempt');
    assert(rightClick(w, d.getElementById('text')).defaultPrevented, 'plain text is still blocked (no over-broadening)');
}

console.log('TEST: an invalid selector is dropped safely, without throwing and without breaking valid selectors in the same list');
{
    const dom = makeDom({ extraExemptSelectors: ['my-map-widget', ':::not-a-valid-selector:::', '.chart-tooltip'] });
    const w = dom.window;
    const d = w.document;

    let threw = false;
    let ev;
    try {
        ev = rightClick(w, d.getElementById('widget'));
    } catch (e) {
        threw = true;
    }
    assert(!threw, 'no crash when the list contains an invalid selector');
    assert(ev.defaultPrevented === false, 'the valid selector before the invalid one still works');
    assert(!rightClick(w, d.getElementById('third-party')).defaultPrevented, 'the valid selector after the invalid one still works too');
}

console.log('TEST: empty/missing extraExemptSelectors means no extra exemptions, no crash');
{
    const dom = makeDom({});
    const w = dom.window;
    const d = w.document;
    let threw = false;
    try {
        rightClick(w, d.getElementById('widget'));
    } catch (e) {
        threw = true;
    }
    assert(!threw, 'no crash when extraExemptSelectors is entirely absent');
    assert(rightClick(w, d.getElementById('widget')).defaultPrevented, 'without any configured exemption, the unrecognised custom element is blocked like anything else');
}

console.log('TEST: protectInteractive=false disables the extra selectors too (same as the built-in list)');
{
    const dom = makeDom({ extraExemptSelectors: ['my-map-widget'], protectInteractive: false });
    const w = dom.window;
    const d = w.document;
    assert(rightClick(w, d.getElementById('widget')).defaultPrevented, 'extra selector exemption does not apply when protectInteractive is off');
}

console.log(failures === 0 ? '\nALL EXTRA-EXEMPT-SELECTORS TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
