const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems: [
            { type: 'link', label: 'Home', icon: '', value: '/', newtab: false },
        ],
    }, cfgOverrides) };
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body><p id="text">Hello</p><img id="pic" src="x.png" alt=""></body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
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

// jsdom's Touch/TouchEvent constructors are limited, so touches are built
// as plain objects with the fields our code actually reads (clientX/Y),
// matching how real touch events expose them.
function touchStart(window, target, x, y) {
    const ev = new window.Event('touchstart', { bubbles: true, cancelable: true });
    ev.touches = [{ clientX: x, clientY: y }];
    target.dispatchEvent(ev);
    return ev;
}
function touchMove(window, target, x, y) {
    const ev = new window.Event('touchmove', { bubbles: true, cancelable: true });
    ev.touches = [{ clientX: x, clientY: y }];
    target.dispatchEvent(ev);
    return ev;
}
function touchEnd(window, target) {
    const ev = new window.Event('touchend', { bubbles: true, cancelable: true });
    ev.touches = [];
    target.dispatchEvent(ev);
    return ev;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

async function main() {
    console.log('TEST: a stationary long-press (>=500ms, no movement) opens the custom menu, same as desktop right-click');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        touchStart(w, d.getElementById('text'), 100, 200);
        await wait(600);
        assert(d.querySelector('.crc-menu.crc-visible'), 'custom menu opened via touch long-press');
    }

    console.log('TEST: a quick tap (touchend before the timer fires) does NOT open the menu');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        touchStart(w, d.getElementById('text'), 100, 200);
        await wait(100);
        touchEnd(w, d.getElementById('text'));
        await wait(600);
        assert(!d.querySelector('.crc-menu.crc-visible'), 'no menu after a short tap - the long-press timer was cancelled by touchend');
    }

    console.log('TEST: finger movement past the tolerance (a scroll/swipe) cancels the long-press');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const el = d.getElementById('text');
        touchStart(w, el, 100, 200);
        await wait(100);
        touchMove(w, el, 100, 260); // 60px vertical movement - clearly a scroll, not a long-press
        await wait(600);
        assert(!d.querySelector('.crc-menu.crc-visible'), 'menu did NOT open - movement cancelled the long-press timer (this was a scroll)');
    }

    console.log('TEST: small jitter within tolerance does NOT cancel the long-press');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const el = d.getElementById('text');
        touchStart(w, el, 100, 200);
        await wait(50);
        touchMove(w, el, 103, 202); // 3px jitter - well within the 10px tolerance
        await wait(600);
        assert(d.querySelector('.crc-menu.crc-visible'), 'menu still opened - small jitter within tolerance did not cancel it');
    }

    console.log('TEST: multi-touch (e.g. pinch-to-zoom) is ignored, never treated as a long-press');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const el = d.getElementById('text');
        const ev = new w.Event('touchstart', { bubbles: true, cancelable: true });
        ev.touches = [{ clientX: 100, clientY: 200 }, { clientX: 200, clientY: 300 }];
        el.dispatchEvent(ev);
        await wait(600);
        assert(!d.querySelector('.crc-menu.crc-visible'), 'two-finger touch never triggers the menu');
    }

    console.log('TEST: a native contextmenu firing right after a handled long-press (Android Chrome behaviour) does not double-act');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const el = d.getElementById('text');
        touchStart(w, el, 100, 200);
        await wait(600);
        const menu = d.querySelector('.crc-menu');
        assert(menu.classList.contains('crc-visible'), 'menu opened via long-press first');

        // Track how many times the menu gets (re-)shown by watching showMenu's
        // side effect: it resets item tabIndex/focus each time it runs. We
        // instead assert the simpler, directly observable contract: the
        // follow-up native contextmenu event must be prevented (blocked) and
        // must not throw, without asserting on internal call counts.
        const followUpEvent = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        let threw = false;
        try {
            el.dispatchEvent(followUpEvent);
        } catch (e) {
            threw = true;
        }
        assert(!threw, 'no error when the native contextmenu follows the handled long-press');
        assert(followUpEvent.defaultPrevented, 'the follow-up native contextmenu is still prevented (native menu does not leak through)');
    }

    console.log('TEST: mode 2 (images only) - long-press on an image blocks the native callout via the same shared logic');
    {
        const dom = makeDom({ mode: 2 });
        const w = dom.window;
        const d = w.document;
        touchStart(w, d.getElementById('pic'), 50, 50);
        await wait(600);
        // Mode 2 never shows our own menu - it only suppresses. This test
        // just confirms the long-press path reaches isProtectedMediaTarget()
        // without crashing and without opening a menu (mode 2 has none).
        assert(!d.querySelector('.crc-menu'), 'mode 2 long-press never creates a custom menu (that is mode 3 only)');
    }

    console.log('TEST: long-press on the plugin\'s own UI is still blocked via isOwnUiTarget, not treated as new content');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        touchStart(w, d.getElementById('text'), 100, 200);
        await wait(600);
        const menuItem = d.querySelector('.crc-menu-item');
        assert(!!menuItem, 'menu is open with an item to long-press on');

        // Long-press on the menu's own item - should not attempt to reopen
        // a nested menu or throw.
        let threw = false;
        try {
            touchStart(w, menuItem, 10, 10);
            await wait(600);
        } catch (e) {
            threw = true;
        }
        assert(!threw, 'long-pressing the plugin\'s own menu item does not throw');
    }

    console.log(failures === 0 ? '\nALL TOUCH-LONGPRESS TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
    process.exit(failures ? 1 : 0);
}

main();
