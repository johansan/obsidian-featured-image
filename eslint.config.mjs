import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**', 'main.js', '*.min.js']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...obsidianmd.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node
            },
            parserOptions: {
                project: './tsconfig.json'
            }
        },
        plugins: {
            obsidianmd: obsidianmd
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            'no-console': 'off',
            'no-debugger': 'error',
            'prefer-const': 'error',
            'no-var': 'error',
            // Upgrade obsidianmd rules from warn to error
            'obsidianmd/prefer-file-manager-trash-file': 'error',
            // Allow Node.js modules in Obsidian plugins (Electron environment)
            'import/no-nodejs-modules': 'off',

            // Type assertions
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            '@typescript-eslint/prefer-as-const': 'warn',

            // Code style
            eqeqeq: ['error', 'always'], // Require === and !== instead of == and !=
            'prefer-template': 'warn', // Use template literals instead of string concatenation
            '@typescript-eslint/array-type': ['warn', { default: 'array' }], // Prefer T[] over Array<T>
            'prefer-object-spread': 'warn', // Use {...obj} instead of Object.assign()
            curly: ['warn', 'multi-line'], // Require curly braces for multi-line blocks
            'no-else-return': 'warn' // Remove unnecessary else after return
        }
    }
);
