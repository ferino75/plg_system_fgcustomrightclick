const fs = require('fs');

const css = fs.readFileSync(__dirname + '/../media/css/fgcustomrightclick.css', 'utf8');

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: theme detection prefers explicit template signal over prefers-color-scheme');
{
    assert(css.includes('[data-bs-theme="dark"]'), 'checks Bootstrap 5 data-bs-theme="dark" (Joomla 5/6 Cassiopeia + most BS5 templates)');
    assert(css.includes('[data-color-scheme="dark"]'), 'checks the alternate data-color-scheme="dark" convention');
    assert(css.includes(':root:not([data-bs-theme]):not([data-color-scheme])'), 'prefers-color-scheme fallback only applies when neither template attribute is present');
    assert(!/^\s*@media \(prefers-color-scheme: dark\) \{\s*\n\s*\.crc-popup,/m.test(css), 'the old unconditional prefers-color-scheme block (ignoring template theme) is gone');
}

console.log('TEST: prefers-reduced-motion disables transitions');
{
    assert(css.includes('prefers-reduced-motion: reduce'), 'prefers-reduced-motion media query present');
    const reduceBlockMatch = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
    assert(!!reduceBlockMatch, 'reduced-motion block found');
    if (reduceBlockMatch) {
        const block = reduceBlockMatch[1];
        assert(block.includes('.crc-overlay'), 'popup overlay covered by reduced-motion override');
        assert(block.includes('.crc-popup'), 'popup covered by reduced-motion override');
        assert(block.includes('.crc-menu'), 'menu covered by reduced-motion override');
        assert(block.includes('.crc-toast'), 'toast covered by reduced-motion override');
        assert(block.includes('transition: none'), 'transitions are disabled, not just shortened');
    }
}

console.log('TEST: RTL uses logical properties instead of hard-coded physical left/right');
{
    assert(css.includes('text-align: start'), 'menu item uses text-align: start (was hard-coded left)');
    assert(!css.includes('text-align: left'), 'no hard-coded text-align: left remains for menu item text');
    assert(css.includes('inset-inline-end'), 'close button uses inset-inline-end instead of a hard-coded right');
    assert(css.includes('margin-inline-end'), 'popup body/title spacing uses margin-inline-end instead of hard-coded margin-right');
    assert(css.includes(':dir(rtl)'), 'menu pop-out animation anchor flips for RTL documents via :dir(rtl)');
}

console.log('TEST: theming variables are actually used by the components that need to flip for dark mode');
{
    ['--crc-surface-bg', '--crc-surface-fg', '--crc-surface-border', '--crc-item-hover-bg', '--crc-sep-color', '--crc-close-fg', '--crc-close-fg-hover'].forEach((varName) => {
        assert(css.includes(varName), `custom property ${varName} is defined`);
    });
    assert(css.includes('background: var(--crc-surface-bg)'), '.crc-popup/.crc-menu background driven by the theme variable');
    assert(css.includes('color: var(--crc-close-fg)'), 'close button colour driven by the theme variable');
}

console.log(failures === 0 ? '\nALL CSS-THEMING/RTL/MOTION TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
