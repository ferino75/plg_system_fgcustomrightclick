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
        popup: { enabled: true, title: 'Notice', message: 'msg', timeout: 0 },
    }, cfgOverrides) };
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body>
<p id="text">Plain text</p>
<iframe id="embed" src="about:blank"></iframe>
<canvas id="map-canvas" width="200" height="200"></canvas>
<audio id="player" controls></audio>
<video id="video-el" controls></video>
<details id="details"><summary id="summary">More info</summary><p>Hidden content</p></details>
<label id="label" for="input1">A label</label>
<input id="input1" type="text">
<div id="custom-btn" role="button">Custom button</div>
<div id="custom-btn-upper" role="BUTTON">Uppercase role</div>
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

console.log('TEST: protectInteractive=true (default) - iframe, canvas, audio, summary/details, label, role=button are all exempt');
{
    const dom = makeDom({ protectInteractive: true });
    const w = dom.window;
    const d = w.document;

    assert(!rightClick(w, d.getElementById('embed')).defaultPrevented, 'iframe (e.g. its border/padding area) NOT blocked');
    assert(!rightClick(w, d.getElementById('map-canvas')).defaultPrevented, 'canvas (e.g. Leaflet/OpenLayers map) NOT blocked');
    assert(!rightClick(w, d.getElementById('player')).defaultPrevented, 'audio NOT blocked');
    assert(!rightClick(w, d.getElementById('details')).defaultPrevented, 'details NOT blocked');
    assert(!rightClick(w, d.getElementById('summary')).defaultPrevented, 'summary NOT blocked');
    assert(!rightClick(w, d.getElementById('label')).defaultPrevented, 'label NOT blocked');
    assert(!rightClick(w, d.getElementById('custom-btn')).defaultPrevented, 'role="button" NOT blocked');
    assert(!rightClick(w, d.getElementById('custom-btn-upper')).defaultPrevented, 'role="BUTTON" (case-insensitive) NOT blocked');
    assert(rightClick(w, d.getElementById('text')).defaultPrevented, 'plain text is still blocked as before (no over-broadening)');
}

console.log('TEST: video is exempt by default (protectVideo off), but NOT exempt when protectVideo is explicitly on');
{
    const domDefault = makeDom({ protectInteractive: true, protectVideo: false });
    assert(!rightClick(domDefault.window, domDefault.window.document.getElementById('video-el')).defaultPrevented, 'video NOT blocked when protectVideo is off (default)');

    const domProtected = makeDom({ protectInteractive: true, protectVideo: true });
    assert(rightClick(domProtected.window, domProtected.window.document.getElementById('video-el')).defaultPrevented, 'video IS blocked when protectVideo is explicitly on (admin opted in to protecting it)');
}

console.log('TEST: protectInteractive=false disables ALL of these exemptions too (maximal-restriction opt-out still works)');
{
    const dom = makeDom({ protectInteractive: false });
    const w = dom.window;
    const d = w.document;
    assert(rightClick(w, d.getElementById('map-canvas')).defaultPrevented, 'canvas IS blocked when protectInteractive is off');
    assert(rightClick(w, d.getElementById('custom-btn')).defaultPrevented, 'role="button" IS blocked when protectInteractive is off');
}

console.log('TEST: copy/selection blocking (isProtectionExempt) also picks up the expanded list automatically');
{
    const dom = makeDom({ protectInteractive: true, mode: 0, disableSelect: true });
    const w = dom.window;
    const d = w.document;
    const fireCopy = (target) => {
        const ev = new w.Event('copy', { bubbles: true, cancelable: true });
        target.dispatchEvent(ev);
        return ev;
    };
    assert(!fireCopy(d.getElementById('summary')).defaultPrevented, 'copy not blocked inside <summary>');
    assert(!fireCopy(d.getElementById('label')).defaultPrevented, 'copy not blocked inside <label>');
    assert(!fireCopy(d.getElementById('custom-btn')).defaultPrevented, 'copy not blocked inside role="button" element');
    assert(fireCopy(d.getElementById('text')).defaultPrevented, 'copy still blocked on plain paragraph text');
}

console.log(failures === 0 ? '\nALL EXPANDED-INTERACTIVE-EXEMPT TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
