module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'implicit-dependencies', 'prettier'],
  env: {
    es6: true,
    node: true,
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'dist.browser/',
    'coverage/',
    'prettier.config.js',
    'typedoc.js',
    'packages/discv5/',
    'docs',
    'test/',
    '.eslintrc.js'
  ],
  extends: ['eslint:recommended'],
  rules: {
    'no-console': 'warn',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'implicit-dependencies/no-implicit': ['error', { peer: true, dev: true, optional: true }],
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/no-use-before-define': 'error',
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'interface',
        format: ['PascalCase', 'camelCase'],
      },
    ],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-unnecessary-condition': 'off',
    'no-dupe-class-members': 'off',
    'no-extra-semi': 'off',
    'prettier/prettier': 'error',
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': ['error'],
    'no-case-declarations': 'warn',
  },
  parserOptions: {
    sourceType: 'module',
    project: './tsconfig.json',
  },
}
