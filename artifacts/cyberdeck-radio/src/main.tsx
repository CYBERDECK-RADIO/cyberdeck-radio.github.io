/**
 * App entry point: mounts the React tree under a top-level error boundary.
 *
 *   #root ──▶ createRoot ──▶ ErrorBoundary ──▶ App
 *
 * onCaughtError keeps caught errors off reportError() so the dev overlay does
 * not fire for handled failures.
 */

import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
