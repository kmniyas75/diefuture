import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        terms: resolve(__dirname, 'terms.html'),
        refund: resolve(__dirname, 'refund.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        contact: resolve(__dirname, 'contact.html'),
        room: resolve(__dirname, 'room.html'),
        rooms: resolve(__dirname, 'rooms.html'),
        shipping: resolve(__dirname, 'shipping-policy.html'),
      },
    },
  },
  plugins: [
    {
      name: 'clean-urls-dev',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const host = req.headers.host || 'localhost:5173';
          const url = new URL(req.url, `http://${host}`);
          const pathname = url.pathname;
          if (pathname !== '/' && !pathname.includes('.')) {
            req.url = `${pathname}.html${url.search}`;
          }
          next();
        });
      }
    }
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
