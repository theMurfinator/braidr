import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastContext';
import LicenseGate from './components/LicenseGate';
import { MobileApp } from './MobileApp';
import './styles.css';

const isCapacitor = typeof (window as any).Capacitor !== 'undefined'
  && (window as any).Capacitor.isNativePlatform?.();

const root = isCapacitor ? (
  <MobileApp />
) : (
  <LicenseGate onNavigateToAccount={() => window.dispatchEvent(new CustomEvent('braidr-navigate-account'))}>
    <App />
  </LicenseGate>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        {root}
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
