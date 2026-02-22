const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .tflite model files as static assets.
config.resolver.assetExts.push('tflite');

// Firebase / modern package export maps support.
// This prevents subtle runtime failures with subpath imports depending on versions.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;