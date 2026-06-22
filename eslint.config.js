import globals from 'globals';

// Lint config used mainly as a safety net during the ESM migration:
// no-undef flags any identifier (including JSX components) that isn't
// imported or a known browser global.
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
    },
  },
];
