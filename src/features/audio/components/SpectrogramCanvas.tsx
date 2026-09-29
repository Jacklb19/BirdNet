import { useEffect, useRef } from 'react';
import type { MelSpectrogramResponse } from '../worker/mel-spectrogram.worker';

export interface SpectrogramCanvasProps {
  espectrograma: MelSpectrogramResponse | null;
  ancho?: number;
  alto?: number;
}

/**
 * Mapea un valor en dB a un color RGB de alto contraste (escala Inferno / Solar).
 * Optimizado para visibilidad bajo luz solar directa (RNF-10).
 */
function dbToColor(db: number, minDb: number = -60, maxDb: number = 20): [number, number, number] {
  const normalized = Math.min(Math.max((db - minDb) / (maxDb - minDb), 0), 1);

  // Paleta de alto contraste: Negro -> Púrpura -> Naranja -> Amarillo -> Blanco
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Si no hay datos, renderizar pantalla de espera limpia
    if (!espectrograma || espectrograma.numFrames === 0) {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, ancho, alto);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Inicia la escucha para observar el mel-espectrograma en tiempo real',
        ancho / 2,
        alto / 2,
      );
      return;
    }

    const { data, numFrames, numMelBands } = espectrograma;

    // Crear ImageData para renderizado eficiente por píxeles
    const imgData = ctx.createImageData(numFrames, numMelBands);
    const pixelBuffer = imgData.data;

    // En el espectrograma, el eje Y va de baja frecuencia (abajo) a alta (arriba)
    for (let f = 0; f < numFrames; f++) {
      for (let m = 0; m < numMelBands; m++) {
        const db = data[f * numMelBands + m] ?? -100;
        const [r, g, b] = dbToColor(db);

        // Invertir Y para que las frecuencias bajas queden abajo
        const y = numMelBands - 1 - m;
        const x = f;
        const pixelIndex = (y * numFrames + x) * 4;

        pixelBuffer[pixelIndex] = r;
        pixelBuffer[pixelIndex + 1] = g;
        pixelBuffer[pixelIndex + 2] = b;
        pixelBuffer[pixelIndex + 3] = 255;
      }
    }

    // Dibujar en canvas escalando suavemente al tamaño del canvas
    createImageBitmap(imgData)
      .then((bitmap) => {
        ctx.drawImage(bitmap, 0, 0, ancho, alto);
        bitmap.close();

        // Superponer guías de escala de frecuencia y tiempo
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, ancho, 24);
        ctx.fillRect(0, alto - 20, ancho, 20);

        ctx.fillStyle = '#f9fafb';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('15 kHz (Mel sup.)', 8, 16);
        ctx.fillText('0.0 s', 8, alto - 6);

        ctx.textAlign = 'right';
        ctx.fillText(`Ventana #${String(espectrograma.windowIndex)}`, ancho - 8, 16);
        ctx.fillText('3.0 s', ancho - 8, alto - 6);
      })
      .catch(() => {
        // Fallback básico si createImageBitmap no está en este entorno
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, ancho, alto);
      });
  }, [espectrograma, ancho, alto]);

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
          borderRadius: '6px',
          border: '1px solid #374151',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          backgroundColor: '#111827',
        }}
      />
    </div>
  );
}
