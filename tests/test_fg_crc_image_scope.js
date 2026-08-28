const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 2,
        disablePrint: false,
        disableSelect: false,
        disableImageDrag: false,
    }, cfgOverrides) };
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
<style>
  #banner { background-image: url(https://example.com/banner.jpg); }
  #card { background-image: url(https://example.com/card.jpg); }
</style>
</head><body>
<img id="pic" src="x.png" alt="">
<picture id="picture-el"><img src="y.png" alt=""></picture>
<svg id="icon" width="16" height="16"><circle cx="8" cy="8" r="4"/></svg>
<canvas id="canvas-el" width="100" height="100"></canvas>
<video id="video-el" src="movie.mp4"></video>
<div id="banner">banner text directly on the bg element</div>
<div id="card"><button id="card-button">Click</button></div>
<p id="text">plain text</p>
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

console.log('TEST: mode 2 defaults - only <img>/<picture> are protected; svg/canvas/video/background-image are NOT');
{
    const dom = makeDom({});
    const w = dom.window;
    const d = w.document;

    assert(rightClick(w, d.getElementById('pic')).defaultPrevented, '<img> blocked (core case)');
    assert(rightClick(w, d.getElementById('picture-el')).defaultPrevented, '<picture> blocked');
    assert(!rightClick(w, d.getElementById('icon')).defaultPrevented, '<svg> NOT blocked by default (dropped - was a false-positive source on icon buttons)');
    assert(!rightClick(w, d.getElementById('canvas-el')).defaultPrevented, '<canvas> NOT blocked by default (dropped - browsers never offered "save image" on canvas anyway)');
    assert(!rightClick(w, d.getElementById('video-el')).defaultPrevented, '<video> NOT blocked by default (now opt-in via protectVideo)');
    assert(!rightClick(w, d.getElementById('banner')).defaultPrevented, 'CSS background-image element NOT blocked by default (now opt-in via protectBackgroundImages)');
    assert(!rightClick(w, d.getElementById('text')).defaultPrevented, 'plain text unaffected as before');
}

console.log('TEST: protectVideo=true extends mode 2 to <video>, nothing else changes');
{
    const dom = makeDom({ protectVideo: true });
    const w = dom.window;
    const d = w.document;
    assert(rightClick(w, d.getElementById('video-el')).defaultPrevented, '<video> blocked when protectVideo is on');
    assert(!rightClick(w, d.getElementById('icon')).defaultPrevented, '<svg> still not blocked (protectVideo does not affect it)');
    assert(!rightClick(w, d.getElementById('banner')).defaultPrevented, 'background-image still not blocked (needs its own toggle)');
}

console.log('TEST: protectBackgroundImages=true only matches the element that itself has the background image, not its children/buttons');
{
    const dom = makeDom({ protectBackgroundImages: true });
    const w = dom.window;
    const d = w.document;
    assert(rightClick(w, d.getElementById('banner')).defaultPrevented, 'right-click directly on the bg-image element itself IS blocked');
    assert(rightClick(w, d.getElementById('card')).defaultPrevented, 'right-click directly on the bg-image card IS blocked');
    assert(!rightClick(w, d.getElementById('card-button')).defaultPrevented, 'right-click on a BUTTON nested inside the bg-image card is NOT blocked (no more 4-ancestor walk-up over-matching)');
}

console.log('TEST: disableImageDrag respects the same scope - image always, video only when protectVideo is on');
{
    const dom = makeDom({ mode: 0, disableImageDrag: true, protectVideo: true });
    const w = dom.window;
    const d = w.document;
    const fireDrag = (target) => {
        const ev = new w.Event('dragstart', { bubbles: true, cancelable: true });
        target.dispatchEvent(ev);
        return ev;
    };
    assert(fireDrag(d.getElementById('pic')).defaultPrevented, 'dragging <img> blocked');
    assert(fireDrag(d.getElementById('video-el')).defaultPrevented, 'dragging <video> blocked when protectVideo is on');
    assert(!fireDrag(d.getElementById('icon')).defaultPrevented, 'dragging <svg> not blocked (out of scope now)');
}

console.log(failures === 0 ? '\nALL IMAGE-SCOPE TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
