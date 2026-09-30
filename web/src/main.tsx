import { ConvexAuthProvider } from '@convex-dev/auth/react';
import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { convex } from './lib/convex';
import { installAudioUnlock } from './lib/sfx';
import './theme.css';

installAudioUnlock();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>
);
