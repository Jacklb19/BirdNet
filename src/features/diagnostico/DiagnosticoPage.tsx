import { useState, useId } from 'react';
import { verificarCapacidades } from './verificarCapacidades';
import type { CapacidadesEntorno } from './diagnostico.types';
import { useI18n, formatNumber } from '../../i18n';
import { FieldIcon } from '../../shared/FieldIcon';

/** Reports the existing platform checks without expanding diagnostic capabilities. */
export function DiagnosticoPage(): React.JSX.Element {
  const { locale, dict } = useI18n();
  const [capabilities, setCapabilities] = useState<CapacidadesEntorno>(() => verificarCapacidades());
  const [testCount, setTestCount] = useState(0);
  const listId = useId();
  const handleRecheck = (): void => {
    setCapabilities(verificarCapacidades());
    setTestCount((previous) => previous + 1);
  };
  const d = dict.diagnostics;
  const caps = d.capabilities;
  const items = [
    { label: caps.crossOriginIsolatedName, description: caps.crossOriginIsolatedDesc, supported: capabilities.crossOriginIsolated },
    { label: caps.webWorkerName, description: caps.webWorkerDesc, supported: capabilities.soportaWorkers },
    { label: caps.webAssemblyName, description: caps.webAssemblyDesc, supported: capabilities.soportaWebAssembly },
    { label: caps.sharedArrayBufferName, description: caps.sharedArrayBufferDesc, supported: capabilities.soportaSharedArrayBuffer },
  ];
  return (
    <section className="page diagnostics-page">
      <header className="page-heading"><p className="eyebrow">{dict.app.title}</p><h1 aria-label={d.title}>{dict.field.diagnostics}</h1><p>{d.description}</p></header>
      <section aria-labelledby={listId} className="capabilities-section">
        <h2 id={listId}>{d.capabilitiesTitle}</h2>
        <ul className="capability-list">{items.map((item) => (
          <li key={item.label}>
            <FieldIcon name={item.supported ? 'ready' : 'error'} />
            <div><strong>{item.label}</strong><p>{item.description}</p></div>
            <span role="status" className="capability-status" data-supported={item.supported}>{item.supported ? d.statusSupported : d.statusUnsupported}</span>
          </li>
        ))}</ul>
      </section>
      <section className="reactivity-section">
        <h2>{d.reactivityTitle}</h2>
        <p>{d.testsCount} <strong data-testid="contador-pruebas">{formatNumber(testCount, locale)}</strong></p>
        <button className="field-button" type="button" onClick={handleRecheck} style={{ minHeight: 'var(--touch-target-min)' }}>
          <FieldIcon name="signal" />{d.runTests}
        </button>
      </section>
    </section>
  );
}
