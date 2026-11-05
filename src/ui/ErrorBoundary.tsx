import { Component, type ErrorInfo, type ReactNode } from 'react';

export const STARTUP_FAILURE =
  'Smorsy PDF Editor couldn’t start. Quit and open it again. If that doesn’t help, reinstall it. Your files haven’t been changed.';

const RUNTIME_FAILURE =
  'Something went wrong in Smorsy PDF Editor. Quit and open it again. Your original file hasn’t been changed.';

interface ErrorBoundaryState {
  readonly failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    if (this.state.failed) {
      return (
        <p className="startup-failure" role="alert">
          {RUNTIME_FAILURE}
        </p>
      );
    }
    return this.props.children;
  }
}
