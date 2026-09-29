import { useState, useId } from 'react';
import { verificarCapacidades } from './verificarCapacidades';
import type { CapacidadesEntorno } from './diagnostico.types';

export function DiagnosticoPage(): React.JSX.Element {
  const [capacidades, setCapacidades] = useState<CapacidadesEntorno>(() =>
    verificarCapacidades(),
  );
  const [contadorPrueba, setContadorPrueba] = useState<number>(0);
  const listaId = useId();

  const handleRecalcular = (): void => {
    setCapacidades(verificarCapacidades());
    setContadorPrueba((prev) => prev + 1);
  };

  const items = [
    {
      etiqueta: 'Aislamiento de origen cruzado (crossOriginIsolated)',
      descripcion:
        'Indica si las cabeceras COOP y COEP están activas y habilitan memoria compartida.',
      activo: capacidades.crossOriginIsolated,
    },
    {
      etiqueta: 'Soporte de Web Workers',
      descripcion:
        'Permite delegar tareas de cómputo en segundo plano sin congelar la interfaz.',
      activo: capacidades.soportaWorkers,
    },
    {
      etiqueta: 'Soporte de WebAssembly',
      descripcion:
        'Habilita la ejecución de módulos compilados de alto rendimiento en el cliente.',
      activo: capacidades.soportaWebAssembly,
    },
    {
      etiqueta: 'Soporte de SharedArrayBuffer',
      descripcion:
        'Permite compartir memoria entre hilos sin copias estructuradas.',
      activo: capacidades.soportaSharedArrayBuffer,
    },
  ];

  return (
    <main style={{ padding: '1rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
          BirdNet Local — Diagnóstico de Plataforma Web
        </h1>
        <p style={{ color: '#4b5563' }}>
          Verificación de capacidades de ejecución en cliente para BirdNet Local:
          procesamiento de audio, Web Workers para inferencia ONNX, WebAssembly y cabeceras de entorno.
        </p>
      </header>

      <section
        aria-labelledby={listaId}
        style={{
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <h2 id={listaId} style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
          Capacidades detectadas en tiempo de ejecución
        </h2>

        <ul style={{ listStyle: 'none', display: 'grid', gap: '1rem' }}>
          {items.map((item) => (
            <li
              key={item.etiqueta}
              style={{
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div>
                <strong style={{ display: 'block' }}>{item.etiqueta}</strong>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {item.descripcion}
                </span>
              </div>
              <span
                role="status"
                style={{
                  fontWeight: 600,
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: item.activo ? '#dcfce7' : '#fee2e2',
                  color: item.activo ? '#166534' : '#991b1b',
                  fontSize: '0.875rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.activo ? 'Disponible' : 'No disponible'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        style={{
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          padding: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
          Verificación de Reactividad
        </h2>
        <p style={{ marginBottom: '1rem', color: '#4b5563' }}>
          Verificaciones realizadas:{' '}
          <strong data-testid="contador-pruebas">{contadorPrueba}</strong>
        </p>
        <button
          type="button"
          onClick={handleRecalcular}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#1f2937',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Reevaluar capacidades
        </button>
      </section>
    </main>
  );
}
