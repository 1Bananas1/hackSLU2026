// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v9+ uses package.json `exports` fields for its subpath modules
// (firebase/app, firebase/auth, etc.). Metro needs this flag to honour them.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
