import './BrandMark.css';

/**
 * Logo mark from the design file (brand/logo): a dial of ticks like the chorus clock, the bird in brand
 * green and the sun in amber. Coordinates are drawing data in a 40 × 46 box; colors come from tokens.
 */
const TICKS = [
  'M20 10V5', 'M23.36 10.44L24.27 7.06', 'M26.5 11.74L28.25 8.71', 'M29.19 13.81L31.67 11.33', 'M32.56 26.36L35.94 27.27',
  'M31.26 29.5L34.29 31.25', 'M29.19 32.19L31.67 34.67', 'M26.5 34.26L28.25 37.29', 'M23.36 35.56L24.27 38.94', 'M20 36V41',
  'M16.64 35.56L15.73 38.94', 'M13.5 34.26L11.75 37.29', 'M10.81 32.19L8.33 34.67', 'M8.74 29.5L5.71 31.25', 'M7.44 26.36L4.06 27.27',
  'M7 23H2', 'M7.44 19.64L4.06 18.73', 'M8.74 16.5L5.71 14.75', 'M10.81 13.81L8.33 11.33', 'M13.5 11.74L11.75 8.71', 'M16.64 10.44L15.73 7.06',
] as const;
const SUN = { cx: 34.97, cy: 18.99, r: 3.6 } as const;
const BIRD = 'M13.5 25.5C16.5 25.3 18.5 23.5 19.7 20.7C20.7 18.4 22.7 17.3 25 18.1L27.5 19L24.9 20.3C24.3 24.9 20.7 27.7 13.5 25.5Z';

export interface BrandMarkProps {
  readonly name: string;
  readonly edition: string;
}

/** Mark plus wordmark; the wordmark is real text so it scales, translates and stays accessible. */
export function BrandMark({ name, edition }: BrandMarkProps): React.JSX.Element {
  return (
    <span className="bn-brand">
      <svg className="bn-brand__mark" viewBox="0 0 40 46" aria-hidden="true" focusable="false">
        {TICKS.map((d) => <path key={d} className="bn-brand__tick" d={d} />)}
        <circle className="bn-brand__sun" cx={SUN.cx} cy={SUN.cy} r={SUN.r} />
        <path className="bn-brand__bird" d={BIRD} />
      </svg>
      <span className="bn-brand__text">
        <span className="bn-brand__name">{name}</span>
        <span className="bn-brand__edition">{edition}</span>
      </span>
    </span>
  );
}
