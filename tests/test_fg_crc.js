const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(options, withJoomlaCore) {
    const optionsJson = JSON.stringify(options);
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body>
<p id="text">Hello world</p>
<img id="pic" src="x.png" alt="">
</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });

    const { window } = dom;

    if (withJoomlaCore) {
        window.eval(`
            window.Joomla = {
                optionsStorage: null,
                getOptions: function (key) {
                    if (!this.optionsStorage) {
                        var el = document.querySelector('script.joomla-script-options');
                        this.optionsStorage = el ? JSON.parse(el.textContent) : {};
                    }
                    return this.optionsStorage[key];
                }
            };
        `);
    }

    window.eval(js);
    return dom;
}

function rightClick(window, target, x, y) {
    const ev = new window.MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: x || 100, clientY: y || 100
    });
    target.dispatchEvent(ev);
    return ev;
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST 1: mode 3 custom menu, WITH Joomla core, renamed options key');
{
    const opts = { [OPT_KEY]: {
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems: [
            { type: 'link', label: 'Refresh', icon: '🔄', value: '{url}', newtab: false },
            { type: 'separator' },
            { type: 'action', label: 'Copy URL', icon: '', action: 'copy_url', newtab: false }
        ]
    }};
    const dom = makeDom(opts, true);
    const w = dom.window;
    let copied = null;
    Object.defineProperty(w.navigator, 'clipboard', {
        value: { writeText: (text) => { copied = text; return Promise.resolve(); } },
        configurable: true,
    });
    const ev = rightClick(w, w.document.getElementById('text'));

    assert(ev.defaultPrevented, 'contextmenu default prevented');
    const menu = w.document.querySelector('.crc-menu');
    assert(!!menu, 'menu element created');
    assert(menu && menu.classList.contains('crc-visible'), 'menu is visible');
    const items = w.document.querySelectorAll('.crc-menu-item');
    assert(items.length === 2, 'two clickable items rendered');
    items[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    assert(copied === w.location.href, 'whitelisted action item executed via the real clipboard API');
}

console.log('TEST 2: mode 3, WITHOUT Joomla core (fallback path reads renamed key)');
{
    const opts = { [OPT_KEY]: {
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems: [ { type: 'link', label: 'Home', icon: '', value: '/', newtab: false } ]
    }};
    const dom = makeDom(opts, false);
    const w = dom.window;
    rightClick(w, w.document.getElementById('text'));
    const menu = w.document.querySelector('.crc-menu.crc-visible');
    assert(!!menu, 'menu shown via JSON fallback with renamed key (no core.js)');
}

console.log('TEST 3: mode 1 popup + focus trap + focus return');
{
    const opts = { [OPT_KEY]: {
        mode: 1, disablePrint: false, disableSelect: false, disableImageDrag: false,
        popup: { enabled: true, title: 'Stop', message: 'msg', timeout: 0 }
    }};
    const dom = makeDom(opts, true);
    const w = dom.window;
    const d = w.document;
    const trigger = d.createElement('button');
    d.body.appendChild(trigger);
    trigger.focus();

    rightClick(w, d.getElementById('text'));
    const closeBtn = d.querySelector('.crc-close');
    assert(d.activeElement === closeBtn, 'focus moved to popup close button on open');

    const escEv = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    d.dispatchEvent(escEv);
    assert(d.activeElement === trigger, 'focus returned to trigger after Escape');
}

console.log('TEST 4: mode 2 images only');
{
    const opts = { [OPT_KEY]: { mode: 2, disablePrint: false, disableSelect: false, disableImageDrag: false } };
    const dom = makeDom(opts, true);
    const w = dom.window;
    const evText = rightClick(w, w.document.getElementById('text'));
    assert(!evText.defaultPrevented, 'text: default menu allowed');
    const evImg = rightClick(w, w.document.getElementById('pic'));
    assert(evImg.defaultPrevented, 'image: contextmenu blocked');
}

console.log('TEST 5: blockDevtools shortcuts');
{
    const opts = { [OPT_KEY]: { mode: 0, disablePrint: false, disableSelect: false, disableImageDrag: false, blockDevtools: true } };
    const dom = makeDom(opts, true);
    const w = dom.window;
    function key(props) {
        const ev = new w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, props));
        w.document.body.dispatchEvent(ev);
        return ev;
    }
    assert(key({ key: 'F12', code: 'F12' }).defaultPrevented, 'F12 blocked');
    assert(key({ key: 'u', code: 'KeyU', ctrlKey: true }).defaultPrevented, 'Ctrl+U blocked');
    assert(!key({ key: 'c', code: 'KeyC', ctrlKey: true }).defaultPrevented, 'plain Ctrl+C NOT blocked');
}

console.log('TEST 6: no config -> no crash, no effect');
{
    const dom = new JSDOM('<!DOCTYPE html><html><body><p id="t">x</p></body></html>', { runScripts: 'outside-only' });
    dom.window.eval(js);
    const ev = rightClick(dom.window, dom.window.document.getElementById('t'));
    assert(!ev.defaultPrevented, 'no config: browser menu untouched');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
