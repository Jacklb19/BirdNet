import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioCapturePanel } from './AudioCapturePanel';
import * as useAudioCaptureModule from '../hooks/useAudioCapture';

describe('AudioCapturePanel', () => {
  beforeEach(() => {
    vi.spyOn(useAudioCaptureModule, 'useAudioCapture').mockReturnValue({
      state: 'idle',
      rmsLevel: 0,
      peakLevel: 0,
      windowCount: 0,
      latestSpectrogram: null,
      spectrogramLatencyMs: 0,
      sampleRate: 48000,
      modelStatus: 'idle',
      detections: [],
      inferenceLatencyMs: 0,
      endToEndLatencyMs: 0,
      droppedWindows: 0,
      sessionError: null,
      startListening: vi.fn().mockResolvedValue(undefined),
      stopListening: vi.fn().mockResolvedValue(undefined),
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

    expect(screen.getByTestId('sample-rate')).toHaveTextContent(/48[,.]0 kHz/);
    expect(screen.getByTestId('window-count')).toHaveTextContent('0');
    expect(screen.getByTestId('latency')).toHaveTextContent('0 ms');
  });

  it('muestra el botón de detener cuando el state es listening', () => {
    vi.spyOn(useAudioCaptureModule, 'useAudioCapture').mockReturnValue({
      state: 'listening',
      rmsLevel: 0.3,
      peakLevel: 0.5,
      windowCount: 5,
      latestSpectrogram: null,
      spectrogramLatencyMs: 42,
      sampleRate: 48000,
      modelStatus: 'idle',
      detections: [],
      inferenceLatencyMs: 0,
      endToEndLatencyMs: 0,
      droppedWindows: 0,
      sessionError: null,
      startListening: vi.fn().mockResolvedValue(undefined),
      stopListening: vi.fn().mockResolvedValue(undefined),
    });

    render(<AudioCapturePanel />);

    expect(
      screen.getByRole('button', { name: /detener escucha/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('window-count')).toHaveTextContent('5');
  });

  it('muestra un mensaje de error cuando ocurre un fallo', () => {
    vi.spyOn(useAudioCaptureModule, 'useAudioCapture').mockReturnValue({
      state: 'error',
      rmsLevel: 0,
      peakLevel: 0,
      windowCount: 0,
      latestSpectrogram: null,
      spectrogramLatencyMs: 0,
      sampleRate: 48000,
      modelStatus: 'idle',
      detections: [],
      inferenceLatencyMs: 0,
      endToEndLatencyMs: 0,
      droppedWindows: 0,
      sessionError: 'audio',
      startListening: vi.fn().mockResolvedValue(undefined),
      stopListening: vi.fn().mockResolvedValue(undefined),
    });

    render(<AudioCapturePanel />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo procesar el audio. Revisa el permiso del micrófono y vuelve a iniciar la escucha.',
    );
  });
});
