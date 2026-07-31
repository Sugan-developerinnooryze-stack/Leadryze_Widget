import { API_BASE_URL } from './config';
import { getVisitorId, getSessionId } from './storage';
import { WidgetUI, WidgetConfig } from './ui';

/** Reads a data-* attribute off the <script> tag itself — works whether this
 * script is the currently-executing one (normal case) or, defensively, by
 * falling back to a query-selector match in case some host page's own
 * script-loading setup strips `document.currentScript` (e.g. dynamic
 * injection via innerHTML). */
function readScriptAttr(name: string): string | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current?.dataset[name]) return current.dataset[name] as string;
  const fallback = document.querySelector(`script[data-${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]`) as HTMLScriptElement | null;
  return (fallback?.dataset[name] as string) ?? null;
}

function getWidgetKey(): string | null {
  return readScriptAttr('widgetKey');
}

/** The API base URL is normally baked in at build time (API_BASE_URL,
 * pointing at wherever this bundle was built to talk to) — but an optional
 * `data-api-url` attribute on the embed snippet overrides it at runtime, with
 * no rebuild required. This is what makes local/live UAT testing practical:
 * the exact same deployed widget.js can be pointed at a local backend
 * (`data-api-url="http://localhost:5000/api/v1"`) for one test page, and left
 * on the real deployed backend everywhere else, just by changing the <script>
 * tag's own attributes. */
function getApiBaseUrl(): string {
  return readScriptAttr('apiUrl') || API_BASE_URL;
}

async function fetchConfig(widgetKey: string, apiBaseUrl: string): Promise<WidgetConfig | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/public/widget/config?widgetKey=${encodeURIComponent(widgetKey)}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as WidgetConfig;
  } catch {
    return null;
  }
}

async function sendChat(apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string, message: string): Promise<string> {
  try {
    const res = await fetch(`${apiBaseUrl}/public/widget/chat?widgetKey=${encodeURIComponent(widgetKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, visitorId, message, pageUrl: location.href }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      return body.message || "Sorry, I'm having trouble responding right now.";
    }
    return body.data?.response ?? "Sorry, I didn't catch that.";
  } catch {
    return "Sorry, I'm having trouble connecting right now. Please try again shortly.";
  }
}

async function init(): Promise<void> {
  const widgetKey = getWidgetKey();
  if (!widgetKey) {
    console.warn('[LeadRyze Widget] Missing data-widget-key on the <script> tag — widget not loaded.');
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  const config = await fetchConfig(widgetKey, apiBaseUrl);
  if (!config) {
    console.warn('[LeadRyze Widget] Could not load widget config (disabled, unknown key, or disallowed origin) — widget not loaded.');
    return;
  }

  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  const ui = new WidgetUI(config, async (message) => {
    ui.setBusy(true);
    const reply = await sendChat(apiBaseUrl, widgetKey, sessionId, visitorId, message);
    ui.addMessage('assistant', reply);
    ui.setBusy(false);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); });
} else {
  void init();
}
