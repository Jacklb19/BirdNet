import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const contenedor = document.getElementById('root');

if (!contenedor) {
  throw new Error('No se encontró el elemento raíz (#root) en el documento.');
}

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
