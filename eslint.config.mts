import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';  
import pluginImport from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';  
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
      'node_modules/',
      'generated/',
      '.build/',
      '*.json',
      '*.md',
      '.vscode/',
  ]),
  {
    files: [
      'src/**/*.{js,mjs,cjs,ts,mts,cts}',
      'tests/**/*.{js,mjs,cjs,ts,mts,cts}'
    ],
    plugins: {
      js,
      import: pluginImport,
      prettier,  
    },
    extends: ['js/recommended'],
    languageOptions: {
      globals: globals.node,  
      parserOptions: {
        sourceType: 'module'  
      }
    },
    settings: {
      'import/internal-regex': '^@/',
      'import/external-module-folders': ['node_modules', 'packages'],
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
            'unknown',
          ],
          pathGroups: [
            {
              pattern: '^(fs|path|os|crypto|http|https|url|util)$',
              group: 'builtin',
            },
            {
              pattern: '^[a-zA-Z]',
              group: 'external',
            },
            {
              pattern: '^@',
              group: 'internal',
            },
            {
              pattern: '^[./]',
              group: 'parent',
            },
          ],
          pathGroupsExcludedImportTypes: ['type'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'no-console': 'warn',
      'prettier/prettier': 'error',  
    },
  },
  {
    files: ['src/utils/system-logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);