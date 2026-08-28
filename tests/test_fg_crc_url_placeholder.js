const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(menuItems, pageUrl) {
    const opts = { [OPT_KEY]: {
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems,
    }};
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body><p id="text">Hello</p></body></html>`, {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: pageUrl || 'https://example.com/some/page?x=1',
    });
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

console.log('TEST: value is exactly "{url}" - substitutes the raw, unencoded page URL (self-link case)');
{
    const dom = makeDom(
        [{ type: 'link', label: 'This page', icon: '', value: '{url}', newtab: true }],
        'https://example.com/some/page?x=1'
    );
    const w = dom.window;
    const d = w.document;
    let openedUrl = null;
    w.open = (url) => { openedUrl = url; return null; };
    rightClick(w, d.getElementById('text'));
    d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert(openedUrl === 'https://example.com/some/page?x=1', 'raw URL used verbatim, not percent-encoded (got: ' + openedUrl + ')');
    assert(!openedUrl.includes('%3A'), 'no percent-encoding artifacts (would break as a relative path)');
}

console.log('TEST: value is "{url}" with surrounding whitespace - still treated as the whole-value case');
{
    const dom = makeDom(
        [{ type: 'link', label: 'This page', icon: '', value: '  {url}  ', newtab: true }],
        'https://example.com/page'
    );
    const w = dom.window;
    const d = w.document;
    let openedUrl = null;
    w.open = (url) => { openedUrl = url; return null; };
    rightClick(w, d.getElementById('text'));
    d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert(openedUrl === 'https://example.com/page', 'leading/trailing whitespace around {url} still resolves to the raw URL (got: ' + openedUrl + ')');
}

console.log('TEST: {url} embedded in a query string is still percent-encoded (existing documented pattern, unaffected)');
{
    const dom = makeDom(
        [{ type: 'link', label: 'Share', icon: '', value: 'https://twitter.com/intent/tweet?text={url}', newtab: true }],
        'https://example.com/some/page?x=1'
    );
    const w = dom.window;
    const d = w.document;
    let openedUrl = null;
    w.open = (url) => { openedUrl = url; return null; };
    rightClick(w, d.getElementById('text'));
    d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert(openedUrl === 'https://twitter.com/intent/tweet?text=' + encodeURIComponent('https://example.com/some/page?x=1'), 'query-string {url} still percent-encoded correctly (got: ' + openedUrl + ')');
}

console.log('TEST: {url} with extra text around it (not the whole value, not a query string) is still percent-encoded (documented limitation)');
{
    const dom = makeDom(
        [{ type: 'link', label: 'Anchor', icon: '', value: '{url}#section', newtab: true }],
        'https://example.com/page'
    );
    const w = dom.window;
    const d = w.document;
    let openedUrl = null;
    w.open = (url) => { openedUrl = url; return null; };
    rightClick(w, d.getElementById('text'));
    d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    // Documents the known remaining limitation rather than asserting ideal behaviour:
    assert(openedUrl.startsWith(encodeURIComponent('https://example.com/page')), 'non-whole-value case still uses encoded substitution as before (got: ' + openedUrl + ')');
}

console.log(failures === 0 ? '\nALL {url}-SUBSTITUTION TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
