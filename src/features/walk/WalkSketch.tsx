import { useMemo } from 'react';
import type { TrackPoint } from '../offline/types';
import { sketchWalk } from './sketchGeometry';
import './WalkSketch.css';

/** Canvas of the drawing, in SVG user units; the element itself scales to its container. */
const SIZES = Object.freeze({
  large: { width: 320, height: 200, padding: 18 },
  thumb: { width: 64, height: 48, padding: 6 },
});

export interface WalkSketchProps {
  readonly track: readonly TrackPoint[];
  readonly marks?: readonly { readonly latitude: number; readonly longitude: number }[];
  /** Describes the drawing to screen readers; empty when the figures next to it already say it all. */
  readonly label: string;
  readonly size?: keyof typeof SIZES;
}

/**
 * The walk drawn as a dotted trail that draws itself, from a filled start to a ringed end, with the places a bird
 * was heard as yellow dots: the shape of the walk at a glance, without map tiles or a connection.
 */
export function WalkSketch({ track, marks = [], label, size = 'large' }: WalkSketchProps): React.JSX.Element {
  const { width, height, padding } = SIZES[size];
  const sketch = useMemo(() => sketchWalk(track, marks, width, height, padding), [track, marks, width, height, padding]);
  const points = sketch.path.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const start = sketch.path[0];
  const end = sketch.path.at(-1);
  return (
    <svg className={`bn-walk-sketch bn-walk-sketch--${size}`} viewBox={`0 0 ${String(width)} ${String(height)}`}
      role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      {sketch.path.length > 1 && <polyline className="bn-walk-sketch__trail" points={points} pathLength={1} />}
      {sketch.marks.map((mark, index) => (
        // The dots appear along the trail as it draws itself.
        <circle key={index} className="bn-walk-sketch__mark" cx={mark.x} cy={mark.y}
          style={{ animationDelay: `calc(var(--duration-sky) * ${String(index / Math.max(1, sketch.marks.length))})` }} />
      ))}
      {start && <circle className="bn-walk-sketch__start" cx={start.x} cy={start.y} />}
      {end && sketch.path.length > 1 && <circle className="bn-walk-sketch__end" cx={end.x} cy={end.y} />}
    </svg>
  );
}
