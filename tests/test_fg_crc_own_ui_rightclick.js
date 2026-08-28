const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems: [
            { type: 'link', label: 'Home', icon: '', value: '/', newtab: false },
            { type: 'link', label: 'About', icon: '', value: '/about', newtab: false },
        ],
    }, cfgOverrides) };
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
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('BUG REPRO: right-click a custom-menu item a second time must NOT show the native menu (protectInteractive default on)');
{
    const dom = makeDom({ protectInteractive: true });
    const w = dom.window;
    const d = w.document;

    // First right-click opens the custom menu, as normal.
    const firstClick = rightClick(w, d.getElementById('text'));
    assert(firstClick.defaultPrevented, 'first right-click on page content opens the custom menu (native menu blocked)');
    assert(d.querySelector('.crc-menu.crc-visible'), 'custom menu is visible');

    // Second right-click, this time ON one of the menu's own <button>
    // items - this is exactly the reported bug: since menu items are
    // <button> elements and protectInteractive is on by default, this
    // was incorrectly treated as "site interactive content" and let the
    // native menu through instead of being blocked.
    const menuItem = d.querySelector('.crc-menu-item');
    const secondClick = rightClick(w, menuItem);
    assert(secondClick.defaultPrevented, 'right-click ON a custom-menu item is still blocked (native menu does NOT leak through)');
}

console.log('BUG REPRO (mode 1): right-click on the popup\'s own close button must NOT show the native menu');
{
    const dom = makeDom({
        mode: 1, protectInteractive: true,
        popup: { enabled: true, title: 'Notice', message: 'msg', timeout: 0 },
    });
    const w = dom.window;
    const d = w.document;

    rightClick(w, d.getElementById('text'));
    assert(d.querySelector('.crc-overlay.crc-visible'), 'popup is visible');

    const closeBtn = d.querySelector('.crc-close');
    const ev = rightClick(w, closeBtn);
    assert(ev.defaultPrevented, 'right-click on the popup close button (itself a <button>) is blocked, not exempted');
}

console.log('BUG REPRO: right-click on the popup overlay/backdrop area must NOT show the native menu');
{
    const dom = makeDom({
        mode: 1, protectInteractive: true,
        popup: { enabled: true, title: 'Notice', message: 'msg', timeout: 0 },
    });
    const w = dom.window;
    const d = w.document;

    rightClick(w, d.getElementById('text'));
    const overlay = d.querySelector('.crc-overlay');
    const ev = rightClick(w, overlay);
    assert(ev.defaultPrevented, 'right-click on the overlay backdrop is blocked');
}

console.log('SANITY: right-click on the SITE\'s own <button>/<a> (outside our UI) is still correctly exempted as before (no over-fix)');
{
    const dom = makeDom({ protectInteractive: true });
    const w = dom.window;
    const d = w.document;
    const siteButton = d.createElement('button');
    siteButton.textContent = 'Site button';
    d.body.appendChild(siteButton);

    const ev = rightClick(w, siteButton);
    assert(!ev.defaultPrevented, 'a real site button (not part of our menu/popup) is still exempted as intended');
}

console.log(failures === 0 ? '\nALL OWN-UI-RIGHTCLICK-REGRESSION TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
