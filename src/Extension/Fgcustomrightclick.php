<?php

/**
 * @package     plg_system_fgcustomrightclick
 * @copyright   (C) 2026 Fero
 * @license     GNU General Public License version 2 or later
 */

namespace FG\Plugin\System\Fgcustomrightclick\Extension;

use Joomla\CMS\Document\HtmlDocument;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\Event\Event;
use Joomla\Event\SubscriberInterface;
use Joomla\Filter\InputFilter;

\defined('_JEXEC') or die;

/**
 * FG Custom Right Click - system plugin
 *
 * Disables printing, text selection/copy, image dragging, developer-tools
 * keyboard shortcuts, and the browser context menu on the frontend,
 * optionally replacing the context menu with a popup message or a fully
 * custom ARIA-accessible context menu. Custom menu items are either a link
 * or one of a fixed, whitelisted set of built-in actions - there is no way
 * to enter or execute arbitrary code from the admin form. Rules apply only
 * to the configured user groups.
 *
 * @since 1.3.0
 */
final class Fgcustomrightclick extends CMSPlugin implements SubscriberInterface
{
    /**
     * Load plugin language files automatically.
     *
     * @var bool
     */
    protected $autoloadLanguage = false;

    /**
     * @return array<string, string>
     */
    public static function getSubscribedEvents(): array
    {
        return [
            'onBeforeCompileHead' => 'onBeforeCompileHead',
        ];
    }

    /**
     * Inject assets and configuration into the frontend document head.
     */
    public function onBeforeCompileHead(Event $event): void
    {
        $app = $this->getApplication();

        // Frontend only
        if (!$app->isClient('site')) {
            return;
        }

        $doc = $app->getDocument();

        // HTML documents only (skip feeds, JSON, print tmpl handled by browser anyway)
        if (!$doc instanceof HtmlDocument) {
            return;
        }

        // Apply only to selected user groups (empty selection = everyone)
        if (!$this->isUserTargeted()) {
            return;
        }

        $mode                    = (int) $this->params->get('rightclick_mode', 0);
        $disablePrint            = (int) $this->params->get('disable_print', 0);
        $disableSelect           = (int) $this->params->get('disable_select', 0);
        $disableImgDrag          = (int) $this->params->get('disable_imagedrag', 0);
        $blockDevtools           = (int) $this->params->get('block_devtools', 0);
        $protectInteractive      = (int) $this->params->get('protect_interactive', 1);
        $protectVideo            = (int) $this->params->get('protect_video', 0);
        $protectBackgroundImages = (int) $this->params->get('protect_background_images', 0);

        // Nothing to do
        if ($mode === 0 && !$disablePrint && !$disableSelect && !$disableImgDrag && !$blockDevtools) {
            return;
        }

        $options = [
            'mode'                     => $mode,
            'disablePrint'             => (bool) $disablePrint,
            'disableSelect'            => (bool) $disableSelect,
            'disableImageDrag'         => (bool) $disableImgDrag,
            'blockDevtools'            => (bool) $blockDevtools,
            'protectInteractive'       => (bool) $protectInteractive,
            'protectVideo'             => (bool) $protectVideo,
            'protectBackgroundImages'  => (bool) $protectBackgroundImages,
        ];

        // The popup, the custom menu, and the print-block message all
        // render translated strings that were previously hard-coded in
        // English on the frontend; load our own language file once here
        // so Text::_() below is translated.
        if ($mode === 1 || $mode === 3 || $disablePrint) {
            $this->loadLanguage();
        }

        if ($disablePrint) {
            $options['printDisabledMessage'] = Text::_('PLG_SYSTEM_FGCUSTOMRIGHTCLICK_PRINT_DISABLED_MESSAGE');
        }

        if ($mode === 1) {
            $options['popup'] = [
                'enabled' => (bool) ((int) $this->params->get('popup_enabled', 1)),
                'title'   => (string) $this->params->get('popup_title', ''),
                'message' => $this->sanitizePopupMessage((string) $this->params->get('popup_message', '')),
                'timeout' => (int) $this->params->get('popup_timeout', 0),
            ];
            $options['closeLabel'] = Text::_('PLG_SYSTEM_FGCUSTOMRIGHTCLICK_POPUP_CLOSE_LABEL');
        }

        if ($mode === 3) {
            $options['menuItems'] = $this->getMenuItems();
            $options['menuLabel'] = Text::_('PLG_SYSTEM_FGCUSTOMRIGHTCLICK_MENU_ARIA_LABEL');
        }

        $wa = $doc->getWebAssetManager();

        $wa->registerAndUseStyle(
            'plg_system_fgcustomrightclick.main',
            'plg_system_fgcustomrightclick/fgcustomrightclick.css',
            ['version' => 'auto']
        );

        $wa->registerAndUseScript(
            'plg_system_fgcustomrightclick.main',
            'plg_system_fgcustomrightclick/fgcustomrightclick.js',
            ['version' => 'auto'],
            ['defer' => true],
            ['core']
        );

        $doc->addScriptOptions('plg_system_fgcustomrightclick', $options);
    }

    /**
     * Check whether the current user belongs to one of the targeted groups.
     */
    private function isUserTargeted(): bool
    {
        $selected = (array) $this->params->get('usergroups', []);
        $selected = array_filter(array_map('intval', $selected));

        // No groups selected => apply to everyone
        if (!$selected) {
            return true;
        }

        $user = $this->getApplication()->getIdentity();

        if ($user === null) {
            return \in_array(1, $selected, true); // Public
        }

        return (bool) array_intersect($selected, array_map('intval', $user->getAuthorisedGroups()));
    }

    /**
     * Whitelist of URL schemes a 'link' menu item may use. Kept in sync
     * with ALLOWED_LINK_SCHEMES in fgcustomrightclick.js.
     */
    private const ALLOWED_LINK_SCHEMES = ['http', 'https', 'mailto', 'tel'];

    /**
     * True if $value is safe to assign to window.location.href / pass to
     * window.open() on the frontend: either a scheme-less value (relative
     * path, #anchor, ?query - always safe) or an explicit scheme from the
     * whitelist above. Rejects javascript:, data:, vbscript:, and any
     * other scheme.
     *
     * Control characters and leading whitespace are stripped before the
     * scheme check, since browsers ignore them when parsing a URL scheme
     * and a naive check without this step is bypassable with e.g. a tab
     * character inside "java\tscript:".
     */
    private function isSafeLinkValue(string $value): bool
    {
        $normalised = preg_replace('/[\x00-\x1F\x7F]/', '', $value);
        $normalised = ltrim((string) $normalised);

        if (preg_match('/^([a-zA-Z][a-zA-Z0-9+.\-]*):/', $normalised, $matches)) {
            return \in_array(strtolower($matches[1]), self::ALLOWED_LINK_SCHEMES, true);
        }

        return true;
    }

    /**
     * Server-side counterpart to the JS-side sanitizeHtml() allowlist. Runs
     * on the raw admin-authored popup message before it ever reaches
     * addScriptOptions(), so the persisted/transmitted value is already
     * reasonably clean even before the frontend script (which still runs
     * its own, second pass) touches it - defense-in-depth against a
     * compromised admin account, matching the same reasoning already
     * applied to the custom-menu link-scheme whitelist.
     *
     * Deliberately calls Joomla\Filter\InputFilter directly with our own
     * fixed tag/attribute list, rather than using filter="safehtml" on the
     * form field: that ties the field to Joomla's own built-in "safehtml"
     * tag list, which is broader than - and independent of - the exact
     * allowlist used here and in fgcustomrightclick.js. Calling InputFilter
     * ourselves keeps both layers using the identical set.
     */
    private function sanitizePopupMessage(string $html): string
    {
        if (trim($html) === '') {
            return '';
        }

        $filter = InputFilter::getInstance(
            ['a', 'strong', 'em', 'b', 'i', 'br', 'p', 'span', 'ul', 'ol', 'li'],
            ['href', 'title', 'target'],
            1,
            1
        );

        $clean = $filter->clean($html, 'html');

        // InputFilter's own xssAuto pass already strips common dangerous
        // URL schemes from attribute values, but re-check every <a href>
        // against the same allowlist used for custom-menu links
        // (isSafeLinkValue) so both layers agree on exactly what "safe"
        // means - including consistently allowing relative/anchor hrefs,
        // which a plain scheme-allowlist regex would otherwise reject.
        if (stripos($clean, '<a') !== false && \class_exists(\DOMDocument::class)) {
            $dom = new \DOMDocument();
            $prevErrorSetting = libxml_use_internal_errors(true);
            $dom->loadHTML(
                '<?xml encoding="utf-8"?><div>' . $clean . '</div>',
                \LIBXML_NOERROR | \LIBXML_NOWARNING
            );
            libxml_clear_errors();
            libxml_use_internal_errors($prevErrorSetting);

            foreach ($dom->getElementsByTagName('a') as $anchor) {
                $href = $anchor->getAttribute('href');

                if ($href !== '' && !$this->isSafeLinkValue($href)) {
                    $anchor->removeAttribute('href');
                }
            }

            $wrapper = $dom->getElementsByTagName('div')->item(0);
            $rebuilt = '';

            if ($wrapper !== null) {
                foreach ($wrapper->childNodes as $child) {
                    $rebuilt .= $dom->saveHTML($child);
                }

                $clean = $rebuilt;
            }
        }

        return $clean;
    }

    /**
     * Whitelist of custom-menu actions the frontend script is allowed to run.
     * Kept in sync with the ACTIONS map in fgcustomrightclick.js.
     */
    private const ALLOWED_ACTIONS = ['reload', 'copy_url', 'print', 'scroll_top', 'share'];

    /**
     * Normalise the subform menu items into a clean array for JS.
     *
     * No arbitrary code from the admin form ever reaches the frontend:
     * 'link' items carry a URL, 'action' items carry one of a fixed set of
     * whitelisted action keys that the frontend script maps to predefined
     * behaviour. There is no 'js'/eval item type.
     *
     * @return array<int, array<string, mixed>>
     */
    private function getMenuItems(): array
    {
        $raw   = json_decode(json_encode($this->params->get('menuitems', [])), true) ?: [];
        $items = [];

        foreach ($raw as $row) {
            $row  = (array) $row;
            $type = (string) ($row['type'] ?? 'link');

            if ($type === 'separator') {
                $items[] = ['type' => 'separator'];
                continue;
            }

            $label = trim((string) ($row['label'] ?? ''));

            if ($label === '') {
                continue;
            }

            if ($type === 'action') {
                $action = (string) ($row['action'] ?? '');

                if (!\in_array($action, self::ALLOWED_ACTIONS, true)) {
                    continue;
                }

                $items[] = [
                    'type'   => 'action',
                    'label'  => $label,
                    'icon'   => trim((string) ($row['icon'] ?? '')),
                    'action' => $action,
                ];
                continue;
            }

            // 'link' (default/fallback for legacy rows)
            $value = trim((string) ($row['value'] ?? ''));

            if ($value === '' || !$this->isSafeLinkValue($value)) {
                continue;
            }

            $items[] = [
                'type'   => 'link',
                'label'  => $label,
                'icon'   => trim((string) ($row['icon'] ?? '')),
                'value'  => $value,
                'newtab' => (bool) ((int) ($row['newtab'] ?? 0)),
            ];
        }

        return $items;
    }
}
