import { useState, useId } from 'react';
import { verificarCapacidades } from './verificarCapacidades';
import type { CapacidadesEntorno } from './diagnostico.types';
import { useI18n, formatNumber } from '../../i18n';

/**
 * Diagnostics page verifying browser and device platform capabilities.
 */
export function DiagnosticoPage(): React.JSX.Element {
  const { locale, dict } = useI18n();
  const [capacidades, setCapacidades] = useState<CapacidadesEntorno>(() =>
    verificarCapacidades(),
  );
  const [contadorPrueba, setContadorPrueba] = useState<number>(0);
  const listaId = useId();

  const handleRecalcular = (): void => {
    setCapacidades(verificarCapacidades());
    setContadorPrueba((prev) => prev + 1);
  };

  const d = dict.diagnostics;
  const caps = d.capabilities;

  const items = [
    {
      etiqueta: caps.crossOriginIsolatedName,
      descripcion: caps.crossOriginIsolatedDesc,
      activo: capacidades.crossOriginIsolated,
    },
    {
      etiqueta: caps.webWorkerName,
      descripcion: caps.webWorkerDesc,
      activo: capacidades.soportaWorkers,
    },
    {
      etiqueta: caps.webAssemblyName,
      descripcion: caps.webAssemblyDesc,
      activo: capacidades.soportaWebAssembly,
    },
    {
      etiqueta: caps.sharedArrayBufferName,
      descripcion: caps.sharedArrayBufferDesc,
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
          {d.title}
        </h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          {d.description}
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
          {d.capabilitiesTitle}
        </h2>

        <ul style={{ listStyle: 'none', display: 'grid', gap: 'var(--spacing-4)', padding: 0 }}>
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
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: '240px' }}>
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
                {item.activo ? d.statusSupported : d.statusUnsupported}
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
          {d.reactivityTitle}
        </h2>
        <p style={{ marginBottom: 'var(--spacing-4)', color: 'var(--color-text-muted)' }}>
          {d.testsCount}{' '}
          <strong data-testid="contador-pruebas">{formatNumber(contadorPrueba, locale)}</strong>
        </p>
        <button
          type="button"
          onClick={handleRecalcular}
          style={{
            minHeight: 'var(--touch-target-min)',
            padding: 'var(--spacing-2) var(--spacing-4)',
            backgroundColor: 'var(--color-surface-raised)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-md)',
            fontWeight: 'var(--font-weight-semibold)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {d.runTests}
        </button>
      </section>
    </main>
  );
}
