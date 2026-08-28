<?php
namespace Joomla\CMS\Plugin {
    class CMSPlugin {
        public $params;
        public function __construct() {}
        public function getApplication() { return null; }
        public function setApplication($app) {}
    }
}
namespace Joomla\Event {
    interface SubscriberInterface {}
    class Event {}
}
namespace Joomla\CMS\Document {
    class HtmlDocument {}
}
namespace Joomla\CMS\Language {
    class Text {
        public static function _($key) { return $key; }
    }
}
namespace Joomla\Filter {
    /**
     * Pass-through stub. Deliberately does NOT reimplement Joomla's real
     * tag/attribute whitelisting - that is Joomla's own well-established
     * code, not ours to re-verify here. This test targets only the
     * DOMDocument-based href re-validation logic that sanitizePopupMessage()
     * adds on top of InputFilter's own cleaning pass.
     */
    class InputFilter {
        // Deliberately NO static getInstance() here - the real
        // Joomla\Filter\InputFilter class doesn't have one either (that
        // only exists on the separate Joomla\CMS\Filter\InputFilter
        // subclass). This stub only exposes what the plugin code actually
        // uses, so calling ::getInstance() by mistake fails loudly here
        // exactly as it would against the real class - see the v1.6.8
        // changelog entry for the production incident this caused.
        //
        // These constant VALUES are copied from Joomla's official API docs
        // (api.joomla.org/framework-4/classes/Joomla-Filter-InputFilter.html)
        // and are deliberately asymmetric to catch exactly the mistake this
        // stub exists to prevent: ONLY_ALLOW_* (whitelist, what the plugin
        // needs) is 0; ONLY_BLOCK_* (blacklist - the opposite) is 1. An
        // earlier, broken version of the plugin code passed 1,1 here,
        // which silently selected blacklist mode instead of whitelist.
        const ONLY_ALLOW_DEFINED_TAGS = 0;
        const ONLY_BLOCK_DEFINED_TAGS = 1;
        const ONLY_ALLOW_DEFINED_ATTRIBUTES = 0;
        const ONLY_BLOCK_DEFINED_ATTRIBUTES = 1;

        public static $lastTagsMethod = null;
        public static $lastAttrMethod = null;

        public function __construct($tagsArray = [], $attrArray = [], $tagsMethod = 0, $attrMethod = 0, $xssAuto = 1) {
            self::$lastTagsMethod = $tagsMethod;
            self::$lastAttrMethod = $attrMethod;
        }
        public function clean($source, $type = 'string') {
            return $source;
        }
    }
}

namespace {
    define('_JEXEC', 1);
    require_once __DIR__ . "/../src/Extension/Fgcustomrightclick.php";

    $ref = new \ReflectionClass("FG\\Plugin\\System\\Fgcustomrightclick\\Extension\\Fgcustomrightclick");
    $method = $ref->getMethod("sanitizePopupMessage");
    $method->setAccessible(true);
    $instance = $ref->newInstanceWithoutConstructor();

    $failures = 0;
    function assertTrue($cond, $msg) {
        global $failures;
        if ($cond) { echo "  PASS: $msg\n"; }
        else { $failures++; echo "  FAIL: $msg\n"; }
    }

    echo "TEST: relative href (/kontakt) is preserved, not stripped\n";
    {
        $out = $method->invoke($instance, '<a href="/kontakt">Kontakt</a>');
        assertTrue(strpos($out, 'href="/kontakt"') !== false, 'relative href kept in output (got: ' . $out . ')');
    }

    echo "TEST: anchor href with disallowed scheme (javascript:) is stripped, text kept\n";
    {
        $out = $method->invoke($instance, '<a href="javascript:alert(1)">Click</a>');
        assertTrue(strpos($out, 'href=') === false, 'javascript: href removed (got: ' . $out . ')');
        assertTrue(strpos($out, 'Click') !== false, 'link text preserved even though href was stripped');
    }

    echo "TEST: safe https href is preserved unchanged\n";
    {
        $out = $method->invoke($instance, '<a href="https://example.com">Example</a>');
        assertTrue(strpos($out, 'href="https://example.com"') !== false, 'https href kept (got: ' . $out . ')');
    }

    echo "TEST: #anchor and ?query hrefs are preserved (consistent with menu-link scheme rules)\n";
    {
        $out1 = $method->invoke($instance, '<a href="#section">Jump</a>');
        $out2 = $method->invoke($instance, '<a href="?x=1">Query</a>');
        assertTrue(strpos($out1, 'href="#section"') !== false, '#anchor href kept (got: ' . $out1 . ')');
        assertTrue(strpos($out2, 'href="?x=1"') !== false, '?query href kept (got: ' . $out2 . ')');
    }

    echo "TEST: empty message returns empty string without touching InputFilter/DOMDocument at all\n";
    {
        assertTrue($method->invoke($instance, '') === '', 'empty input returns empty output');
        assertTrue($method->invoke($instance, '   ') === '', 'whitespace-only input returns empty output');
    }

    echo "TEST: message with no <a> tags at all skips the DOMDocument pass entirely (no crash, unchanged)\n";
    {
        $out = $method->invoke($instance, '<strong>Bold</strong> and <em>italic</em>');
        assertTrue(strpos($out, 'Bold') !== false && strpos($out, 'italic') !== false, 'non-link content passed through (got: ' . $out . ')');
    }

    echo "TEST: InputFilter is constructed in WHITELIST mode (ONLY_ALLOW_DEFINED_*), not blacklist\n";
    {
        // Reset the capture, then trigger any call that reaches the
        // InputFilter constructor.
        \Joomla\Filter\InputFilter::$lastTagsMethod = null;
        \Joomla\Filter\InputFilter::$lastAttrMethod = null;
        $method->invoke($instance, '<a href="https://example.com">x</a>');
        assertTrue(
            \Joomla\Filter\InputFilter::$lastTagsMethod === \Joomla\Filter\InputFilter::ONLY_ALLOW_DEFINED_TAGS,
            'tagsMethod is ONLY_ALLOW_DEFINED_TAGS (whitelist), not ONLY_BLOCK_DEFINED_TAGS (got: ' . var_export(\Joomla\Filter\InputFilter::$lastTagsMethod, true) . ')'
        );
        assertTrue(
            \Joomla\Filter\InputFilter::$lastAttrMethod === \Joomla\Filter\InputFilter::ONLY_ALLOW_DEFINED_ATTRIBUTES,
            'attrMethod is ONLY_ALLOW_DEFINED_ATTRIBUTES (whitelist), not ONLY_BLOCK_DEFINED_ATTRIBUTES (got: ' . var_export(\Joomla\Filter\InputFilter::$lastAttrMethod, true) . ')'
        );
    }

    echo $failures === 0 ? "\nALL PHP POPUP-SANITIZER TESTS PASSED\n" : "\n$failures TEST(S) FAILED\n";
    exit($failures === 0 ? 0 : 1);
}
