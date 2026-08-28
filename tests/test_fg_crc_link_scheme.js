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
    target.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: unsafe-scheme link items are filtered out at menu-build time (never rendered)');
{
    const dom = makeDom([
        { type: 'link', label: 'Evil JS', icon: '', value: 'javascript:alert(1)', newtab: false },
        { type: 'link', label: 'Evil Data', icon: '', value: 'data:text/html,<script>alert(1)</script>', newtab: false },
        { type: 'link', label: 'Evil VBS', icon: '', value: 'vbscript:msgbox(1)', newtab: false },
        { type: 'link', label: 'Good Relative', icon: '', value: '/some-page', newtab: false },
        { type: 'link', label: 'Good Anchor', icon: '', value: '#section', newtab: false },
        { type: 'link', label: 'Good Https', icon: '', value: 'https://example.com', newtab: false },
        { type: 'link', label: 'Good Mailto', icon: '', value: 'mailto:someone@example.com', newtab: false },
    ]);
    const w = dom.window;
    rightClick(w, w.document.getElementById('text'));
    const labels = Array.from(w.document.querySelectorAll('.crc-menu-label')).map((el) => el.textContent);
    assert(!labels.includes('Evil JS'), 'javascript: link item filtered out');
    assert(!labels.includes('Evil Data'), 'data: link item filtered out');
    assert(!labels.includes('Evil VBS'), 'vbscript: link item filtered out');
    assert(labels.includes('Good Relative'), 'relative-path link item kept');
    assert(labels.includes('Good Anchor'), 'anchor link item kept');
    assert(labels.includes('Good Https'), 'https: link item kept');
    assert(labels.includes('Good Mailto'), 'mailto: link item kept');
    assert(labels.length === 4, 'exactly the 4 safe items were rendered (got ' + labels.length + ')');
}

console.log('TEST: clicking a safe https link only ever opens window.open with a plain URL string');
{
    const dom = makeDom([
        { type: 'link', label: 'Share', icon: '', value: 'https://x.com/share?u={url}', newtab: true },
    ]);
    const w = dom.window;
    let openedUrl = null;
    w.open = (url) => { openedUrl = url; return null; };
    rightClick(w, w.document.getElementById('text'));
    const item = w.document.querySelector('.crc-menu-item');
    item.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert(typeof openedUrl === 'string' && openedUrl.startsWith('https://x.com/share?u='), 'safe link navigated correctly (got: ' + openedUrl + ')');
}

console.log(failures === 0 ? '\nALL LINK-SCHEME TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
