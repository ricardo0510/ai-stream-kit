import { defineConfig } from 'tsup';

export default defineConfig([
  // Core package
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: true,
    treeshake: true,
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' };
    },
  },
  // React adapter
  {
    entry: { react: 'src/adapters/react.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    external: ['react'],
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' };
    },
  },
  // Vue adapter
  {
    entry: { vue: 'src/adapters/vue.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    external: ['vue'],
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' };
    },
  },
]);
