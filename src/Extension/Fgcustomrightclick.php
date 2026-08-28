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
 * custom ARIA-accessible context menu. Rules apply only to the configured
 * user groups.
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
     * Normalise the subform menu items into a clean array for JS.
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
            $value = trim((string) ($row['value'] ?? ''));

            if ($label === '' || $value === '') {
                continue;
            }

            $items[] = [
                'type'   => $type === 'js' ? 'js' : 'link',
                'label'  => $label,
                'icon'   => trim((string) ($row['icon'] ?? '')),
                'value'  => $value,
                'newtab' => (bool) ((int) ($row['newtab'] ?? 0)),
            ];
        }

        return $items;
    }
}
