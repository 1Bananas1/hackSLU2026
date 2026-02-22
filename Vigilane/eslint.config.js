// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // eslint-import-resolver-typescript v3 uses interfaceVersion:3 which is
      // incompatible with eslint-plugin-import v2 in this ESLint v9 flat-config
      // environment, causing false-positive "Resolve error" for every file.
      // TypeScript tsc catches actual unresolved imports at compile time.
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
      'import/named': 'off',
    },
  },
]);
