<?php

/**
 * @package     plg_system_fgcustomrightclick
 * @copyright   (C) 2026 Fero
 * @license     GNU General Public License version 2 or later
 */

namespace FG\Plugin\System\Fgcustomrightclick\Extension;

use Joomla\CMS\Document\HtmlDocument;
use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\Event\Event;
use Joomla\Event\SubscriberInterface;

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

        $mode            = (int) $this->params->get('rightclick_mode', 0);
        $disablePrint    = (int) $this->params->get('disable_print', 0);
        $disableSelect   = (int) $this->params->get('disable_select', 0);
        $disableImgDrag  = (int) $this->params->get('disable_imagedrag', 0);
        $blockDevtools   = (int) $this->params->get('block_devtools', 0);

        // Nothing to do
        if ($mode === 0 && !$disablePrint && !$disableSelect && !$disableImgDrag && !$blockDevtools) {
            return;
        }

        $options = [
            'mode'             => $mode,
            'disablePrint'     => (bool) $disablePrint,
            'disableSelect'    => (bool) $disableSelect,
            'disableImageDrag' => (bool) $disableImgDrag,
            'blockDevtools'    => (bool) $blockDevtools,
        ];

        if ($mode === 1) {
            $options['popup'] = [
                'enabled' => (bool) ((int) $this->params->get('popup_enabled', 1)),
                'title'   => (string) $this->params->get('popup_title', ''),
                'message' => (string) $this->params->get('popup_message', ''),
                'timeout' => (int) $this->params->get('popup_timeout', 0),
            ];
        }

        if ($mode === 3) {
            $options['menuItems'] = $this->getMenuItems();
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
