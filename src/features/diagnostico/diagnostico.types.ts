/**
 * Representa el conjunto de capacidades web verificadas en tiempo de ejecución.
 */
export interface CapacidadesEntorno {
  readonly crossOriginIsolated: boolean;
  readonly soportaWorkers: boolean;
  readonly soportaWebAssembly: boolean;
  readonly soportaSharedArrayBuffer: boolean;
}
