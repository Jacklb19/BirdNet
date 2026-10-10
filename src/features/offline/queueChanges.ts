import { QUEUE_CHANGE_PARTS, QUEUE_CHANGE_POLL_MS, QUEUE_CHANGED_CHANNEL, type QueueChangePart } from './offline.constants';

/**
 * Change signal of the queue database. It runs in every context that imports the queue store (pages, the
 * inference worker, the service worker), so it uses no DOM or React API.
 *
 * Each part has a version that grows with every change announced or received in this context; views read the
 * version as a dependency and re-read the stores when it changes.
 */
const versions: Record<QueueChangePart, number> = { records: 0, settings: 0, walks: 0 };
const listeners = new Set<() => void>();
/** Open only while this context has listeners; BroadcastChannel never delivers to the object that posted. */
let channel: BroadcastChannel | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

const hasBroadcastChannel = (): boolean => typeof BroadcastChannel !== 'undefined';

function apply(parts: readonly QueueChangePart[]): void {
  for (const part of parts) versions[part] += 1;
  for (const listener of [...listeners]) listener();
}

/** Messages come from the same origin, but only known part names are accepted. */
function parseParts(data: unknown): QueueChangePart[] {
  return Array.isArray(data) ? QUEUE_CHANGE_PARTS.filter((part) => data.includes(part)) : [];
}

/** Called by the queue store after a write has committed; never before, or a reader could see the old data. */
export function announceQueueChange(parts: readonly QueueChangePart[]): void {
  // Listeners in this context hear it directly, also where BroadcastChannel is missing.
  apply(parts);
  if (!hasBroadcastChannel()) return;
  if (channel) { channel.postMessage(parts); return; }
  // Workers and the service worker do not listen, so a short-lived channel reaches the pages.
  const sender = new BroadcastChannel(QUEUE_CHANGED_CHANNEL);
  sender.postMessage(parts);
  sender.close();
}

export function queueVersion(part: QueueChangePart): number {
  return versions[part];
}

function start(): void {
  if (hasBroadcastChannel()) {
    channel = new BroadcastChannel(QUEUE_CHANGED_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const parts = parseParts(event.data);
      if (parts.length) apply(parts);
    };
  } else {
    fallbackTimer = setInterval(() => { apply(QUEUE_CHANGE_PARTS); }, QUEUE_CHANGE_POLL_MS);
  }
}

function stop(): void {
  channel?.close();
  channel = null;
  if (fallbackTimer !== null) clearInterval(fallbackTimer);
  fallbackTimer = null;
}

/** Calls `listener` after every change to the queue database, from any context; returns the unsubscribe function. */
export function subscribeQueueChanges(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    if (!listeners.delete(listener)) return;
    if (listeners.size === 0) stop();
  };
}
