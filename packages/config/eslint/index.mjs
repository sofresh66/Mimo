// Configuration ESLint partagée (flat config) pour les packages TypeScript du monorepo.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @param {{ node?: boolean }} [options] */
export function createConfig(options = {}) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', '.next/**', 'node_modules/**', '**/*.d.ts'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: options.node === false ? globals.browser : { ...globals.node },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'always'],
      },
    },
    prettier,
  );
}

export default createConfig();
