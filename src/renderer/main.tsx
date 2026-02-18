import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastContext';
import LicenseGate from './components/LicenseGate';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <LicenseGate onNavigateToAccount={() => window.dispatchEvent(new CustomEvent('braidr-navigate-account'))}>
          <App />
        </LicenseGate>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
