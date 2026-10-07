import { render, screen } from '@testing-library/react';
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
});
