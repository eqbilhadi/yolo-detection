import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
  plugins: [
    laravel({
      input: ['resources/js/app.ts'],
      ssr: 'resources/js/ssr.ts',
      refresh: true,
    }),
    vue(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: 'onnxruntime-web',  // ini folder tujuan di public dev server
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.mjs',
          dest: 'onnxruntime-web',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './resources/js'),
    },
  },
 optimizeDeps: {
    include: [], // kosongkan atau sesuai kebutuhan lain
    exclude: ['onnxruntime-web'],
  },
  server: {
    host: 'localhost',
  },
});
