import { API_BASE_URL } from './config';
import { getVisitorId, getSessionId } from './storage';
import { WidgetUI, WidgetConfig } from './ui';
import { isVoiceSupported, VoiceRecorder } from './voice/recorder';
import { sendVoiceChat } from './voice/voice-api';
import { VoicePlayer } from './voice/player';
import { VoiceUiState } from './voice/types';
import { ContinuousVoiceSession } from './voice/continuous';

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

interface HistoryMessage { role: 'user' | 'assistant'; content: string; timestamp: string; channel: string; }

/** Rehydrates the full conversation (text + push-to-talk + continuous voice,
 * all interleaved in the same shared timeline) across a widget reload —
 * previously the widget always started blank except for the static
 * greeting. Failure here (network error, brand-new session with no prior
 * history) is silent and non-fatal — init() simply falls through to today's
 * exact behavior (the greeting, an empty message list) either way. */
async function fetchHistory(
  apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string,
): Promise<HistoryMessage[]> {
  try {
    const url = `${apiBaseUrl}/public/widget/history?widgetKey=${encodeURIComponent(widgetKey)}` +
      `&sessionId=${encodeURIComponent(sessionId)}&visitorId=${encodeURIComponent(visitorId)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = await res.json();
    return (body.data?.messages as HistoryMessage[]) ?? [];
  } catch {
    return [];
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

  // Feature-detected here, not just left to the tenant's own toggle — an
  // unsupported browser never sees a mic button at all, per ui.ts's own
  // "always render-safe" contract on WidgetConfig.voiceEnabled.
  config.voiceEnabled = !!config.voiceEnabled && isVoiceSupported();
  // Same feature-detection posture as push-to-talk above — continuous mode
  // needs the same getUserMedia support, so it's gated identically.
  config.continuousVoiceEnabled = !!config.continuousVoiceEnabled && isVoiceSupported();

  // Fetched BEFORE constructing WidgetUI (which would otherwise render
  // config.greeting unconditionally in its constructor) — a real, non-empty
  // history means this is a reload/reopen of an existing conversation, not
  // a brand-new one, so the static greeting is suppressed in favor of the
  // real prior transcript. A brand-new session (empty history) falls
  // through to today's exact behavior unchanged.
  const history = await fetchHistory(apiBaseUrl, widgetKey, sessionId, visitorId);
  if (history.length > 0) config.greeting = '';

  let voiceState: VoiceUiState = 'idle';
  const recorder = new VoiceRecorder();
  let player: VoicePlayer | null = null;
  const liveSession = new ContinuousVoiceSession();

  const ui = new WidgetUI(
    config,
    async (message) => {
      ui.setBusy(true);
      const reply = await sendChat(apiBaseUrl, widgetKey, sessionId, visitorId, message);
      ui.addMessage('assistant', reply);
      ui.setBusy(false);
    },
    config.voiceEnabled ? () => { void handleMicClick(); } : undefined,
    config.continuousVoiceEnabled ? () => { void handleLiveToggle(); } : undefined,
  );

  for (const m of history) ui.addMessage(m.role, m.content);

  if (config.voiceEnabled) player = new VoicePlayer(ui.getShadowRoot());

  const setVoiceState = (state: VoiceUiState): void => {
    voiceState = state;
    ui.setVoiceState(state);
  };

  // Declared as const arrow expressions (not `function` declarations) so
  // TypeScript's control-flow narrowing of `widgetKey`/`config` (checked
  // above) actually carries through — narrowing doesn't cross hoisted
  // function-declaration boundaries, only closures created after the check.
  const stopAndSend = async (): Promise<void> => {
    setVoiceState('uploading');
    const { blob, durationSeconds } = await recorder.stop();
    if (!blob.size) { setVoiceState('idle'); return; }

    setVoiceState('thinking');
    const result = await sendVoiceChat(apiBaseUrl, widgetKey, sessionId, visitorId, blob, durationSeconds);
    if (!result) {
      ui.addMessage('assistant', "Sorry, I'm having trouble with voice right now — please try typing instead.");
      setVoiceState('idle');
      return;
    }

    if (result.transcript) ui.addMessage('user', result.transcript);
    ui.addMessage('assistant', result.response);

    if (result.audio && result.audioFormat && player && config.voiceAutoPlay !== false) {
      setVoiceState('speaking');
      const played = await player.play(result.audio, result.audioFormat);
      if (!played) ui.addPlayFallback(() => player?.replay());
    }
    setVoiceState('idle');
  };

  const handleMicClick = async (): Promise<void> => {
    if (voiceState === 'idle') {
      try {
        await recorder.start(() => { void stopAndSend(); }); // auto-stop at 60s
        setVoiceState('recording');
      } catch {
        // Permission denied or no device available — never dead-ends the
        // conversation, the text input stays fully usable.
        setVoiceState('idle');
      }
      return;
    }
    if (voiceState === 'recording') {
      await stopAndSend();
    }
  };

  const handleLiveToggle = async (): Promise<void> => {
    if (liveSession.isActive) {
      await liveSession.stop();
      return;
    }
    // worker.ts's session.say() speaks the agent's very first utterance in
    // every call, and that speech gets transcribed back through
    // onAgentTranscript just like any other turn. When it's the SAME text
    // as the static config.greeting bubble WidgetUI's constructor already
    // rendered the moment the widget opened, the live transcript would
    // otherwise show as a second, identical bubble — suppressed below.
    //
    // Real, confirmed gap this closes: worker.ts's voice greeting is no
    // longer always config.greeting verbatim — it's now often built
    // dynamically per-tenant from the site's own crawled content (see
    // buildDynamicGreeting() in worker.ts), which is frequently DIFFERENT
    // text than the static bubble. Blindly suppressing "whatever the first
    // segment is" on the old assumption that it always duplicates the
    // static bubble silently hid every dynamic greeting's transcript
    // entirely — the visitor heard it (real audio, confirmed by TTS
    // billing) but never saw it as text. Now only actually suppressed once
    // the first segment's FINAL text is confirmed to genuinely match the
    // static bubble; a different greeting renders normally like any other
    // turn, just without the earlier interim/streaming updates for that
    // one segment (an acceptable simplification — it still appears in full
    // the moment its transcription completes).
    const normaliseForCompare = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[!.,]+$/g, '');
    let firstAgentSegmentId: string | null = null;
    let awaitingGreetingVerdict = !!config.greeting;

    // continuous.ts's own start()/stop() already call onStateChange at every
    // transition (including the initial 'connecting' and every terminal
    // 'idle' state, on success or failure alike) — loader.ts doesn't need to
    // separately manage the UI's call state itself.
    await liveSession.start(apiBaseUrl, widgetKey, sessionId, visitorId, {
      onStateChange: (state, message) => ui.setCallState(state, message),
      onUserTranscript: (seg) => ui.upsertMessage(seg.id, 'user', seg.text, seg.final),
      onAgentTranscript: (seg) => {
        if (awaitingGreetingVerdict) {
          if (firstAgentSegmentId === null) firstAgentSegmentId = seg.id;
          if (seg.id === firstAgentSegmentId) {
            if (!seg.final) return; // hold interim updates until we know whether this is the duplicate
            awaitingGreetingVerdict = false;
            if (normaliseForCompare(seg.text) === normaliseForCompare(config.greeting)) return; // genuine duplicate — already shown as the static bubble
            // A real, different greeting — render it now, in full.
          } else {
            awaitingGreetingVerdict = false; // a genuinely new segment arrived before the first one finalised
          }
        }
        ui.upsertMessage(seg.id, 'assistant', seg.text, seg.final);
      },
    }, ui.getShadowRoot());
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); });
} else {
  void init();
}
