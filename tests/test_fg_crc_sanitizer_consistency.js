const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(popupMessage) {
    const opts = { [OPT_KEY]: {
        mode: 1, disablePrint: false, disableSelect: false, disableImageDrag: false,
        popup: { enabled: true, title: 'Notice', message: popupMessage, timeout: 0 },
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

console.log('TEST: relative/anchor/query hrefs are preserved (unified with the menu-link scheme whitelist)');
{
    const dom = makeDom('<a href="/kontakt">Kontakt</a> <a href="#sekcia">Sekcia</a> <a href="?x=1">Query</a>');
    const w = dom.window;
    rightClick(w, w.document.getElementById('text'));
    const links = w.document.querySelectorAll('.crc-body a');
    assert(links.length === 3, 'all three anchors survive as tags');
    assert(links[0].getAttribute('href') === '/kontakt', 'relative href preserved (was previously stripped)');
    assert(links[1].getAttribute('href') === '#sekcia', '#anchor href preserved');
    assert(links[2].getAttribute('href') === '?x=1', '?query href preserved');
}

console.log('TEST: disallowed-but-harmless tags are unwrapped, keeping their text content');
{
    const dom = makeDom('<h2>Ahoj</h2><div>Wrapped <strong>bold</strong> text</div>');
    const w = dom.window;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    assert(!body.querySelector('h2'), '<h2> tag itself is gone');
    assert(!body.querySelector('div'), '<div> tag itself is gone');
    assert(body.textContent.includes('Ahoj'), 'h2 text content "Ahoj" is preserved (unwrapped, not deleted)');
    assert(body.textContent.includes('Wrapped') && body.textContent.includes('text'), 'div text content preserved around the nested <strong>');
    assert(!!body.querySelector('strong'), 'the nested <strong> (itself allowlisted) survives the div unwrap and is still sanitised/recursed into');
    assert(body.querySelector('strong').textContent === 'bold', 'the strong tag\'s own text is intact');
}

console.log('TEST: genuinely dangerous tags are still fully removed WITH their content, never unwrapped');
{
    const dom = makeDom('<script>window.__xss = true;<\/script><style>body{display:none}</style>Hello');
    const w = dom.window;
    w.__xss = false;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    assert(w.__xss === false, 'script never executed');
    assert(!body.innerHTML.toLowerCase().includes('__xss'), 'script SOURCE TEXT is not leaked into the page either (fully removed, not unwrapped)');
    assert(!body.innerHTML.toLowerCase().includes('display:none'), 'style content not leaked as text');
    assert(body.textContent.includes('Hello'), 'surrounding safe text still preserved');
}

console.log('TEST: deeply nested disallowed wrapper around a dangerous tag - dangerous content still fully dropped, safe content unwrapped correctly');
{
    const dom = makeDom('<div><h2>Before <script>window.__xss = true;<\/script> After</h2></div>');
    const w = dom.window;
    w.__xss = false;
    rightClick(w, w.document.getElementById('text'));
    const body = w.document.querySelector('.crc-body');
    assert(w.__xss === false, 'nested script never executed');
    assert(body.textContent.includes('Before') && body.textContent.includes('After'), 'text either side of the nested script survives both unwraps (div, then h2)');
    assert(!body.innerHTML.includes('__xss'), 'nested script content not leaked as text');
}

console.log(failures === 0 ? '\nALL SANITIZER-CONSISTENCY TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
