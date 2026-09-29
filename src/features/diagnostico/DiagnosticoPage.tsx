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
    <main style={{ padding: 'var(--spacing-4)' }}>
      <header style={{ marginBottom: 'var(--spacing-8)' }}>
        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginBottom: 'var(--spacing-2)',
            color: 'var(--color-text-primary)',
          }}
        >
          BirdNet Local — Diagnóstico de Plataforma Web
        </h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Verificación de capacidades de ejecución en cliente para BirdNet Local:
          procesamiento de audio, Web Workers para inferencia ONNX, WebAssembly y cabeceras de entorno.
        </p>
      </header>

      <section
        aria-labelledby={listaId}
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--spacing-6)',
          marginBottom: 'var(--spacing-8)',
        }}
      >
        <h2
          id={listaId}
          style={{
            fontSize: 'var(--font-size-lg)',
            marginBottom: 'var(--spacing-4)',
            color: 'var(--color-text-primary)',
          }}
        >
          Capacidades detectadas en tiempo de ejecución
        </h2>

        <ul style={{ listStyle: 'none', display: 'grid', gap: 'var(--spacing-4)' }}>
          {items.map((item) => (
            <li
              key={item.etiqueta}
              style={{
                padding: 'var(--spacing-3)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--spacing-4)',
              }}
            >
              <div>
                <strong style={{ display: 'block', color: 'var(--color-text-primary)' }}>
                  {item.etiqueta}
                </strong>
                <span
                  style={{
                    fontSize: 'var(--font-size-base)',
                    color: 'var(--color-text-subtle)',
                  }}
                >
                  {item.descripcion}
                </span>
              </div>
              <span
                role="status"
                style={{
                  fontWeight: 'var(--font-weight-semibold)',
                  padding: 'var(--spacing-1) var(--spacing-2)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: item.activo
                    ? 'var(--color-badge-active-bg)'
                    : 'var(--color-badge-inactive-bg)',
                  color: item.activo
                    ? 'var(--color-badge-active-text)'
                    : 'var(--color-badge-inactive-text)',
                  fontSize: 'var(--font-size-base)',
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
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--spacing-6)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--font-size-lg)',
            marginBottom: 'var(--spacing-4)',
            color: 'var(--color-text-primary)',
          }}
        >
          Verificación de Reactividad
        </h2>
        <p style={{ marginBottom: 'var(--spacing-4)', color: 'var(--color-text-muted)' }}>
          Verificaciones realizadas:{' '}
          <strong data-testid="contador-pruebas">{contadorPrueba}</strong>
        </p>
        <button
          type="button"
          onClick={handleRecalcular}
          style={{
            padding: 'var(--spacing-2) var(--spacing-4)',
            backgroundColor: 'var(--color-dark-surface)',
            color: 'var(--color-dark-text)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-md)',
          }}
        >
          Reevaluar capacidades
        </button>
      </section>
    </main>
  );
}
