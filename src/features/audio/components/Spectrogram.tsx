import { useEffect, useRef, type CSSProperties } from 'react';
import { useReducedMotion } from '../../../shared/useReducedMotion';
import { useTheme, type ResolvedTheme } from '../../../theme';
import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import type { MelSpectrogramResponse } from '../worker/mel-spectrogram.protocol';
import {
  SONOGRAM_TOKENS, SPECTROGRAM_COLOR_STEPS, SPECTROGRAM_FRAMES_PER_HOP, SPECTROGRAM_FREQUENCY_TICKS,
  SPECTROGRAM_HISTORY_COLUMNS, SPECTROGRAM_TICK_STEP_HZ,
} from './spectrogram.config';
import { SpectrogramHistory, type SpectrogramLayout, type SpectrogramRamps } from './spectrogramHistory';
import { buildRamp, frequencyTicks, spectrogramLevel, type Rgba } from './spectrogramScale';
import './Spectrogram.css';

export interface SpectrogramProps {
  /** Latest analysed window; null clears the picture (a new session starts). */
  readonly spectrogram: MelSpectrogramResponse | null;
  /** Text alternative of the picture. */
  readonly label: string;
  /** Axis label of a frequency in hertz; `withUnit` is set on the highest label only, the others share its unit. */
  readonly formatFrequency: (hz: number, withUnit: boolean) => string;
  /** Shown over the empty picture before any sound arrives. */
  readonly placeholder?: string;
}

const TICKS = frequencyTicks(
  AUDIO_CONSTANTS.MIN_FREQUENCY_HZ, AUDIO_CONSTANTS.MAX_FREQUENCY_HZ, SPECTROGRAM_FREQUENCY_TICKS, SPECTROGRAM_TICK_STEP_HZ,
);

const TRANSPARENT: Rgba = [0, 0, 0, 0];

const toLevel = (db: number): number => spectrogramLevel(db, AUDIO_CONSTANTS.SPECTROGRAM_DB_RANGE, SPECTROGRAM_COLOR_STEPS);

/** Off-screen picture one pixel per frame and band; the visible canvas scales it to its own size. */
interface Painter {
  readonly history: SpectrogramHistory;
  readonly buffer: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly image: ImageData;
  ramps: SpectrogramRamps | null;
  theme: ResolvedTheme | null;
}

function createPainter(bands: number): Painter | null {
  const buffer = document.createElement('canvas');
  buffer.width = SPECTROGRAM_HISTORY_COLUMNS;
  buffer.height = bands;
  const context = buffer.getContext('2d');
  if (!context) return null;
  return {
    history: new SpectrogramHistory(SPECTROGRAM_HISTORY_COLUMNS, bands),
    buffer, context, image: context.createImageData(SPECTROGRAM_HISTORY_COLUMNS, bands), ramps: null, theme: null,
  };
}

/**
 * Colour ramps from the sonogram tokens of the active theme. Tokens may use any CSS colour syntax, so each is
 * resolved by painting it on a one-pixel canvas. Quiet sound fades to transparent and lets the card show.
 */
function readRamps(element: Element): SpectrogramRamps | null {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const style = getComputedStyle(element);
  const color = (token: string): Rgba => {
    const value = style.getPropertyValue(token).trim();
    if (!value) return TRANSPARENT;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue, alpha];
  };
  const faint = color(SONOGRAM_TOKENS.faint);
  const silence: Rgba = [faint[0], faint[1], faint[2], 0];
  const mid = color(SONOGRAM_TOKENS.mid);
  return {
    history: buildRamp([silence, faint, mid, color(SONOGRAM_TOKENS.ink)], SPECTROGRAM_COLOR_STEPS),
    latest: buildRamp([silence, faint, mid, color(SONOGRAM_TOKENS.mark)], SPECTROGRAM_COLOR_STEPS),
  };
}

/** Scales the off-screen picture onto the visible canvas at the screen's pixel density. */
function present(painter: Painter, canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.clearRect(0, 0, width, height);
  if (painter.history.empty) return;
  context.imageSmoothingEnabled = true;
  context.drawImage(painter.buffer, 0, 0, width, height);
}

/**
 * Live mel spectrogram: time runs left to right over the last seconds, frequency bottom to top on the mel
 * scale of the analysis, and the newest window is drawn in the accent colour. With reduced motion the
 * picture fills in place instead of scrolling.
 */
export function Spectrogram({ spectrogram, label, formatFrequency, placeholder }: SpectrogramProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<Painter | null>(null);
  const { resolved } = useTheme();
  const layout: SpectrogramLayout = useReducedMotion() ? 'sweep' : 'scroll';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bands = spectrogram?.numMelBands ?? AUDIO_CONSTANTS.NUM_MEL_BANDS;
    if (painterRef.current?.history.bands !== bands) painterRef.current = createPainter(bands);
    const painter = painterRef.current;
    if (!painter) return;
    if (spectrogram) painter.history.append(spectrogram, SPECTROGRAM_FRAMES_PER_HOP, toLevel);
    else painter.history.clear();
    // The theme provider applies the new palette before descendants' effects run, so the tokens read here are current.
    if (painter.theme !== resolved) {
      painter.ramps = readRamps(canvas);
      painter.theme = resolved;
    }
    if (painter.ramps) {
      painter.history.paint(layout, painter.ramps, painter.image.data);
      painter.context.putImageData(painter.image, 0, 0);
    }
    present(painter, canvas);
  }, [spectrogram, layout, resolved]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (painterRef.current) present(painterRef.current, canvas);
    });
    observer.observe(canvas);
    return () => { observer.disconnect(); };
  }, []);

  const highest = TICKS.at(-1);
  return (
    <div className="bn-audio-spectrogram">
      <div className="bn-audio-spectrogram__axis" aria-hidden="true">
        {highest && <span className="bn-audio-spectrogram__sizer">{formatFrequency(highest.hz, true)}</span>}
        {TICKS.map((tick) => (
          <span key={tick.hz} className="bn-audio-spectrogram__tick" style={{ '--spectrogram-tick-position': String(tick.position) } as CSSProperties}>
            {formatFrequency(tick.hz, tick === highest)}
          </span>
        ))}
      </div>
      <div className="bn-audio-spectrogram__plot">
        <canvas ref={canvasRef} className="bn-audio-spectrogram__canvas" role="img" aria-label={label} />
        {placeholder && <p className="bn-audio-spectrogram__placeholder" aria-hidden="true">{placeholder}</p>}
      </div>
    </div>
  );
}
