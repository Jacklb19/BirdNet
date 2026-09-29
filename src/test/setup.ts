import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Limpieza automática del DOM después de cada prueba
afterEach(() => {
  cleanup();
});
