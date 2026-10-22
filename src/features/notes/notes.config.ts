/**
 * Settings of the notes and counts a person writes about each record (ADR-40). They are private: they go to the
 * person's account, never to the map of everyone nor to the language model.
 */

/** IndexedDB database and store of the notes; a database of its own, for the reason given in `noteStore.ts`. */
export const NOTES_DATABASE = 'trino-notes-v1';
export const NOTES_STORE = 'notes';
