<?php
namespace Joomla\CMS\Plugin {
    class CMSPlugin {
        public $params;
        public $testApp;
        public function __construct() {}
        public function getApplication() { return $this->testApp; }
        public function setApplication($app) { $this->testApp = $app; }
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

    class FakeRegistry2 {
        private $data;
        public function __construct(array $data) { $this->data = $data; }
        public function get($key, $default = null) {
            return array_key_exists($key, $this->data) ? $this->data[$key] : $default;
        }
    }

    $ref = new \ReflectionClass("FG\\Plugin\\System\\Fgcustomrightclick\\Extension\\Fgcustomrightclick");
    $paramsProp = $ref->getProperty('params');
    $paramsProp->setAccessible(true);
    $method = $ref->getMethod('getCustomShortcuts');
    $method->setAccessible(true);

    $failures = 0;
    function assertTrue($cond, $msg) {
        global $failures;
        if ($cond) { echo "  PASS: $msg\n"; }
        else { $failures++; echo "  FAIL: $msg\n"; }
    }

    function buildInstance($ref, $paramsProp, $customShortcutsValue) {
        $instance = $ref->newInstanceWithoutConstructor();
        $paramsProp->setValue($instance, new \FakeRegistry2(['custom_shortcuts' => $customShortcutsValue]));
        return $instance;
    }

    echo "TEST: a well-formed row is normalised correctly\n";
    {
        $instance = buildInstance($ref, $paramsProp, [
            ['modifiers' => ['ctrl', 'shift'], 'key' => 'K'],
        ]);
        $result = $method->invoke($instance);
        assertTrue(count($result) === 1, 'exactly one shortcut returned');
        assertTrue($result[0]['key'] === 'K', 'key preserved as-authored (case handled client-side)');
        assertTrue($result[0]['ctrl'] === true, 'ctrl modifier detected');
        assertTrue($result[0]['shift'] === true, 'shift modifier detected');
        assertTrue($result[0]['alt'] === false, 'alt modifier correctly false when not selected');
    }

    echo "TEST: a row with an empty key is dropped\n";
    {
        $instance = buildInstance($ref, $paramsProp, [
            ['modifiers' => ['ctrl'], 'key' => ''],
            ['modifiers' => ['ctrl'], 'key' => '   '],
        ]);
        $result = $method->invoke($instance);
        assertTrue(count($result) === 0, 'both empty/whitespace-only key rows dropped');
    }

    echo "TEST: an implausibly long key value is dropped (defensive cap)\n";
    {
        $instance = buildInstance($ref, $paramsProp, [
            ['modifiers' => [], 'key' => str_repeat('x', 21)],
            ['modifiers' => [], 'key' => str_repeat('y', 20)],
        ]);
        $result = $method->invoke($instance);
        assertTrue(count($result) === 1, 'only the 20-char key survives, the 21-char one is dropped');
        assertTrue($result[0]['key'] === str_repeat('y', 20), 'the surviving key is the correct one');
    }

    echo "TEST: unrecognised modifier values are ignored rather than causing an error\n";
    {
        $instance = buildInstance($ref, $paramsProp, [
            ['modifiers' => ['ctrl', 'meta', 'nonsense'], 'key' => 'p'],
        ]);
        $result = $method->invoke($instance);
        assertTrue(count($result) === 1, 'row still processed despite unknown modifier values');
        assertTrue($result[0]['ctrl'] === true, 'recognised modifier (ctrl) still detected');
        assertTrue($result[0]['shift'] === false && $result[0]['alt'] === false, 'unrecognised modifiers do not set anything unexpected');
    }

    echo "TEST: empty/missing custom_shortcuts param returns an empty array\n";
    {
        $instance = buildInstance($ref, $paramsProp, []);
        assertTrue($method->invoke($instance) === [], 'empty subform value returns empty array');
    }

    echo $failures === 0 ? "\nALL PHP CUSTOM-SHORTCUTS TESTS PASSED\n" : "\n$failures TEST(S) FAILED\n";
    exit($failures === 0 ? 0 : 1);
}
