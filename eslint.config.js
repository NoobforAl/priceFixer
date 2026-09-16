const tseslint = require('typescript-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');
const jestPlugin = require('eslint-plugin-jest');

module.exports = [
  // Ignore patterns
  {
    ignores: ['dist/**', 'dist-firefox/**', 'node_modules/**', 'coverage/**'],
  },

  // Base config for all TS files
  ...tseslint.configs.recommended,

  // Source files
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Node: 'readonly',
        MutationObserver: 'readonly',
        console: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        setTimeout: 'readonly',
        Map: 'readonly',
        WeakRef: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-console': 'warn',
      eqeqeq: ['warn', 'always'],
      curly: ['warn', 'all'],
      'no-throw-literal': 'warn',
      'prefer-template': 'warn',
      'no-duplicate-imports': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Test files
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    ...jestPlugin.configs['flat/recommended'],
    rules: {
      'no-console': 'off',
    },
  },

  // Plain-script extension pages (popup.js, options.js, ui-common.js): same
  // style rules as the TypeScript sources
  {
    files: ['popup.js', 'options.js', 'ui-common.js'],
    languageOptions: {
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
        document: 'readonly',
        window: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Map: 'readonly',
        // ui-common.js globals
        api: 'readonly',
        isPromiseApi: 'readonly',
        normalizeDomain: 'readonly',
        themePreference: 'readonly',
        effectiveTheme: 'readonly',
        applyTheme: 'readonly',
        localStorage: 'readonly',
        CustomEvent: 'readonly',
        IntersectionObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        Set: 'readonly',
      },
    },
    rules: {
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-console': 'warn',
      eqeqeq: ['warn', 'always'],
      curly: ['warn', 'all'],
      'no-throw-literal': 'warn',
      'prefer-template': 'warn',
      'no-duplicate-imports': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Its top-level bindings are consumed by the other pages
    files: ['ui-common.js'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },

  // Node scripts and configs
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Prettier must be last to override formatting rules
  eslintConfigPrettier,
];
