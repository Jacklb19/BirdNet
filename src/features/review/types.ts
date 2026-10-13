/** What a person says about a detection: the same three verdicts the API accepts (`ReviewAction`). */
export type ReviewAction = 'confirm' | 'correct' | 'discard';

/** How far a verdict is on its way to the account. */
export type ReviewSync =
  /** Not sent yet: waiting for its detection to be uploaded, for a connection or for a session. */
  | 'pending'
  | 'done'
  /** The server will never take it (the detection belongs to another account): not retried. */
  | 'rejected';

/** The verdict of a person on one detection, kept on this phone under the id of that detection. */
export interface StoredReview {
  /** Id of the detection. */
  id: string;
  action: ReviewAction;
  /** Scientific name of the bird actually heard; set for a correction and only then. */
  species: string | null;
  /** ISO timestamp of the verdict; also tells a newer verdict from the one that was being sent. */
  reviewedAt: string;
  sync: ReviewSync;
}
