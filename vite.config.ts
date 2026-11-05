import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed port, and its dev window points here.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: {
    // macOS 14 and current WebView2 both handle modern output; pdf.js is its own legacy build.
    target: 'es2022',
    chunkSizeWarningLimit: 2048,
  },
  worker: { format: 'es' },
});
