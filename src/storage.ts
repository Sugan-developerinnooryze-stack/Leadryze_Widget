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

/** "Start a new conversation" — mints and persists a fresh sessionId,
 * overwriting the current one. The old ChatSession document is untouched
 * (still readable in admin history by its old sessionId); this just stops
 * the widget from appending to it going forward. visitorId (the durable
 * localStorage identity) is deliberately untouched by this. */
export function resetSessionId(): string {
  const id = uuid();
  try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* private browsing */ }
  return id;
}

/** The short-lived (~2h) Human Handoff widget socket token — sessionStorage,
 * same lifetime posture as sessionId itself (dies with the tab, survives an
 * in-page reload), which is exactly the token's own natural scope: it's
 * minted FOR this one sessionId and is useless once that session ends.
 * Stored alongside the sessionId it was minted for so a reload never reuses
 * a token that belonged to a different (expired/replaced) session. */
const HANDOFF_TOKEN_KEY = '__leadryze_handoff_token';
const HANDOFF_TOKEN_SESSION_KEY = '__leadryze_handoff_token_session';

export function getHandoffToken(sessionId: string): string | null {
  try {
    if (sessionStorage.getItem(HANDOFF_TOKEN_SESSION_KEY) !== sessionId) return null;
    return sessionStorage.getItem(HANDOFF_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setHandoffToken(sessionId: string, token: string): void {
  try {
    sessionStorage.setItem(HANDOFF_TOKEN_SESSION_KEY, sessionId);
    sessionStorage.setItem(HANDOFF_TOKEN_KEY, token);
  } catch {
    // Private browsing / storage blocked — the socket simply won't survive
    // a reload mid-handoff; text chat (gated server-side) still works.
  }
}

export function clearHandoffToken(): void {
  try {
    sessionStorage.removeItem(HANDOFF_TOKEN_KEY);
    sessionStorage.removeItem(HANDOFF_TOKEN_SESSION_KEY);
  } catch {
    // no-op
  }
}
