import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

vi.mock('./features/audio/hooks/useAudioCapture', () => ({
  useAudioCapture: vi.fn(() => ({
    estado: 'idle',
    error: null,
    nivelRms: 0,
    nivelPico: 0,
    conteoVentanas: 0,
    ultimoEspectrograma: null,
    latenciaUltimoEspectrogramaMs: 0,
    sampleRate: 48000,
    iniciarEscucha: vi.fn(),
    detenerEscucha: vi.fn(),
  })),
}));

describe('App', () => {
  it('renderiza la vista de captura acústica por defecto', () => {
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

  it('permite alternar a la página de diagnóstico', () => {
    render(<App />);

    const diagButton = screen.getByRole('button', {
      name: /diagnóstico de plataforma/i,
    });
    fireEvent.click(diagButton);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /birdnet local — diagnóstico de plataforma web/i,
      }),
    ).toBeInTheDocument();
  });
});
