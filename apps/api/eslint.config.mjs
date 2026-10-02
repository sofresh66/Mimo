import { createConfig } from '@mimo/config/eslint';

export default [
  ...createConfig(),
  {
    // Les classes Nest injectées sont importées comme valeurs (métadonnées de décorateurs).
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    // Scripts en ligne de commande (seed, synchronisation) : la sortie console est voulue.
    files: ['prisma/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
