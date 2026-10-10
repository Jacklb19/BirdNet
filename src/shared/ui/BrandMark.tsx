import './BrandMark.css';

/**
 * Logo mark: a singing bird on the sun of "singing now". Coordinates are drawing data in a 32 × 32 box; colors
 * come from tokens.
 */
const SUN = { cx: 16, cy: 16, r: 15 } as const;
const BIRD = 'M7 19c4-.6 6.6-3.6 8-7.4 1.4-3 4.2-4.4 7.2-3.2L25.6 10l-3.4 1.6C21.4 18 16.6 21.8 7 19Z';
const EYE = { cx: 19.6, cy: 11.2, r: 1 } as const;

export interface BrandMarkProps {
  readonly name: string;
}

/** Mark plus wordmark; the wordmark is real text so it scales, translates and stays accessible. */
export function BrandMark({ name }: BrandMarkProps): React.JSX.Element {
  return (
    <span className="bn-brand">
      <svg className="bn-brand__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle className="bn-brand__sun" cx={SUN.cx} cy={SUN.cy} r={SUN.r} />
        <path className="bn-brand__bird" d={BIRD} />
        <circle className="bn-brand__sun" cx={EYE.cx} cy={EYE.cy} r={EYE.r} />
      </svg>
      <span className="bn-brand__name">{name}</span>
    </span>
  );
}
