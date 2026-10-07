'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'out/**', 'test-results/**', '.test-tmp/**', 'assets/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-useless-assignment': 'off', // defaults set before try/catch read clearer here
    },
  },
  {
    // Pages and browser UI run in sandboxed renderers.
    files: ['src/renderer/**/*.js', 'src/pages/**/*.js', 'test/fixtures/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, chrome: 'readonly', module: 'writable' } },
  },
  {
    // Playwright callbacks run inside pages.
    files: ['test/e2e/**/*.js', 'scripts/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/preload/**/*.js', 'src/shared/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
