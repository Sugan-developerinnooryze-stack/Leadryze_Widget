/** visitorId: crypto.randomUUID(), localStorage — survives reloads/new tabs
 * (same durability model Intercom's own widget identity uses).
 * sessionId: generated per conversation, sessionStorage — dies when the tab
 * closes, survives in-page navigation. Neither round-trips to the server to
 * mint; both are exactly the opaque strings the backend/AI service already
 * expect (no format requirement beyond "non-empty string"). */
const VISITOR_KEY = '__leadryze_visitor_id';
const SESSION_KEY = '__leadryze_session_id';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers lacking crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) { id = uuid(); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch {
    return uuid(); // storage blocked (private browsing) — degrade to a fresh id
  }
}

export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) { id = uuid(); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch {
    return uuid();
  }
}
