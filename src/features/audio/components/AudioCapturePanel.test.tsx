import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioCapturePanel } from './AudioCapturePanel';
import * as useAudioCaptureModule from '../hooks/useAudioCapture';

describe('AudioCapturePanel', () => {
  beforeEach(() => {
    vi.spyOn(useAudioCaptureModule, 'useAudioCapture').mockReturnValue({
      estado: 'idle',
      error: null,
      nivelRms: 0,
      nivelPico: 0,
      conteoVentanas: 0,
      ultimoEspectrograma: null,
      latenciaUltimoEspectrogramaMs: 0,
      sampleRate: 48000,
      iniciarEscucha: vi.fn().mockResolvedValue(undefined),
      detenerEscucha: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renderiza el panel con el botón de escucha y el banner de privacidad', () => {
    render(<AudioCapturePanel />);

    expect(
      screen.getByRole('button', { name: /iniciar escucha/i }),
    ).toBeInTheDocument();

    expect(screen.getByText(/privacidad/i)).toBeInTheDocument();
  });

  it('muestra las métricas de sesión con valores iniciales', () => {
    render(<AudioCapturePanel />);

    expect(screen.getByTestId('sample-rate')).toHaveTextContent('48.0 kHz');
    expect(screen.getByTestId('window-count')).toHaveTextContent('0');
    expect(screen.getByTestId('latency')).toHaveTextContent('0 ms');
  });

  it('muestra el botón de detener cuando el estado es escuchando', () => {
    vi.spyOn(useAudioCaptureModule, 'useAudioCapture').mockReturnValue({
      estado: 'escuchando',
      error: null,
      nivelRms: 0.3,
      nivelPico: 0.5,
      conteoVentanas: 5,
      ultimoEspectrograma: null,
      latenciaUltimoEspectrogramaMs: 42,
      sampleRate: 48000,
      iniciarEscucha: vi.fn().mockResolvedValue(undefined),
      detenerEscucha: vi.fn().mockResolvedValue(undefined),
    });

    render(<AudioCapturePanel />);

    expect(
      screen.getByRole('button', { name: /detener escucha/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('window-count')).toHaveTextContent('5');
  });

  it('muestra un mensaje de error cuando ocurre un fallo', () => {
    vi.spyOn(useAudioCaptureModule, 'useAudioCapture').mockReturnValue({
      estado: 'error',
      error: 'Permiso de micrófono denegado',
      nivelRms: 0,
      nivelPico: 0,
      conteoVentanas: 0,
      ultimoEspectrograma: null,
      latenciaUltimoEspectrogramaMs: 0,
      sampleRate: 48000,
      iniciarEscucha: vi.fn().mockResolvedValue(undefined),
      detenerEscucha: vi.fn().mockResolvedValue(undefined),
    });

    render(<AudioCapturePanel />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Permiso de micrófono denegado',
    );
  });
});
