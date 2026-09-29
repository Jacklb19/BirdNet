import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '../App';
import * as useAudioCaptureModule from '../features/audio/hooks/useAudioCapture';

describe('Responsive E2E Main User Journey', () => {
  let mockIniciarEscucha: () => Promise<void>;
  let mockDetenerEscucha: () => Promise<void>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.lang = 'es';

    mockIniciarEscucha = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockDetenerEscucha = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    vi.spyOn(useAudioCaptureModule, 'useAudioCapture').mockReturnValue({
      estado: 'idle',
      error: null,
      nivelRms: 0.15,
      nivelPico: 0.35,
      conteoVentanas: 1,
      ultimoEspectrograma: null,
      latenciaUltimoEspectrogramaMs: 12,
      sampleRate: 48000,
      iniciarEscucha: mockIniciarEscucha,
      detenerEscucha: mockDetenerEscucha,
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  const viewports = [
    { name: 'Móvil estrecho (360 px)', width: 360, height: 640 },
    { name: 'Escritorio estándar (1280 px)', width: 1280, height: 800 },
  ];

  viewports.forEach(({ name, width, height }) => {
    it(`ejecuta el recorrido principal completo sin errores en ${name}`, async () => {
      window.innerWidth = width;
      window.innerHeight = height;
      window.dispatchEvent(new Event('resize'));

      const user = userEvent.setup();
      render(<App />);

      // ─── 1. Vista de Captura Acústica ─────────────────────────────────
      expect(
        screen.getByRole('heading', { level: 1, name: /birdnet local/i }),
      ).toBeInTheDocument();

      const captureBtn = screen.getByRole('button', { name: /iniciar escucha/i });
      expect(captureBtn).toBeInTheDocument();

      // Touch target verification (RNF-10, WCAG 2.5.5 >= 44px)
      expect(captureBtn.style.width).toBe('var(--touch-target-size)');
      expect(captureBtn.style.height).toBe('var(--touch-target-size)');

      // User interaction: start listening
      await user.click(captureBtn);
      expect(mockIniciarEscucha).toHaveBeenCalledTimes(1);

      // Verify VU meter and session metrics are present
      expect(screen.getByRole('meter', { name: /nivel rms/i })).toBeInTheDocument();
      expect(screen.getByTestId('sample-rate')).toBeInTheDocument();

      // ─── 2. Navegación a Diagnóstico de Plataforma ────────────────────
      const navDiagnostics = screen.getByRole('button', { name: /diagnóstico de plataforma/i });
      expect(navDiagnostics.style.minHeight).toBe('var(--touch-target-min)');

      await user.click(navDiagnostics);

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /birdnet local — diagnóstico de plataforma web/i,
        }),
      ).toBeInTheDocument();

      const evalBtn = screen.getByRole('button', { name: /reevaluar capacidades/i });
      expect(evalBtn.style.minHeight).toBe('var(--touch-target-min)');
      await user.click(evalBtn);

      expect(screen.getByTestId('contador-pruebas')).toHaveTextContent('1');

      // ─── 3. Navegación a Configuración (/settings) ─────────────────────
      const navSettings = screen.getByRole('button', { name: /configuración/i });
      await user.click(navSettings);

      expect(
        screen.getByRole('heading', { level: 2, name: /configuración y preferencias/i }),
      ).toBeInTheDocument();

      // Cambiar a tema oscuro
      const radioDark = screen.getByRole('radio', { name: /oscuro/i });
      await user.click(radioDark);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      // Cambiar a idioma inglés
      const radioEn = screen.getByRole('radio', { name: /english/i });
      await user.click(radioEn);
      expect(document.documentElement.lang).toBe('en');

      // Comprobar actualización inmediata de los textos a inglés
      expect(
        screen.getByRole('heading', { level: 2, name: /settings & preferences/i }),
      ).toBeInTheDocument();

      // Comprobar que la navegación ahora muestra etiquetas en inglés
      expect(screen.getByRole('button', { name: /acoustic capture/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /platform diagnostics/i })).toBeInTheDocument();

      // Volver a Captura y comprobar vista en inglés
      await user.click(screen.getByRole('button', { name: /acoustic capture/i }));
      expect(screen.getByRole('button', { name: /start listening/i })).toBeInTheDocument();

      // Regresar al idioma español
      await user.click(screen.getByRole('button', { name: /settings/i }));
      const radioEs = screen.getByRole('radio', { name: /español/i });
      await user.click(radioEs);
      expect(document.documentElement.lang).toBe('es');

      // Regresar a la vista de captura y verificar texto en español
      await user.click(screen.getByRole('button', { name: /captura acústica/i }));
      expect(screen.getByRole('button', { name: /iniciar escucha/i })).toBeInTheDocument();
    });
  });
});
