import { ImportError } from './errors';

/** File timestamps are intentionally absent: the person supplies capture time, or gets relative analysis only. */
export function originalTimestamp(value: string, offset: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(value);
  if (!match) throw new ImportError('metadata');
  const [year, month, day, hour, minute, second = 0] = match.slice(1).map((entry) => Number(entry));
  if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined || year < 1 || month < 1 || month > 12 ||
      day < 1 || day > new Date(Date.UTC(year + 400, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) throw new ImportError('metadata');
  const zone = offset.trim().toUpperCase();
  if (zone && (!/^(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(zone) || (/^[+-]14:/.test(zone) && !zone.endsWith(':00')))) throw new ImportError('metadata');
  const stamp = zone ? `${value.length === 16 ? `${value}:00` : value}${zone}` : value;
  const date = new Date(stamp);
  if (!Number.isFinite(date.getTime()) || (!zone && (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute))) throw new ImportError('metadata');
  return date.toISOString();
}
