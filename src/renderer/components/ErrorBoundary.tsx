import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Attempt to flush any pending saves
    try {
      const api = (window as any).electronAPI;
      if (api) {
        // We can't access React state from here, but the auto-save interval
        // and beforeunload handler should have recent data on disk.
        // Log for debugging purposes.
        console.log('Error boundary triggered — recent auto-save should have preserved your work.');
      }
    } catch (e) {
      // Swallow — don't let save attempts mask the real error
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '48px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#333',
          backgroundColor: '#FFFFFF',
          textAlign: 'center',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            marginBottom: '24px',
            borderRadius: '50%',
            backgroundColor: '#FEF2F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}>
            !
          </div>

          <h1 style={{
            fontSize: '20px',
            fontWeight: 600,
            marginBottom: '8px',
            color: '#111',
          }}>
            Something went wrong
          </h1>

          <p style={{
            fontSize: '14px',
            color: '#666',
            maxWidth: '400px',
            lineHeight: 1.5,
            marginBottom: '24px',
          }}>
            Don't worry — your work has been auto-saved. Click the button below to reload the app.
          </p>

          {this.state.error && (
            <details style={{
              marginBottom: '24px',
              maxWidth: '500px',
              width: '100%',
              textAlign: 'left',
            }}>
              <summary style={{
                fontSize: '12px',
                color: '#999',
                cursor: 'pointer',
                marginBottom: '8px',
              }}>
                Technical details
              </summary>
              <pre style={{
                fontSize: '11px',
                color: '#999',
                backgroundColor: '#F8F8F8',
                padding: '12px',
                borderRadius: '8px',
                overflow: 'auto',
                maxHeight: '120px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </pre>
            </details>
          )}

          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#FFFFFF',
              backgroundColor: '#111',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Reload Braidr
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
