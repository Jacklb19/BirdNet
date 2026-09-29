import type { CapacidadesEntorno } from './diagnostico.types';

/**
 * Evalúa las capacidades del navegador necesarias para la ejecución
 * de hilos de trabajo, aislamiento de memoria y WebAssembly.
 *
 * @returns Objeto con el estado de cada capacidad en el entorno actual.
 */
export function verificarCapacidades(): CapacidadesEntorno {
  const tieneVentana = typeof window !== 'undefined';

  const crossOriginIsolated = tieneVentana
    ? window.crossOriginIsolated
    : false;

  const soportaWorkers = typeof Worker !== 'undefined';

  const soportaWebAssembly =
    typeof WebAssembly === 'object' &&
    typeof WebAssembly.instantiate === 'function';

  const soportaSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  return {
    crossOriginIsolated,
    soportaWorkers,
    soportaWebAssembly,
    soportaSharedArrayBuffer,
  };
}
