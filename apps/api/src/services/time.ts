export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const SEED_NOW = new Date("2026-07-13T09:02:00.000Z");

export function iso(daysAgo = 0, hoursAgo = 0) {
  const next = new Date(SEED_NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000);
  return next.toISOString();
}

export function futureIso(hours = 24) {
  return new Date(SEED_NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function nowIso() {
  return new Date().toISOString();
}
