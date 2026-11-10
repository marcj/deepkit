import { fileURLToPath } from 'node:url';

import { deepkitType } from '@deepkit/vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default {
  root,
  logLevel: 'warn',
  plugins: [deepkitType({ tsConfig: root + 'tsconfig.json' })],
  worker: { format: 'es', plugins: () => [deepkitType({ tsConfig: root + 'tsconfig.json' })] },
  build: { outDir: '/tmp/deepkit-rpc-browser', emptyOutDir: true, target: 'es2022' },
};
