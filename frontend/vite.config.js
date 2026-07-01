import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';
// import { VitePWA } from 'vite-plugin-pwa'; // Commented out - no longer using PWA

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr(),
    // VitePWA removed - caching disabled
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Production optimizations
  build: {
    sourcemap: 'hidden', 
    minify: 'terser',
    
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['react-hot-toast'],
        },
      },
    },
    
    chunkSizeWarningLimit: 1000,
    target: 'es2015',
    cssCodeSplit: true,
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },

  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 4173,
    host: true,
  },
});