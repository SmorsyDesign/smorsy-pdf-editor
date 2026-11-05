import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPlatform } from './platform';
import { App } from './ui/App';
import './ui/styles/fonts.css';
import './ui/styles/tokens.css';
import './ui/styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('The page is missing its root element.');

if (import.meta.env.MODE === 'e2e') {
  await import('@wdio/tauri-plugin');
}

const platform = await createPlatform();

createRoot(root).render(
  <StrictMode>
    <App platform={platform} />
  </StrictMode>,
);
