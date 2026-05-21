import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
  // PrimeNG "sapphire" template boilerplate — demo pages and widgets shipped
  // with the theme. We keep them routable for reference but don't enforce
  // our stricter rules on vendor template code.
  {
    files: [
      '**/src/app/pages/uikit/**/*.ts',
      '**/src/app/pages/landing/**/*.ts',
      '**/src/app/pages/dashboard/components/**/*.ts',
      '**/src/app/pages/crud/**/*.ts',
      '**/src/app/pages/service/**/*.ts',
      '**/src/app/layout/component/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@angular-eslint/prefer-inject': 'off',
      '@angular-eslint/use-lifecycle-interface': 'off',
    },
  },
  {
    files: [
      '**/src/app/pages/uikit/**',
      '**/src/app/pages/landing/**',
      '**/src/app/pages/dashboard/components/**',
      '**/src/app/pages/crud/**',
      '**/src/app/layout/component/**',
    ],
    rules: {
      '@angular-eslint/component-selector': 'off',
      '@angular-eslint/template/prefer-control-flow': 'off',
      '@angular-eslint/template/elements-content': 'off',
      '@angular-eslint/template/alt-text': 'off',
      '@angular-eslint/template/label-has-associated-control': 'off',
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/interactive-supports-focus': 'off',
    },
  },
];
