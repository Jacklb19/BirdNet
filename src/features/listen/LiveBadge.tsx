import './LiveBadge.css';

/** "Live" with the recording dot, shown while the microphone is being analysed. */
export function LiveBadge({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <span className="bn-listen-live">
      <span className="bn-listen-live__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
