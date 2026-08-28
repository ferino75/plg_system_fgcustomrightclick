const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

// Sanity: the vulnerable pattern must not exist anywhere in the shipped file.
if (js.includes('new Function')) {
    console.log('FAIL: new Function( still present in source - eval path not removed');
    process.exit(1);
}
console.log('PASS: no new Function( anywhere in the shipped script');

function makeDom(options) {
    const optionsJson = JSON.stringify(options);
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body>
<p id="text">Hello world</p>
</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });

    const { window } = dom;
    window.eval(`
        window.Joomla = {
            getOptions: function (key) {
                var el = document.querySelector('script.joomla-script-options');
                var data = el ? JSON.parse(el.textContent) : {};
                return data[key];
            }
        };
    `);
    window.eval(js);
    return dom;
}

function rightClick(window, target) {
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
    target.dispatchEvent(ev);
    return ev;
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: whitelisted "copy_url" action runs the real clipboard function, nothing else');
{
    const opts = { [OPT_KEY]: {
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems: [ { type: 'action', label: 'Copy URL', icon: '', action: 'copy_url' } ]
    }};
    const dom = makeDom(opts);
    const w = dom.window;
    let copied = null;
    Object.defineProperty(w.navigator, 'clipboard', {
        value: { writeText: (text) => { copied = text; return Promise.resolve(); } },
        configurable: true,
    });
    rightClick(w, w.document.getElementById('text'));
    const item = w.document.querySelector('.crc-menu-item');
    assert(!!item, 'action item rendered');
    item.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert(copied === w.location.href, 'whitelisted copy_url action executed via the real clipboard API');
}

console.log('TEST: unknown/forged action key is a silent no-op (no crash, nothing runs)');
{
    const opts = { [OPT_KEY]: {
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        // Simulates a tampered/forged options payload with an action key outside the whitelist
        menuItems: [ { type: 'action', label: 'Evil', icon: '', action: 'alert(document.cookie)' } ]
    }};
    const dom = makeDom(opts);
    const w = dom.window;
    let threw = false;
    rightClick(w, w.document.getElementById('text'));
    const item = w.document.querySelector('.crc-menu-item');
    // Item is still rendered client-side if item.label truthy; the important
    // thing is clicking it must not execute arbitrary code or throw.
    try {
        item?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    } catch (e) {
        threw = true;
    }
    assert(!threw, 'forged action key does not throw or execute anything');
}

console.log('TEST: link item with a {url}-breaking crafted page URL is only ever used as a URL string, never as code');
{
    // A URL fragment can legally contain characters like quotes/semicolons
    // that would break out of a JS string/template literal if the URL were
    // ever concatenated into source code and eval'd (the original bug).
    const craftedHref = "https://victim.example/#'};window.__pwned=true;//";
    const opts = { [OPT_KEY]: {
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems: [ { type: 'link', label: 'Share', icon: '', value: 'https://x.com/share?u={url}', newtab: true } ]
    }};
    const dom = makeDom(opts);
    const w = dom.window;
    w.__pwned = false;

    const urlObj = new w.URL('https://original.example/page');
    dom.reconfigure({ url: craftedHref.replace('#', '/#') }); // jsdom needs a valid absolute URL; keep the dangerous fragment
    let openedUrl = null;
    w.open = (url) => { openedUrl = url; return null; };

    rightClick(w, w.document.getElementById('text'));
    const item = w.document.querySelector('.crc-menu-item');
    item.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    assert(w.__pwned === false, 'crafted URL fragment never executed as code');
    assert(typeof openedUrl === 'string' && openedUrl.startsWith('https://x.com/share?u='), 'crafted URL only ever passed to window.open() as a plain string (got: ' + openedUrl + ')');
}

console.log(failures === 0 ? '\nALL SECURITY TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
