const { JSDOM } = require('jsdom');
const fs = require('fs');

const js = fs.readFileSync(__dirname + '/../media/js/fgcustomrightclick.js', 'utf8');
const OPT_KEY = 'plg_system_fgcustomrightclick';

function makeDom(cfgOverrides) {
    const opts = { [OPT_KEY]: Object.assign({
        mode: 3, disablePrint: false, disableSelect: false, disableImageDrag: false,
        menuItems: [
            { type: 'action', label: 'Copy URL', icon: '', action: 'copy_url' },
        ],
        manualCopyMessage: 'Press Ctrl+C to copy:',
    }, cfgOverrides) };
    const optionsJson = JSON.stringify(opts).replace(/<\//g, '<\\/');
    const dom = new JSDOM(`<!DOCTYPE html>
<html><head>
<script class="joomla-script-options new" type="application/json">${optionsJson}</script>
</head><body><p id="text">Hello</p></body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    // No navigator.clipboard AND jsdom has no execCommand - every test in
    // this file exercises the manual fallback (tier 3) deliberately.
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

async function triggerCopy(w, d) {
    rightClick(w, d.getElementById('text'));
    d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(10);
    return d.querySelector('.crc-copy-fallback');
}

async function main() {
    console.log('TEST: fallback box input is focused and its full value selected on open');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const box = await triggerCopy(w, d);
        const input = box.querySelector('.crc-copy-fallback-input');
        assert(d.activeElement === input, 'the readonly input is focused so Ctrl+C targets it immediately');
        assert(input.selectionStart === 0 && input.selectionEnd === input.value.length, 'the full URL text is selected, ready to copy');
    }

    console.log('TEST: the close button dismisses the box and returns focus to the trigger element');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;

        const trigger = d.createElement('button');
        d.body.appendChild(trigger);
        trigger.focus();

        const box = await triggerCopy(w, d);
        assert(box.classList.contains('crc-visible'), 'box is visible before closing');

        box.querySelector('.crc-copy-fallback-close').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        assert(!box.classList.contains('crc-visible'), 'box is hidden after clicking its close button');
        assert(d.activeElement === trigger, 'focus returned to the element that had it before the menu/box opened');
    }

    console.log('TEST: clicking outside the box dismisses it');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const box = await triggerCopy(w, d);
        assert(box.classList.contains('crc-visible'), 'box is visible');

        d.getElementById('text').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        assert(!box.classList.contains('crc-visible'), 'box hidden after an outside click');
    }

    console.log('TEST: clicking INSIDE the box (e.g. the input itself) does NOT dismiss it');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const box = await triggerCopy(w, d);
        const input = box.querySelector('.crc-copy-fallback-input');

        input.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        assert(box.classList.contains('crc-visible'), 'box remains open when clicking its own input');
    }

    console.log('TEST: Escape dismisses the box');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const box = await triggerCopy(w, d);
        assert(box.classList.contains('crc-visible'), 'box is visible before Escape');

        const esc = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        d.dispatchEvent(esc);
        assert(!box.classList.contains('crc-visible'), 'box hidden after pressing Escape');
    }

    console.log('TEST: the localized instruction message and the URL both appear correctly');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        const box = await triggerCopy(w, d);
        assert(box.querySelector('.crc-copy-fallback-msg').textContent === 'Press Ctrl+C to copy:', 'localized instruction message shown');
        assert(box.querySelector('.crc-copy-fallback-input').value === w.location.href, 'input contains the current page URL');
    }

    console.log(failures === 0 ? '\nALL MANUAL-COPY-FALLBACK TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
    process.exit(failures ? 1 : 0);
}

main();
