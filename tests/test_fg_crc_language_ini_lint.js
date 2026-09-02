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

console.log(failures === 0 ? '\nALL LANGUAGE-INI-LINT TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures ? 1 : 0);
