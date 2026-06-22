/* ============================================================
   Notati — app entry. Vite bundles from here.
   Loads design tokens + styles, then mounts the React app
   inside the toast provider and error boundary.
   ============================================================ */
import React from 'react';
import { createRoot } from 'react-dom/client';

import '../ds/colors_and_type.css';
import './app.css';

import { ToastProvider, ErrorBoundary } from './components.jsx';
import { App } from './app.jsx';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ToastProvider>
      <App/>
    </ToastProvider>
  </ErrorBoundary>
);
