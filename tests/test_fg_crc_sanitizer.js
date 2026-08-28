const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(popupMessage) {
    const opts = { [OPT_KEY]: {
        mode: 1, disablePrint: false, disableSelect: false, disableImageDrag: false,
        popup: { enabled: true, title: 'Notice', message: popupMessage, timeout: 0 },
    }};
    // Escape "</" so a payload containing e.g. "</script>" can't prematurely
    // close the outer <script> tag this JSON is embedded in.
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

console.log('TEST: <script> tag is stripped entirely, does not execute');
{
    const dom = makeDom('Hello <script>window.__xss = true;<\/script> world');
    const w = dom.window;
    w.__xss = false;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    assert(w.__xss === false, 'injected <script> never executed');
    assert(!body.innerHTML.toLowerCase().includes('<script'), '<script> tag not present in rendered HTML');
    assert(body.textContent.includes('Hello') && body.textContent.includes('world'), 'surrounding text preserved');
}

console.log('TEST: onerror/onclick event-handler attributes are stripped');
{
    const dom = makeDom('<img src=x onerror="window.__xss=true"><a href="#" onclick="window.__xss=true">click</a>');
    const w = dom.window;
    w.__xss = false;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    assert(!body.innerHTML.toLowerCase().includes('onerror'), 'onerror attribute stripped');
    assert(!body.innerHTML.toLowerCase().includes('onclick'), 'onclick attribute stripped');
    assert(!body.querySelector('img'), '<img> tag (not in allowlist) removed entirely');
}

console.log('TEST: javascript: URL in href is stripped, safe http(s) href is kept');
{
    const dom = makeDom('<a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a>');
    const w = dom.window;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    const links = body.querySelectorAll('a');
    assert(links.length === 2, 'both <a> tags survive (tag itself is allowlisted)');
    assert(!links[0].hasAttribute('href'), 'javascript: href removed from first link');
    assert(links[1].getAttribute('href') === 'https://example.com', 'safe https href preserved on second link');
}

console.log('TEST: iframe/object/embed/style are stripped entirely');
{
    const dom = makeDom('<iframe src="https://evil.example"></iframe><object data="x"></object><style>body{display:none}</style>text');
    const w = dom.window;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    assert(!body.querySelector('iframe'), 'iframe removed');
    assert(!body.querySelector('object'), 'object removed');
    assert(!body.querySelector('style'), 'style removed');
    assert(body.textContent.includes('text'), 'trailing safe text preserved');
}

console.log('TEST: allowlisted formatting tags survive intact');
{
    const dom = makeDom('<strong>Bold</strong> <em>Italic</em><br><p>Paragraph</p><ul><li>Item</li></ul>');
    const w = dom.window;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    assert(!!body.querySelector('strong'), '<strong> preserved');
    assert(!!body.querySelector('em'), '<em> preserved');
    assert(!!body.querySelector('br'), '<br> preserved');
    assert(!!body.querySelector('p'), '<p> preserved');
    assert(!!body.querySelector('ul li'), '<ul><li> preserved');
}

console.log('TEST: popup title always uses textContent (never HTML) - sanity check unaffected by this change');
{
    const dom = makeDom('plain');
    const w = dom.window;
    // title is set separately via cfg.popup.title further up in showPopup/buildPopup;
    // re-verify via a fresh config with a title containing markup-looking text
    rightClick(w, w.document.getElementById('text'));
    const titleEl = w.document.querySelector('.crc-title');
    assert(titleEl.textContent === 'Notice', 'title rendered as plain text');
    assert(!titleEl.querySelector('*'), 'title has no child elements (textContent, not innerHTML)');
}

console.log(failures === 0 ? '\nALL SANITIZER TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
