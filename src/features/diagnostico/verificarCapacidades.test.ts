import { describe, it, expect, vi, afterEach } from 'vitest';
import { verificarCapacidades } from './verificarCapacidades';

describe('verificarCapacidades', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debe retornar un objeto con todas las propiedades requeridas', () => {
    const resultado = verificarCapacidades();

    expect(resultado).toHaveProperty('crossOriginIsolated');
    expect(resultado).toHaveProperty('soportaWorkers');
    expect(resultado).toHaveProperty('soportaWebAssembly');
    expect(resultado).toHaveProperty('soportaSharedArrayBuffer');
  });

  it('debe reflejar crossOriginIsolated cuando está activo en window', () => {
    const originalValue = window.crossOriginIsolated;
    Object.defineProperty(window, 'crossOriginIsolated', {
      value: true,
      configurable: true,
    });

    const resultado = verificarCapacidades();
    expect(resultado.crossOriginIsolated).toBe(true);

    Object.defineProperty(window, 'crossOriginIsolated', {
      value: originalValue,
      configurable: true,
    });
  });
});
