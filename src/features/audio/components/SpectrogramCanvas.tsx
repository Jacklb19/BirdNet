import { useEffect, useRef } from 'react';
import type { MelSpectrogramResponse } from '../worker/mel-spectrogram.worker';
import { useTheme } from '../../../theme';
import { useI18n, formatDecimal } from '../../../i18n';

export interface SpectrogramCanvasProps {
  espectrograma: MelSpectrogramResponse | null;
  ancho?: number;
  alto?: number;
}

/**
 * Maps a dB value to an RGB color using the high-contrast Inferno / Solar colormap.
 * Optimized for maximum visibility under direct field sunlight (RNF-10).
 */
function dbToColor(db: number, minDb: number = -60, maxDb: number = 20): [number, number, number] {
  const normalized = Math.min(Math.max((db - minDb) / (maxDb - minDb), 0), 1);

  if (normalized < 0.25) {
    const t = normalized / 0.25;
    return [Math.round(40 * t), 0, Math.round(80 * t)];
  } else if (normalized < 0.5) {
    const t = (normalized - 0.25) / 0.25;
    return [Math.round(40 + 150 * t), 0, Math.round(80 + 40 * t)];
  } else if (normalized < 0.75) {
    const t = (normalized - 0.5) / 0.25;
    return [Math.round(190 + 55 * t), Math.round(140 * t), 0];
  } else {
    const t = (normalized - 0.75) / 0.25;
    return [Math.round(245 + 10 * t), Math.round(140 + 115 * t), Math.round(220 * t)];
  }
}

export function SpectrogramCanvas({
  espectrograma,
  ancho = 640,
  alto = 240,
}: SpectrogramCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolved: themeResolved } = useTheme();
  const { locale, dict } = useI18n();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Read colors from CSS custom properties at render time
    const computedStyles = getComputedStyle(canvas);
    const canvasBg =
      computedStyles.getPropertyValue('--color-canvas-bg').trim() ||
      (themeResolved === 'dark' ? '#020617' : '#111827');
    const canvasText =
      computedStyles.getPropertyValue('--color-canvas-text').trim() || '#f9fafb';
    const canvasTextMuted =
      computedStyles.getPropertyValue('--color-canvas-text-muted').trim() || '#9ca3af';
    const canvasOverlay =
      computedStyles.getPropertyValue('--color-canvas-overlay').trim() || 'rgba(0, 0, 0, 0.4)';

    // Empty state when no audio stream has started
    if (!espectrograma || espectrograma.numFrames === 0) {
      ctx.fillStyle = canvasBg;
      ctx.fillRect(0, 0, ancho, alto);

      ctx.fillStyle = canvasTextMuted;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dict.capture.spectrogramEmpty, ancho / 2, alto / 2);
      return;
    }

    const { data, numFrames, numMelBands } = espectrograma;

    // Create ImageData for pixel-level buffer rendering
    const imgData = ctx.createImageData(numFrames, numMelBands);
    const pixelBuffer = imgData.data;

    for (let f = 0; f < numFrames; f++) {
      for (let m = 0; m < numMelBands; m++) {
        const db = data[f * numMelBands + m] ?? -100;
        const [r, g, b] = dbToColor(db);

        const y = numMelBands - 1 - m;
        const x = f;
        const pixelIndex = (y * numFrames + x) * 4;

        pixelBuffer[pixelIndex] = r;
        pixelBuffer[pixelIndex + 1] = g;
        pixelBuffer[pixelIndex + 2] = b;
        pixelBuffer[pixelIndex + 3] = 255;
      }
    }

    // Render bitmap scaled smoothly to canvas viewport
    if (typeof createImageBitmap !== 'undefined') {
      createImageBitmap(imgData)
        .then((bitmap) => {
          ctx.drawImage(bitmap, 0, 0, ancho, alto);
          bitmap.close();

          // Overlay frequency and time scale markers
          ctx.fillStyle = canvasOverlay;
          ctx.fillRect(0, 0, ancho, 24);
          ctx.fillRect(0, alto - 20, ancho, 20);

          ctx.fillStyle = canvasText;
          ctx.font = '11px ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(dict.capture.spectrogramMelUpper, 8, 16);
          ctx.fillText(`${formatDecimal(0, locale, 1)} s`, 8, alto - 6);

          ctx.textAlign = 'right';
          ctx.fillText(
            `${dict.capture.spectrogramWindowPrefix}${String(espectrograma.windowIndex)}`,
            ancho - 8,
            16,
          );
          ctx.fillText(`${formatDecimal(3, locale, 1)} s`, ancho - 8, alto - 6);
        })
        .catch(() => {
          ctx.fillStyle = canvasBg;
          ctx.fillRect(0, 0, ancho, alto);
        });
    } else {
      ctx.fillStyle = canvasBg;
      ctx.fillRect(0, 0, ancho, alto);
    }
  }, [espectrograma, ancho, alto, themeResolved, locale, dict]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: `${String(ancho)}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={ancho}
        height={alto}
        data-testid="spectrogram-canvas"
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-canvas-border)',
          boxShadow: 'var(--color-canvas-shadow)',
          backgroundColor: 'var(--color-canvas-bg)',
        }}
      />
    </div>
  );
}
