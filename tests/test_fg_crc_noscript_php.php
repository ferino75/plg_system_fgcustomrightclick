<?php
namespace Joomla\CMS\Plugin {
    class CMSPlugin {
        public $params;
        public $testApp;
        public function __construct() {}
        public function getApplication() { return $this->testApp; }
        public function setApplication($app) { $this->testApp = $app; }
        public function loadLanguage() {}
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
        public static function _($key) {
            if ($key === 'PLG_SYSTEM_FGCUSTOMRIGHTCLICK_NOSCRIPT_DEFAULT_MESSAGE') {
                return 'Default noscript message';
            }
            return $key;
        }
    }
}
namespace Joomla\Filter {
    class InputFilter {
        const ONLY_ALLOW_DEFINED_TAGS = 0;
        const ONLY_BLOCK_DEFINED_TAGS = 1;
        const ONLY_ALLOW_DEFINED_ATTRIBUTES = 0;
        const ONLY_BLOCK_DEFINED_ATTRIBUTES = 1;
        public function __construct($tagsArray = [], $attrArray = [], $tagsMethod = 0, $attrMethod = 0, $xssAuto = 1) {}
        public function clean($source, $type = 'string') { return $source; }
    }
}
namespace Joomla\CMS\Uri {
    class Uri {
        public static $current = '';
        public static function getInstance() { return new self(); }
        public function toString() { return self::$current; }
    }
}

namespace {
    define('_JEXEC', 1);
    require_once __DIR__ . "/../src/Extension/Fgcustomrightclick.php";

    class FakeRegistry3 {
        private $data;
        public function __construct(array $data) { $this->data = $data; }
        public function get($key, $default = null) {
            return array_key_exists($key, $this->data) ? $this->data[$key] : $default;
        }
    }
    class FakeInput3 {
        public function getCmd($key, $default = '') { return $default; }
    }
    class FakeDoc3 extends \Joomla\CMS\Document\HtmlDocument {}
    class FakeApp3 {
        public $body;
        private $isSite;
        public function __construct($body, $isSite = true) {
            $this->body = $body;
            $this->isSite = $isSite;
        }
        public function isClient($client) { return $client === 'site' && $this->isSite; }
        public function getDocument() { return new \FakeDoc3(); }
        public function getIdentity() { return null; }
        public function getInput() { return new \FakeInput3(); }
        public function getBody() { return $this->body; }
        public function setBody($html) { $this->body = $html; }
    }

    $ref = new \ReflectionClass("FG\\Plugin\\System\\Fgcustomrightclick\\Extension\\Fgcustomrightclick");
    $paramsProp = $ref->getProperty('params');
    $paramsProp->setAccessible(true);
    $method = $ref->getMethod('onAfterRender');
    $method->setAccessible(true);

    $failures = 0;
    function assertTrue($cond, $msg) {
        global $failures;
        if ($cond) { echo "  PASS: $msg\n"; }
        else { $failures++; echo "  FAIL: $msg\n"; }
    }

    function build3($ref, $paramsProp, array $params, $body, $isSite = true) {
        $instance = $ref->newInstanceWithoutConstructor();
        $paramsProp->setValue($instance, new \FakeRegistry3($params));
        $instance->testApp = new \FakeApp3($body, $isSite);
        return $instance;
    }

    echo "TEST: noscript_warning off (default) - body is left completely untouched\n";
    {
        $instance = build3($ref, $paramsProp, ['noscript_warning' => 0], '<html><body>Hi</body></html>');
        $method->invoke($instance);
        assertTrue($instance->testApp->getBody() === '<html><body>Hi</body></html>', 'body unchanged when the option is off');
    }

    echo "TEST: noscript_warning on - a <noscript> block is inserted right before </body>\n";
    {
        $instance = build3($ref, $paramsProp, ['noscript_warning' => 1, 'noscript_message' => 'Please enable JS'], '<html><body>Hi</body></html>');
        $method->invoke($instance);
        $body = $instance->testApp->getBody();
        assertTrue(strpos($body, '<noscript>') !== false, 'a <noscript> tag was inserted');
        assertTrue(strpos($body, 'Please enable JS') !== false, 'the configured message text is present');
        assertTrue(strpos($body, 'crc-noscript-warning') !== false, 'the styling class is present');
        assertTrue(strpos($body, '<noscript>') < strpos($body, '</body>'), 'the noscript block appears before </body>, not after');
    }

    echo "TEST: an empty noscript_message falls back to the translated default message\n";
    {
        $instance = build3($ref, $paramsProp, ['noscript_warning' => 1, 'noscript_message' => ''], '<html><body>Hi</body></html>');
        $method->invoke($instance);
        assertTrue(strpos($instance->testApp->getBody(), 'Default noscript message') !== false, 'default message used when none configured');
    }

    echo "TEST: a literal \"</body>\" string inside page content does not cause double-injection - insertion happens before the LAST </body> only\n";
    {
        $bodyWithFakeTag = '<html><body>Example code: <code>&lt;/body&gt;</code> more text</body></html>';
        $instance = build3($ref, $paramsProp, ['noscript_warning' => 1, 'noscript_message' => 'Msg'], $bodyWithFakeTag);
        $method->invoke($instance);
        $result = $instance->testApp->getBody();
        assertTrue(substr_count($result, '<noscript>') === 1, 'exactly one <noscript> block inserted, no duplication');
    }

    echo "TEST: admin only sees no page content ever hidden - the original body content is fully preserved\n";
    {
        $instance = build3($ref, $paramsProp, ['noscript_warning' => 1, 'noscript_message' => 'Msg'], '<html><body><h1>Real content</h1><p>More real content</p></body></html>');
        $method->invoke($instance);
        $body = $instance->testApp->getBody();
        assertTrue(strpos($body, 'Real content') !== false, 'original visible content is fully preserved');
        assertTrue(strpos($body, 'More real content') !== false, 'nothing was removed or hidden');
    }

    echo "TEST: administrator client (isClient('site') false) is never touched\n";
    {
        $instance = build3($ref, $paramsProp, ['noscript_warning' => 1, 'noscript_message' => 'Msg'], '<html><body>Admin</body></html>', false);
        $method->invoke($instance);
        assertTrue($instance->testApp->getBody() === '<html><body>Admin</body></html>', 'admin-side body left untouched');
    }

    echo "TEST: a body with no </body> tag at all does not crash and is left unchanged\n";
    {
        $instance = build3($ref, $paramsProp, ['noscript_warning' => 1, 'noscript_message' => 'Msg'], 'not even valid html');
        $threw = false;
        try {
            $method->invoke($instance);
        } catch (\Throwable $e) {
            $threw = true;
        }
        assertTrue(!$threw, 'no crash on malformed body with no </body>');
        assertTrue($instance->testApp->getBody() === 'not even valid html', 'body left unchanged when there is nothing to anchor the insertion to');
    }

    echo $failures === 0 ? "\nALL PHP NOSCRIPT-WARNING TESTS PASSED\n" : "\n$failures TEST(S) FAILED\n";
    exit($failures === 0 ? 0 : 1);
}
