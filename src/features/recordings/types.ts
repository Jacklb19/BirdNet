/** How far a clip is on its way to the person's account. */
export type RecordingUpload =
  /** Not sent: still waiting for its detection, for a connection or for the person's permission. */
  | 'pending'
  /** Stored in the account. */
  | 'uploaded'
  /** The server will never take it (its detection belongs to another account or the clip is too large): not retried. */
  | 'rejected';

/** The clip of one song, kept on this phone under the id of its detection. */
export interface StoredRecording {
  /** Id of the detection the clip belongs to. */
  id: string;
  species: string;
  /** ISO timestamp of the detection. */
  recordedAt: string;
  blob: Blob;
  bytes: number;
  upload: RecordingUpload;
}
