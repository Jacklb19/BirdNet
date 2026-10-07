import { chorusBars } from '../../features/sites/chorus';
import './ChorusClock.css';

/** Drawing geometry in SVG user units (viewBox 260 × 260); colors and type come from tokens via CSS. */
const GEOMETRY = { size: 260, center: 130, ring: 70, tickLong: 14, tickShort: 9, tickInset: 6, barGap: 6, barMin: 4, barMax: 40, labelRadius: 46 } as const;
const HOURS_PER_DAY = 24;
const LABELLED_HOURS = [0, 6, 12, 18] as const;

export interface ChorusClockProps {
  /** Detections per local hour, index 0 = midnight. */
  readonly hourly: readonly number[];
  readonly value: string;
  readonly unit: string;
  /** Full sentence describing the chart for screen readers. */
  readonly description: string;
  readonly className?: string;
}

const angle = (hour: number): number => (hour / HOURS_PER_DAY) * Math.PI * 2 - Math.PI / 2;
const point = (hour: number, radius: number): [number, number] => [GEOMETRY.center + radius * Math.cos(angle(hour)), GEOMETRY.center + radius * Math.sin(angle(hour))];

/** The signature chart: one radial bar per hour; the busiest hour is drawn in ink. */
export function ChorusClock({ hourly, value, unit, description, className }: ChorusClockProps): React.JSX.Element {
  const bars = chorusBars(hourly);
  const { size, center, ring } = GEOMETRY;
  return (
    <figure className={['bn-chorus', className ?? ''].filter(Boolean).join(' ')}>
      <svg viewBox={`0 0 ${String(size)} ${String(size)}`} role="img" aria-label={description}>
        <circle className="bn-chorus__ring" cx={center} cy={center} r={ring} />
        {bars.map((bar) => {
          const major = bar.hour % (HOURS_PER_DAY / LABELLED_HOURS.length) === 0;
          const [x1, y1] = point(bar.hour, ring - GEOMETRY.tickInset);
          const [x2, y2] = point(bar.hour, ring - (major ? GEOMETRY.tickLong : GEOMETRY.tickShort));
          const tick = <line key={`t${String(bar.hour)}`} className={major ? 'bn-chorus__tick bn-chorus__tick--major' : 'bn-chorus__tick'} x1={x1} y1={y1} x2={x2} y2={y2} />;
          if (!bar.count) return tick;
          const start = ring + GEOMETRY.barGap;
          const [bx1, by1] = point(bar.hour, start);
          const [bx2, by2] = point(bar.hour, start + GEOMETRY.barMin + bar.length * GEOMETRY.barMax);
          return [tick, <line key={`b${String(bar.hour)}`} className={bar.peak ? 'bn-chorus__bar bn-chorus__bar--peak' : 'bn-chorus__bar'} x1={bx1} y1={by1} x2={bx2} y2={by2} />];
        })}
        {LABELLED_HOURS.map((hour) => {
          const [x, y] = point(hour, GEOMETRY.labelRadius);
          return <text key={hour} className="bn-chorus__hour" x={x} y={y} textAnchor="middle" dominantBaseline="central">{String(hour).padStart(2, '0')}</text>;
        })}
        <text className="bn-chorus__value" x={center} y={center} textAnchor="middle" dominantBaseline="central">{value}</text>
        <text className="bn-chorus__unit" x={center} y={center + GEOMETRY.labelRadius / 2} textAnchor="middle" dominantBaseline="central">{unit}</text>
      </svg>
    </figure>
  );
}
