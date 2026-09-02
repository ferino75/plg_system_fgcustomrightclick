const fs = require('fs');

const files = [
    __dirname + '/../language/en-GB/plg_system_fgcustomrightclick.ini',
    __dirname + '/../language/sk-SK/plg_system_fgcustomrightclick.ini',
    __dirname + '/../language/en-GB/plg_system_fgcustomrightclick.sys.ini',
    __dirname + '/../language/sk-SK/plg_system_fgcustomrightclick.sys.ini',
];

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); }
    else { failures++; console.log('  FAIL: ' + msg); }
}

console.log('TEST: no language file uses backslash-escaped double quotes or a bare backslash/dollar sign');
{
    // Real-world incident: a line using \"button\" (the officially
    // documented Joomla escaping method) rendered fine when parsed with
    // plain PHP parse_ini_file(), but broke Joomla's own runtime language
    // parser badly enough that two entire admin tabs (Popup, Custom menu)
    // silently vanished from the plugin's configuration screen - Joomla
    // changed how \ and $ are handled in language files around 4.4.1/
    // 5.0.1 while moving toward a "raw parser" for 6.0. The only fully
    // safe fix is to never need escaping at all: use single quotes for
    // any quoted text inside a value, and avoid literal \ or $ entirely.
    files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        const relative = file.replace(__dirname + '/../', '');

        assert(!content.includes('\\"'), `${relative}: no backslash-escaped double quote (\\") anywhere`);
        assert(!content.includes('\\'), `${relative}: no literal backslash character anywhere`);
        assert(!content.includes('$'), `${relative}: no literal dollar sign anywhere`);
    });
}

console.log('TEST: no language value contains a literal HTML-tag-like sequence (<letter...)');
{
    // CONFIRMED root cause of a real production incident: a field
    // description containing the literal, unclosed text "<noscript>"
    // (meant as plain-English prose, not markup) silently broke the
    // entire rest of the admin edit page. Joomla renders field
    // descriptions as raw HTML, not escaped text - and per the HTML5
    // spec, <noscript> is a "raw text" element when scripting is
    // enabled, meaning the browser treats everything from that point
    // until the next literal "</noscript>" string as inert text, not
    // markup. With no matching close tag anywhere later in the page,
    // this silently swallowed the rest of the DOM (including the
    // Popup/Custom menu tabs and, apparently, enough page structure to
    // also break the Save/Save & Close toolbar buttons) - with zero
    // console errors, since the browser was correctly following the
    // spec, not encountering a parse error. A second instance
    // (a literal "<video>" mention) was found and fixed at the same
    // time - <video> is a normal (non-raw-text) element so it likely
    // didn't cause the same severity of breakage, but the risk is the
    // same class of bug and is never worth taking. The fix in both
    // cases: describe tag/feature names in quotes ('noscript', 'video'),
    // never with literal angle brackets, anywhere in a language file.
    files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        const relative = file.replace(__dirname + '/../', '');
        const tagLikeMatch = content.match(/<[a-zA-Z][^\s"=]*/);

        assert(
            !tagLikeMatch,
            `${relative}: no literal HTML-tag-like sequence anywhere` + (tagLikeMatch ? ` (found: "${tagLikeMatch[0]}")` : '')
        );
    });
}

console.log(failures === 0 ? '\nALL LANGUAGE-INI-LINT TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
