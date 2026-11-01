const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const stylistic = require('@stylistic/eslint-plugin');
const eslintConfigPrettier = require('eslint-config-prettier');
const jestPlugin = require('eslint-plugin-jest');
const globals = require('globals');

// Code-quality rules shared by every file (TypeScript and plain JS).
const qualityRules = {
  'prefer-const': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always'],
  'no-throw-literal': 'error',
  'prefer-template': 'error',
  'no-duplicate-imports': 'error',
  'object-shorthand': 'error',
  'no-else-return': ['error', { allowElseIf: false }],
  'no-useless-return': 'error',
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
};

// Layout rules Prettier doesn't handle. They come after eslint-config-prettier,
// which would otherwise switch `curly` off. All of them are fixed by
// `npm run format` / `eslint --fix`.
const layoutRules = {
  // Every if/else/for/while body gets braces, even one-liners.
  curly: ['error', 'all'],
  // Blank line after a block, after declarations, and before `return`.
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    { blankLine: 'always', prev: '*', next: 'return' },
    { blankLine: 'always', prev: 'directive', next: '*' },
  ],
  '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
};

module.exports = [
  {
    ignores: ['dist/**', 'dist-firefox/**', 'node_modules/**', 'coverage/**'],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Extension sources (content script + service worker)
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      ...qualityRules,
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Unit tests and benchmarks (jsdom)
  {
    files: ['tests/**/*.ts'],
    ...jestPlugin.configs['flat/recommended'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, ...globals.node, ...globals.jest },
    },
    rules: {
      ...jestPlugin.configs['flat/recommended'].rules,
      ...qualityRules,
    },
  },

  {
    // Benchmarks report timings instead of asserting
    files: ['tests/bench/**/*.ts'],
    rules: { 'jest/expect-expect': 'off', 'no-console': 'off' },
  },

  // Plain-script extension pages
  {
    files: ['popup.js', 'options.js', 'ui-common.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        // Defined by ui-common.js, loaded before the other pages
        api: 'readonly',
        isPromiseApi: 'readonly',
        normalizeDomain: 'readonly',
        themePreference: 'readonly',
        effectiveTheme: 'readonly',
        applyTheme: 'readonly',
      },
    },
    rules: { ...qualityRules, 'no-console': 'warn' },
  },
  {
    // Its top-level bindings are consumed by the other pages
    files: ['ui-common.js'],
    rules: { '@typescript-eslint/no-unused-vars': 'off', 'no-redeclare': 'off' },
  },

  // Node scripts and config files
  {
    files: ['scripts/**/*.js', '*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: qualityRules,
  },
  {
    files: ['**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Prettier switches off formatting rules that fight it...
  eslintConfigPrettier,

  // ...then the layout rules it can't express are switched back on.
  {
    files: ['**/*.ts', '**/*.js'],
    plugins: { '@stylistic': stylistic },
    rules: layoutRules,
  },
];
