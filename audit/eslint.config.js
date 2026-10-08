// Phase 2, item 5: ESLint over the app's own code (src/, tools/, sw.js), run from the repository root:
//   audit/node_modules/.bin/eslint -c audit/eslint.config.js src tools sw.js
// Recommended JavaScript rules, eslint-plugin-no-unsanitized (HTML sinks), and eslint-plugin-security.
import js from '@eslint/js';
import globals from 'globals';
import nounsanitized from 'eslint-plugin-no-unsanitized';
import security from 'eslint-plugin-security';

export default [
  { ignores: ['**/node_modules/**', 'dist/**', 'audit/**', 'tools/usda/**', 'tools/open-recipes/**', 'tools/usda-recipes/**'] },
  js.configs.recommended,
  nounsanitized.configs.recommended,
  security.configs.recommended,
  {
    files: ['src/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.serviceworker } }
  },
  {
    files: ['tools/**/*.mjs', 'tools/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } }
  },
  {
    files: ['tools/**/*.cjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } }
  },
  { rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] } }
];
