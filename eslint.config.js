import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      'ios/**',
      'BraidrIPad/**',
      'braidr-landing/**',
      'mockups/**',
      'docs/**',
      'scripts/**',
      'build/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // tsc enforces noUnusedLocals/noUnusedParameters; avoid double-reporting
      '@typescript-eslint/no-unused-vars': 'off',
      // 209 known `any`s concentrated on the IPC seam; retired by the
      // data-model migration (docs/data-model/TO-BE.md), not one-off fixes
      '@typescript-eslint/no-explicit-any': 'off',
      // React-Compiler-era pattern rules: guidance, not a gate, on this
      // pre-existing codebase. New code should heed the warnings.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      // intentional swallow-and-continue catches are common around fs/JSON
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Electron main process compiles to CommonJS; lazy require() of
    // better-sqlite3/database inside handler bodies is the mandated pattern
    files: ['src/main/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
