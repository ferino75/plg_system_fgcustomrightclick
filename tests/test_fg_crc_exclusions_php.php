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
        public static function getInstance() {
            return new self();
        }
        public function toString() {
            return self::$current;
        }
    }
}

namespace {
    define('_JEXEC', 1);
    require_once __DIR__ . "/../src/Extension/Fgcustomrightclick.php";

    // Minimal stand-ins for the Joomla Registry (params) and the
    // application/input objects the exclusion methods read from.
    class FakeRegistry {
        private $data;
        public function __construct(array $data) { $this->data = $data; }
        public function get($key, $default = null) {
            return array_key_exists($key, $this->data) ? $this->data[$key] : $default;
        }
    }
    class FakeInput {
        private $option;
        public function __construct($option) { $this->option = $option; }
        public function getCmd($key, $default = '') {
            return $key === 'option' ? $this->option : $default;
        }
    }
    class FakeApplication {
        private $input;
        public function __construct($option) { $this->input = new FakeInput($option); }
        public function getInput() { return $this->input; }
    }

    $ref = new \ReflectionClass("FG\\Plugin\\System\\Fgcustomrightclick\\Extension\\Fgcustomrightclick");
    $paramsProp = $ref->getProperty('params');
    $paramsProp->setAccessible(true);

    $failures = 0;
    function assertTrue($cond, $msg) {
        global $failures;
        if ($cond) { echo "  PASS: $msg\n"; }
        else { $failures++; echo "  FAIL: $msg\n"; }
    }

    function build($ref, $paramsProp, array $params, $option) {
        $instance = $ref->newInstanceWithoutConstructor();
        $paramsProp->setValue($instance, new \FakeRegistry($params));
        $instance->testApp = new \FakeApplication($option);
        return $instance;
    }

    $mIsComponentExcluded = $ref->getMethod('isComponentExcluded');
    $mIsComponentExcluded->setAccessible(true);
    $mIsUrlExcluded = $ref->getMethod('isUrlExcluded');
    $mIsUrlExcluded->setAccessible(true);

    echo "TEST: component exclusion matches configured component names, case-insensitively\n";
    {
        $instance = build($ref, $paramsProp, ['exclude_components' => "com_contact\ncom_users"], 'com_contact');
        assertTrue($mIsComponentExcluded->invoke($instance) === true, 'com_contact is excluded when listed');

        $instance2 = build($ref, $paramsProp, ['exclude_components' => "COM_CONTACT"], 'com_contact');
        assertTrue($mIsComponentExcluded->invoke($instance2) === true, 'matching is case-insensitive');

        $instance3 = build($ref, $paramsProp, ['exclude_components' => "com_contact"], 'com_content');
        assertTrue($mIsComponentExcluded->invoke($instance3) === false, 'com_content is NOT excluded when only com_contact is listed');
    }

    echo "TEST: empty exclude_components means nothing is excluded\n";
    {
        $instance = build($ref, $paramsProp, ['exclude_components' => ''], 'com_content');
        assertTrue($mIsComponentExcluded->invoke($instance) === false, 'empty list excludes nothing');

        $instance2 = build($ref, $paramsProp, [], 'com_content');
        assertTrue($mIsComponentExcluded->invoke($instance2) === false, 'missing param (default) excludes nothing');
    }

    echo "TEST: URL exclusion is a case-insensitive substring match against the current URL\n";
    {
        \Joomla\CMS\Uri\Uri::$current = 'https://example.com/contact-us?view=form';
        $instance = build($ref, $paramsProp, ['exclude_urls' => "/contact-us"], 'com_contact');
        assertTrue($mIsUrlExcluded->invoke($instance) === true, 'matching substring excludes the URL');

        $instance2 = build($ref, $paramsProp, ['exclude_urls' => "/CONTACT-US"], 'com_contact');
        assertTrue($mIsUrlExcluded->invoke($instance2) === true, 'matching is case-insensitive');

        $instance3 = build($ref, $paramsProp, ['exclude_urls' => "/some-other-page"], 'com_contact');
        assertTrue($mIsUrlExcluded->invoke($instance3) === false, 'non-matching pattern does not exclude');
    }

    echo "TEST: multiple exclude_urls lines are each checked independently\n";
    {
        \Joomla\CMS\Uri\Uri::$current = 'https://example.com/checkout/step-2';
        $instance = build($ref, $paramsProp, ['exclude_urls' => "/basket\n/checkout\n/account"], 'com_content');
        assertTrue($mIsUrlExcluded->invoke($instance) === true, 'matches the second of three listed patterns');
    }

    echo "TEST: blank lines and surrounding whitespace in the textarea are ignored\n";
    {
        \Joomla\CMS\Uri\Uri::$current = 'https://example.com/contact-us';
        $instance = build($ref, $paramsProp, ['exclude_urls' => "\n  /contact-us  \n\n"], 'com_content');
        assertTrue($mIsUrlExcluded->invoke($instance) === true, 'whitespace-padded pattern still matches after trimming');
    }

    echo $failures === 0 ? "\nALL PHP EXCLUSION TESTS PASSED\n" : "\n$failures TEST(S) FAILED\n";
    exit($failures === 0 ? 0 : 1);
}
