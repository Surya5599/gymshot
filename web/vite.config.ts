import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Self-signed https so getUserMedia (the in-page camera) works from phones
  // on the LAN; browsers require a secure context for camera access.
  plugins: [react(), basicSsl()],
  server: {
    // Allow access through Cloudflare quick tunnels (phone testing).
    allowedHosts: ['.trycloudflare.com'],
  },
});
