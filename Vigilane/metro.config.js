const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .tflite model files as static assets so that
// require('../assets/models/best.tflite') works at runtime.
config.resolver.assetExts.push('tflite');

module.exports = config;
