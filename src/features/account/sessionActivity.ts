/** Account operations stop device activity before credentials or local records are removed. */
const activities = new Set<() => Promise<void>>();

export function registerAccountActivity(stop: () => Promise<void>): () => void {
  activities.add(stop);
  return () => { activities.delete(stop); };
}

export async function stopAccountActivity(): Promise<void> {
  await Promise.all([...activities].map((stop) => stop()));
}
