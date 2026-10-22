/** Settings of "Rendimiento de este teléfono" (S11): what is measured per listening session and how long it is kept. */

export const PERFORMANCE_LIMITS = Object.freeze({
  /** Sessions kept on the phone, newest first. */
  sessionsKept: 10,
  /** Latencies kept per session: more than an hour of windows at one every 1.5 s. */
  maxWindowsKept: 4000,
  /** Shorter sessions give no battery figure: the level moves in steps of 1 %, too coarse for a few minutes. */
  minBatterySeconds: 15 * 60,
  /** Sessions with no window analysed (stopped while the model loaded) are not kept. */
  minWindowsToKeep: 1,
});

/** Targets of the specification the summary is compared with (table 5). */
export const PERFORMANCE_TARGETS = Object.freeze({
  /** RNF-01: a 3-second window is analysed in under 1.5 s. */
  windowMs: 1500,
  /** RNF-02: no window lost. */
  droppedShare: 0,
  /** RNF-03: no main-thread task over 50 ms while listening. */
  longTaskMs: 50,
  /** RNF-04: under 25 % of the battery per hour of listening. */
  batteryPerHour: 25,
});
