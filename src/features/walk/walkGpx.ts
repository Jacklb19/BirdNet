/**
 * A walk as a GPX 1.1 file (ADR-35): the path as a track and each place a bird was heard as a waypoint. Built on
 * the phone from what it keeps, or from what the account returns, so it needs no connection when the walk is here.
 * Every coordinate is a cell of the ~10 m grid: the file never holds more than the phone stored.
 */
import { LOCATION_GRID_DECIMALS } from '../../config/contract';
import type { TrackPoint } from '../offline/types';

export const GPX_MIME_TYPE = 'application/gpx+xml';
const GPX_NAMESPACE = 'http://www.topografix.com/GPX/1/1';
const MILLISECONDS_PER_SECOND = 1000;

export interface GpxWaypoint {
  readonly latitude: number;
  readonly longitude: number;
  /** Epoch milliseconds. */
  readonly time: number;
  readonly name: string;
  readonly description: string;
}

export interface GpxWalk {
  readonly name: string;
  /** Epoch milliseconds. */
  readonly startedAt: number;
  readonly track: readonly TrackPoint[];
  readonly waypoints: readonly GpxWaypoint[];
  /** Application named in the file. */
  readonly creator: string;
}

const XML_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' });

/** Text as XML content or attribute value; characters XML 1.0 cannot carry at all are dropped. */
export function escapeXml(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex -- removing the control characters XML forbids is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

const coordinate = (value: number): string => value.toFixed(LOCATION_GRID_DECIMALS);
const isoTime = (epoch: number): string => new Date(epoch).toISOString();

function position(latitude: number, longitude: number): string {
  return `lat="${coordinate(latitude)}" lon="${coordinate(longitude)}"`;
}

/** The GPX document; points without a time (walks from before S10) are written without one. */
export function walkGpx(walk: GpxWalk): string {
  const name = escapeXml(walk.name);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(walk.creator)}" xmlns="${GPX_NAMESPACE}">`,
    `  <metadata><name>${name}</name><time>${isoTime(walk.startedAt)}</time></metadata>`,
    // GPX orders waypoints before tracks.
    ...walk.waypoints.map((point) =>
      `  <wpt ${position(point.latitude, point.longitude)}><time>${isoTime(point.time)}</time><name>${escapeXml(point.name)}</name><desc>${escapeXml(point.description)}</desc></wpt>`),
    `  <trk><name>${name}</name><trkseg>`,
    ...walk.track.map((point) => {
      const seconds = point[2];
      const time = seconds === undefined ? '' : `<time>${isoTime(walk.startedAt + seconds * MILLISECONDS_PER_SECOND)}</time>`;
      return `    <trkpt ${position(point[0], point[1])}>${time}</trkpt>`;
    }),
    '  </trkseg></trk>',
    '</gpx>',
    '',
  ];
  return lines.join('\n');
}
