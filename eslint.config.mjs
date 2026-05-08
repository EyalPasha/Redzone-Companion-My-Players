import { fixupConfigRules } from '@eslint/compat'
import nextConfig from 'eslint-config-next'
import nextTypeScriptConfig from 'eslint-config-next/typescript'

const eslintConfig = [
  ...fixupConfigRules(nextConfig),
  ...fixupConfigRules(nextTypeScriptConfig),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },
]

export default eslintConfig
