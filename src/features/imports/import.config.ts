export const IMPORT_CHUNK_FRAMES = 128;
export const IMPORT_MAX_CHANNELS = 8;
export const IMPORT_MAX_SAMPLE_RATE = 192_000;
export const IMPORT_ACTIVITY_EVENT = 'trino-import-activity';
export const IMPORT_FILE_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm';

/**
 * UTC offsets offered for the time a recording was made somewhere else: every whole hour in use plus the half and
 * three-quarter hours some countries keep. An empty choice means the phone's own zone at that date.
 */
export const IMPORT_UTC_OFFSETS = Object.freeze([
  '-12:00', '-11:00', '-10:00', '-09:30', '-09:00', '-08:00', '-07:00', '-06:00', '-05:00', '-04:00', '-03:30', '-03:00', '-02:00', '-01:00',
  '+00:00', '+01:00', '+02:00', '+03:00', '+03:30', '+04:00', '+04:30', '+05:00', '+05:30', '+05:45', '+06:00', '+06:30', '+07:00', '+08:00',
  '+08:45', '+09:00', '+09:30', '+10:00', '+10:30', '+11:00', '+12:00', '+12:45', '+13:00', '+14:00',
] as const);
