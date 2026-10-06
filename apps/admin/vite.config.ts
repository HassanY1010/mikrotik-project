import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mikrotik-saas/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@mikrotik-saas/shared-validation': path.resolve(__dirname, '../../packages/shared-validation/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://mikrotik-api-yn0e.onrender.com',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.VITE_API_URL || 'https://mikrotik-api-yn0e.onrender.com',
        changeOrigin: true,
      },
    },
  },
});
