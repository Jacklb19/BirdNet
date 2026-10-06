import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

vi.mock('./features/audio/hooks/useAudioCapture', () => ({
  useAudioCapture: vi.fn(() => ({
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
    startListening: vi.fn(),
    stopListening: vi.fn(),
  })),
}));

describe('App', () => {
  it('renders acoustic capture by default', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /birdnet local/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('region', {
        name: /panel de captura acústica/i,
      }),
    ).toBeInTheDocument();
  });

  it('keeps diagnostics out of product navigation and available in development settings', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /diagnóstico de plataforma/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /configuración/i }));
    const tools = screen.getByText(/herramientas de desarrollo/i);
    expect(tools.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(tools);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /birdnet local — diagnóstico de plataforma web/i,
      }),
    ).toBeInTheDocument();
  });

  it('excludes development diagnostics from the production interface', () => {
    vi.stubEnv('DEV', false);
    try {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: /configuración/i }));
      expect(screen.queryByText(/herramientas de desarrollo/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reevaluar capacidades/i })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
