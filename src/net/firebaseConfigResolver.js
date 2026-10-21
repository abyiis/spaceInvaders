const CONFIG_MODULE_PATH = './firebaseConfig.js';

/**
 * @param {Record<string, { firebaseConfig?: unknown }>} configModules
 * @returns {Record<string, unknown>}
 */
export function resolveFirebaseConfig(configModules) {
  const configModule = configModules[CONFIG_MODULE_PATH];
  if (!configModule) {
    throw new Error(
      'Firebase configuration is missing. Create src/net/firebaseConfig.js and export a firebaseConfig object.',
    );
  }

  if (typeof configModule.firebaseConfig !== 'object' || configModule.firebaseConfig === null) {
    throw new Error(
      'src/net/firebaseConfig.js must export a firebaseConfig object from your Firebase web app settings.',
    );
  }

  return configModule.firebaseConfig;
}
