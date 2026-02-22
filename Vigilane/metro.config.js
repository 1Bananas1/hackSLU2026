const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .tflite model files as static assets.
config.resolver.assetExts.push('tflite');

// Firebase / modern package export maps support.
// This prevents subtle runtime failures with subpath imports depending on versions.
config.resolver.unstable_enablePackageExports = true;

// react-native-fast-tflite v1.6.1 has a bug in its commonjs build:
// lib/commonjs/TensorflowModule.js uses '../spec/NativeRNTflite' which resolves
// to lib/spec/ (doesn't exist) instead of the package root spec/ directory.
const tfliteRoot = path.dirname(require.resolve('react-native-fast-tflite/package.json'));
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === '../spec/NativeRNTflite' &&
    context.originModulePath.includes('react-native-fast-tflite')
  ) {
    return {
      filePath: path.join(tfliteRoot, 'spec', 'NativeRNTflite.ts'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
