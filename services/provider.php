<?php

/**
 * @package     plg_system_fgcustomrightclick
 * @copyright   (C) 2026 Fero
 * @license     GNU General Public License version 2 or later
 */

\defined('_JEXEC') or die;

use FG\Plugin\System\Fgcustomrightclick\Extension\Fgcustomrightclick;
use Joomla\CMS\Extension\PluginInterface;
use Joomla\CMS\Factory;
use Joomla\CMS\Plugin\PluginHelper;
use Joomla\DI\Container;
use Joomla\DI\ServiceProviderInterface;
use Joomla\Event\DispatcherInterface;

return new class () implements ServiceProviderInterface {
    public function register(Container $container): void
    {
        $container->set(
            PluginInterface::class,
            function (Container $container) {
                $plugin = new Fgcustomrightclick(
                    $container->get(DispatcherInterface::class),
                    (array) PluginHelper::getPlugin('system', 'fgcustomrightclick')
                );
                $plugin->setApplication(Factory::getApplication());

                return $plugin;
            }
        );
    }
};
