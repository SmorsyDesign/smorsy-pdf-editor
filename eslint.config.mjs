import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'design/',
      'dist/',
      'public/',
      'src-tauri/',
      'test-pdfs/',
      'node_modules/',
      '*.mjs',
      'scripts/',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // The engine and platform boundaries are architecture rules from SPEC.md Part 2.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react-dom',
            'react-dom/*',
            '@tauri-apps/*',
            '**/ui/*',
            '**/platform/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/workers/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@tauri-apps/*'] }] },
  },
);
