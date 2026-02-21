module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for react-native-vision-camera frame processor worklets.
      // Must come before react-native-reanimated/plugin.
      'react-native-worklets-core/plugin',
      // Must be listed last.
      'react-native-reanimated/plugin',
    ],
  };
};
