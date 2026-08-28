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

namespace {
    define('_JEXEC', 1);
    require_once __DIR__ . "/../src/Extension/Fgcustomrightclick.php";

    $ref = new \ReflectionClass("FG\\Plugin\\System\\Fgcustomrightclick\\Extension\\Fgcustomrightclick");
    $method = $ref->getMethod("isSafeLinkValue");
    $method->setAccessible(true);
    $instance = $ref->newInstanceWithoutConstructor();

    $cases = [
        ["/lokalna-stranka", true],
        ["#sekcia", true],
        ["?query=1", true],
        ["https://example.com", true],
        ["http://example.com", true],
        ["mailto:someone@example.com", true],
        ["tel:+421900123456", true],
        ["{url}", true],
        ["javascript:alert(1)", false],
        ["JAVASCRIPT:alert(1)", false],
        ["data:text/html,<script>alert(1)</script>", false],
        ["vbscript:msgbox(1)", false],
        ["java\tscript:alert(1)", false],
        ["jav\x00ascript:alert(1)", false],
        ["  javascript:alert(1)", false],
        ["file:///etc/passwd", false],
    ];

    $fail = 0;
    foreach ($cases as [$value, $expected]) {
        $actual = $method->invoke($instance, $value);
        $status = $actual === $expected ? "PASS" : "FAIL";
        if ($actual !== $expected) { $fail++; }
        printf("  %s: %-45s expected=%s actual=%s\n", $status, json_encode($value), $expected ? "true" : "false", $actual ? "true" : "false");
    }
    echo $fail === 0 ? "\nALL PHP LINK-SCHEME TESTS PASSED\n" : "\n$fail TEST(S) FAILED\n";
    exit($fail === 0 ? 0 : 1);
}
