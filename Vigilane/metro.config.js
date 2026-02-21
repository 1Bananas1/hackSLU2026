const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .tflite model files as static assets so that
// require('../assets/models/best.tflite') works at runtime.
config.resolver.assetExts.push('tflite');

// ---------------------------------------------------------------------------
// Web stubs for native-only packages.
//
// Expo Router's require.context eagerly processes ALL route files for the web
// bundle, including camera.tsx, which imports native-only packages that have
// no browser implementation (react-native-fast-tflite requires a JSI native
// module, react-native-vision-camera requires camera hardware APIs, etc.).
//
// Metro's resolveRequest hook intercepts every module lookup. When the build
// target is 'web', we redirect these packages to lightweight stub files that
// export the same API surface as no-ops. The actual camera screen on web uses
// app/(tabs)/camera.web.tsx (which shows a "not available" message) and the
// hook uses hooks/use-road-damage-detector.web.ts (which is a no-op), but the
// stubs below are the safety net that prevents the bundler from choking on the
// native entry points regardless of how Expo Router discovers the files.
// ---------------------------------------------------------------------------
const WEB_STUBS = {
  'react-native-fast-tflite': path.resolve(__dirname, 'web-stubs/react-native-fast-tflite.js'),
  'react-native-vision-camera': path.resolve(__dirname, 'web-stubs/react-native-vision-camera.js'),
  'vision-camera-resize-plugin': path.resolve(__dirname, 'web-stubs/vision-camera-resize-plugin.js'),
  'react-native-worklets-core': path.resolve(__dirname, 'web-stubs/react-native-worklets-core.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && Object.prototype.hasOwnProperty.call(WEB_STUBS, moduleName)) {
    return { filePath: WEB_STUBS[moduleName], type: 'sourceFile' };
  }
  // Fall back to Metro's default resolver for everything else.
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
