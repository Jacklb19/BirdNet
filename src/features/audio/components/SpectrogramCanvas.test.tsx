import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpectrogramCanvas } from './SpectrogramCanvas';
import type { MelSpectrogramResponse } from '../worker/mel-spectrogram.worker';

describe('SpectrogramCanvas', () => {
  let mockContext: {
    fillStyle: string;
    fillRect: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    font: string;
    textAlign: string;
    createImageData: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      fillStyle: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
      font: '',
      textAlign: '',
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      drawImage: vi.fn(),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

    globalThis.createImageBitmap = vi.fn().mockResolvedValue({
      close: vi.fn(),
    });
  });

  it('renderiza el elemento canvas accesible', () => {
    render(<SpectrogramCanvas espectrograma={null} />);
    const canvas = screen.getByTestId('spectrogram-canvas');
    expect(canvas).toBeInTheDocument();
    expect(mockContext.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Inicia la escucha'),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('renderiza datos del espectrograma cubriendo todo el rango de dB', async () => {
    const numFrames = 4;
    const numMelBands = 4;
    // Valores de prueba para cubrir los 4 cuartiles de dbToColor (-60 dB a +20 dB)
    // -60 dB -> norm 0.0 (cuartil 1)
    // -35 dB -> norm 0.31 (cuartil 2)
    // -10 dB -> norm 0.625 (cuartil 3)
    // +15 dB -> norm 0.937 (cuartil 4)
    const testData = new Float32Array([
      -60, -35, -10, 15,
      -70, -30, -5, 20,
      -50, -25, 0, 10,
      -80, -40, -15, 25,
    ]);

    const mockEspectrograma: MelSpectrogramResponse = {
      windowIndex: 1,
      timestamp: 1234,
      numFrames,
      numMelBands,
      data: testData,
      processingTimeMs: 15,
    };

    render(<SpectrogramCanvas espectrograma={mockEspectrograma} ancho={400} alto={200} />);

    expect(mockContext.createImageData).toHaveBeenCalledWith(numFrames, numMelBands);

    // Esperar a que la promesa de createImageBitmap resuelva y dibuje en el canvas
    await vi.waitFor(() => {
      expect(mockContext.drawImage).toHaveBeenCalled();
    });

    expect(mockContext.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Ventana #1'),
      expect.any(Number),
      expect.any(Number),
    );
  });
});
