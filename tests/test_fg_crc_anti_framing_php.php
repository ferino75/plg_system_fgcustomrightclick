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
        public static function _($key) { return $key; }
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

    class FakeRegistry4 {
        private $data;
        public function __construct(array $data) { $this->data = $data; }
        public function get($key, $default = null) {
            return array_key_exists($key, $this->data) ? $this->data[$key] : $default;
        }
    }
    class FakeInput4 {
        public function getCmd($key, $default = '') { return $default; }
    }
    class FakeDoc4 extends \Joomla\CMS\Document\HtmlDocument {}
    class FakeApp4 {
        public $headers = [];
        public $body = '<html><body></body></html>';
        public function isClient($client) { return $client === 'site'; }
        public function getDocument() { return new \FakeDoc4(); }
        public function getIdentity() { return null; }
        public function getInput() { return new \FakeInput4(); }
        public function getBody() { return $this->body; }
        public function setBody($html) { $this->body = $html; }
        public function setHeader($name, $value, $replace = false) {
            $this->headers[] = ['name' => $name, 'value' => $value, 'replace' => $replace];
        }
    }

    $ref = new \ReflectionClass("FG\\Plugin\\System\\Fgcustomrightclick\\Extension\\Fgcustomrightclick");
    $paramsProp = $ref->getProperty('params');
    $paramsProp->setAccessible(true);
    $method = $ref->getMethod('onBeforeCompileHead');
    $method->setAccessible(true);

    $failures = 0;
    function assertTrue($cond, $msg) {
        global $failures;
        if ($cond) { echo "  PASS: $msg\n"; }
        else { $failures++; echo "  FAIL: $msg\n"; }
    }

    function build4($ref, $paramsProp, array $params) {
        $instance = $ref->newInstanceWithoutConstructor();
        $paramsProp->setValue($instance, new \FakeRegistry4($params));
        $instance->testApp = new \FakeApp4();
        return $instance;
    }

    echo "TEST: anti_framing=1 sends X-Frame-Options: SAMEORIGIN, even with mode=0 and nothing else enabled\n";
    {
        $instance = build4($ref, $paramsProp, [
            'anti_framing' => 1,
            'rightclick_mode' => 0,
        ]);
        $method->invoke($instance, new \Joomla\Event\Event());
        $headers = $instance->testApp->headers;
        $match = null;
        foreach ($headers as $h) {
            if ($h['name'] === 'X-Frame-Options') { $match = $h; }
        }
        assertTrue($match !== null, 'X-Frame-Options header was sent');
        assertTrue($match && $match['value'] === 'SAMEORIGIN', 'header value is SAMEORIGIN (got: ' . ($match['value'] ?? 'null') . ')');
        assertTrue($match && $match['replace'] === true, 'sent with replace=true, so it cannot silently duplicate on repeated calls');
    }

    echo "TEST: anti_framing=0 (default) never sends the header\n";
    {
        $instance = build4($ref, $paramsProp, [
            'anti_framing' => 0,
            'rightclick_mode' => 0,
        ]);
        $method->invoke($instance, new \Joomla\Event\Event());
        $headers = $instance->testApp->headers;
        $hasHeader = false;
        foreach ($headers as $h) {
            if ($h['name'] === 'X-Frame-Options') { $hasHeader = true; }
        }
        assertTrue(!$hasHeader, 'no X-Frame-Options header sent when the option is off');
    }

    echo "TEST: no separate Content-Security-Policy header is ever sent by this plugin (avoids clobbering another plugin's CSP)\n";
    {
        $instance = build4($ref, $paramsProp, [
            'anti_framing' => 1,
            'rightclick_mode' => 0,
        ]);
        $method->invoke($instance, new \Joomla\Event\Event());
        $headers = $instance->testApp->headers;
        $hasCsp = false;
        foreach ($headers as $h) {
            if (stripos($h['name'], 'Content-Security-Policy') !== false) { $hasCsp = true; }
        }
        assertTrue(!$hasCsp, 'no Content-Security-Policy header sent - X-Frame-Options only, by design');
    }

    echo "TEST: anti_framing respects the same exclusion guards as everything else (component exclusion)\n";
    {
        $instance = build4($ref, $paramsProp, [
            'anti_framing' => 1,
            'rightclick_mode' => 0,
            'exclude_components' => 'com_content',
        ]);
        // FakeInput4::getCmd always returns the default ('' here), which
        // won't match 'com_content', so this specific instance is NOT
        // excluded - included mainly to confirm the guard doesn't crash
        // when exclude_components is configured alongside anti_framing.
        $threw = false;
        try {
            $method->invoke($instance, new \Joomla\Event\Event());
        } catch (\Throwable $e) {
            $threw = true;
        }
        assertTrue(!$threw, 'no crash when both anti_framing and exclude_components are configured together');
    }

    echo $failures === 0 ? "\nALL PHP ANTI-FRAMING TESTS PASSED\n" : "\n$failures TEST(S) FAILED\n";
    exit($failures === 0 ? 0 : 1);
}
