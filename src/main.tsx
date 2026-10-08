import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted so the interface keeps its typeface offline; only the weights and subset the design uses.
import '@fontsource/radio-canada/latin-400.css';
import '@fontsource/radio-canada/latin-500.css';
import '@fontsource/radio-canada/latin-600.css';
import '@fontsource/radio-canada/latin-700.css';
import '@fontsource/radio-canada/latin-400-italic.css';
import '@fontsource/dm-mono/latin-500.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { applyInitialTheme } from './theme';
import { registerOffline } from './features/offline/offlineClient';
import App from './App';

// Before the first render, so a dark preference never flashes the light palette.
applyInitialTheme();
void registerOffline().catch(() => { document.documentElement.dataset.offlineError = 'true'; });

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element (#root) not found in the document.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
