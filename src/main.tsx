import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPlatform } from './platform';
import { App } from './ui/App';
import { ErrorBoundary, STARTUP_FAILURE } from './ui/ErrorBoundary';
import './ui/styles/fonts.css';
import './ui/styles/tokens.css';
import './ui/styles/app.css';
import './ui/styles/document-fonts.css';
import './ui/styles/editor-bars.css';
import './ui/styles/page-overlay.css';
import './ui/styles/notices.css';
import './ui/styles/signing-panel.css';
import './ui/styles/signing-page.css';
import './ui/styles/signing-dialog.css';
import './ui/styles/form-filling.css';
import './ui/styles/annotating.css';
import './ui/styles/pages.css';
import './ui/styles/annotation-panel.css';

const root = document.getElementById('root');
if (!root) throw new Error('The page is missing its root element.');

try {
  if (import.meta.env.MODE === 'e2e') {
    await import('@wdio/tauri-plugin');
  }

  const platform = await createPlatform();

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App platform={platform} />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  // React may not be running, so write the message directly rather than leave a blank window.
  console.error(error);
  root.textContent = STARTUP_FAILURE;
  root.className = 'startup-failure';
}
