const fs = require('fs');

const css = fs.readFileSync(__dirname + '/../media/css/fgcustomrightclick.css', 'utf8');

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

// Minimal specificity calculator for a single simple selector chain
// (enough to verify OUR selectors, not a general-purpose CSS parser).
// Counts: [ids, classes/attrs/pseudo-classes, elements/pseudo-elements]
function specificity(selector) {
    let ids = 0;
    let classes = 0;
    let elements = 0;
    // Strip pseudo-class arguments like :not(...) contents are ignored for this simple check
    const tokens = selector.match(/(#[\w-]+)|(\.[\w-]+)|(\[[^\]]+\])|(:[\w-]+)|([a-zA-Z][\w-]*)|(\*)/g) || [];
    tokens.forEach((t) => {
        if (t.startsWith('#')) ids++;
        else if (t.startsWith('.') || t.startsWith('[') || t.startsWith(':')) classes++;
        else if (t === '*') { /* universal selector contributes 0 */ }
        else elements++;
    });
    return [ids, classes, elements];
}

console.log('TEST: the noselect blocking selector repeats .crc-noselect 4x, raising its class-specificity');
{
    const match = css.match(/(\.crc-noselect(?:\.crc-noselect)*) body,\n\1 body \* \{/);
    assert(!!match, 'blocking selector found in the stylesheet');
    if (match) {
        const repeatCount = (match[1].match(/\.crc-noselect\b/g) || []).length;
        assert(repeatCount === 4, `.crc-noselect is repeated exactly 4 times (got ${repeatCount})`);

        const [ids, classes, elements] = specificity(match[1] + ' body *');
        assert(ids === 0, 'still zero IDs - this is a class-only selector, as intended (no invented ID)');
        assert(classes === 4, `class count is 4 (got ${classes}) - matches a plain single-class competitor's specificity only if it also has 4+ classes`);
        assert(elements === 1, 'element count is 1 (the "body" in the selector; "*" contributes 0)');

        // The actual point of the exercise: compare against a single-class
        // theme override like ".some-theme-class body p { ... !important }"
        // (classes=2, elements=1) - our boosted selector must now outrank it.
        const themeSingleClass = specificity('.some-theme-class body p');
        const ours = [ids, classes, elements];
        const oursBeatsTheme = ours[0] > themeSingleClass[0]
            || (ours[0] === themeSingleClass[0] && ours[1] > themeSingleClass[1]);
        assert(oursBeatsTheme, 'boosted selector now outranks a realistic single-class theme override (ids tie at 0, classes 4 > 2)');

        // And the documented, unavoidable limit: an ID-based theme override
        // still wins, no matter how many times we repeat our own class -
        // this is a property of the CSS specificity algorithm itself, not
        // something any selector we author could ever change.
        const themeWithId = specificity('body #main-content p');
        const themeIdWins = themeWithId[0] > ours[0];
        assert(themeIdWins, 'an ID-based theme override still outranks us - this ceiling is fundamental to CSS, not a bug in the fix');
    }
}

console.log('TEST: the interactive-exempt selector also repeats its class 4x, consistently');
{
    const match = css.match(/(\.crc-noselect-interactive-exempt(?:\.crc-noselect-interactive-exempt)*) a,/);
    assert(!!match, 'interactive-exempt selector found');
    if (match) {
        const repeatCount = (match[1].match(/\.crc-noselect-interactive-exempt\b/g) || []).length;
        assert(repeatCount === 4, `.crc-noselect-interactive-exempt is repeated exactly 4 times (got ${repeatCount})`);
    }
}

console.log('TEST: !important is still present on every affected declaration (the repetition supplements it, does not replace it)');
{
    const blockingBlock = css.match(/\.crc-noselect\.crc-noselect\.crc-noselect\.crc-noselect body,[\s\S]*?\}/)[0];
    assert(blockingBlock.includes('!important'), 'blocking rule still has !important');
    const exemptBlock = css.match(/\.crc-noselect-interactive-exempt\.crc-noselect-interactive-exempt\.crc-noselect-interactive-exempt\.crc-noselect-interactive-exempt a,[\s\S]*?\}/)[0];
    assert(exemptBlock.includes('!important'), 'interactive-exempt rule still has !important');
}

console.log(failures === 0 ? '\nALL CSS-SPECIFICITY TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
