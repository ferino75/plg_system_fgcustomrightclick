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
        copiedMessage: 'Skopírované do schránky',
        copyFailedMessage: 'Nepodarilo sa skopírovať do schránky',
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
    target.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

async function main() {
    console.log('TEST: modern Clipboard API path (secure context / HTTPS) - success toast shown with localized message');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        let copiedTo = null;
        Object.defineProperty(w.navigator, 'clipboard', {
            value: { writeText: (text) => { copiedTo = text; return Promise.resolve(); } },
            configurable: true,
        });

        rightClick(w, d.getElementById('text'));
        d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await wait(10);

        assert(copiedTo === w.location.href, 'navigator.clipboard.writeText was used (secure-context path)');
        const toast = d.querySelector('.crc-toast');
        assert(!!toast, 'toast element created');
        assert(toast.classList.contains('crc-toast-visible'), 'toast is visible');
        assert(toast.textContent === 'Skopírované do schránky', 'toast shows the localized "copied" message (got: ' + toast.textContent + ')');
    }

    console.log('TEST: no navigator.clipboard at all (plain HTTP) - falls back to execCommand attempt, still shows a result toast');
    {
        const dom = makeDom({});
        const w = dom.window;
        const d = w.document;
        // Simulate a non-secure-context browser: navigator.clipboard is
        // simply undefined there, exactly like real HTTP pages.
        Object.defineProperty(w.navigator, 'clipboard', { value: undefined, configurable: true });

        let threw = false;
        rightClick(w, d.getElementById('text'));
        try {
            d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        } catch (e) {
            threw = true;
        }
        await wait(10);

        assert(!threw, 'no crash when navigator.clipboard is entirely unavailable');
        const toast = d.querySelector('.crc-toast');
        assert(!!toast, 'toast still shown even without the Clipboard API');
        assert(toast.classList.contains('crc-toast-visible'), 'toast is visible');
        // jsdom does not implement document.execCommand at all, so the
        // legacy fallback reports failure here - this still proves the
        // wiring (attempt the fallback, then always show SOME feedback)
        // instead of silently doing nothing, which was the actual bug
        // being fixed. A real browser's execCommand('copy') would
        // typically succeed here instead.
        assert(toast.textContent === 'Nepodarilo sa skopírovať do schránky', 'shows the localized "copy failed" message when both copy paths are unavailable (got: ' + toast.textContent + ')');
    }

    console.log('TEST: missing copiedMessage/copyFailedMessage falls back to English defaults');
    {
        const dom = makeDom({ copiedMessage: undefined, copyFailedMessage: undefined });
        const w = dom.window;
        const d = w.document;
        Object.defineProperty(w.navigator, 'clipboard', {
            value: { writeText: () => Promise.resolve() },
            configurable: true,
        });
        rightClick(w, d.getElementById('text'));
        d.querySelector('.crc-menu-item').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await wait(10);
        const toast = d.querySelector('.crc-toast');
        assert(toast.textContent === 'Copied to clipboard', 'falls back to English default when localized message is absent (got: ' + toast.textContent + ')');
    }

    console.log(failures === 0 ? '\nALL COPY-FEEDBACK TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
    process.exit(failures ? 1 : 0);
}

main();
