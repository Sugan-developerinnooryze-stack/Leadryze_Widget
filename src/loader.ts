import { io as ioClient, Socket } from 'socket.io-client';
import { API_BASE_URL } from './config';
import { getVisitorId, getSessionId, resetSessionId, getHandoffToken, setHandoffToken, clearHandoffToken } from './storage';
import { WidgetUI, WidgetConfig, DatasetItemCard, HandoffUiState } from './ui';
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

interface HistoryMessage { role: 'user' | 'assistant' | 'staff' | 'system'; content: string; timestamp: string; channel: string; }

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

interface ChatReply {
  response: string;
  items?: DatasetItemCard[];
  totalMatches?: number;
  /** True while this session is handed off to a human — set by the backend's
   * AI-pause gate (public-widget.controller.ts's postChat()). `response` is
   * always empty in that case; the real reply, if any, arrives over the
   * handoff socket instead, not in this HTTP response. */
  humanMode?: boolean;
}

async function sendChat(apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string, message: string): Promise<ChatReply> {
  try {
    const res = await fetch(`${apiBaseUrl}/public/widget/chat?widgetKey=${encodeURIComponent(widgetKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, visitorId, message, pageUrl: location.href }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      return { response: body.message || "Sorry, I'm having trouble responding right now." };
    }
    return {
      response: body.data?.response ?? "Sorry, I didn't catch that.",
      items: body.data?.items,
      totalMatches: body.data?.totalMatches,
      humanMode: body.data?.humanMode,
    };
  } catch {
    return { response: "Sorry, I'm having trouble connecting right now. Please try again shortly." };
  }
}

interface HandoffRequestResult { status: string; widgetToken: string; waitingMessage: string; }

/** Visitor clicks "Connect with an expert" — mints the short-lived widget
 * socket token server-side (see public-widget.controller.ts's
 * postHandoffRequest). Returns null on any failure (feature off, network
 * error, tenant misconfigured) — callers must degrade to "button stays
 * idle, nothing changes," never a half-started handoff. */
async function requestHandoff(
  apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string,
): Promise<HandoffRequestResult | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/public/widget/handoff/request?widgetKey=${encodeURIComponent(widgetKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, visitorId, pageUrl: location.href }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) return null;
    return body.data as HandoffRequestResult;
  } catch {
    return null;
  }
}

interface HandoffState { mode: 'ai' | 'human'; handoffStatus: 'none' | 'waiting' | 'claimed'; assignedToName?: string; }

/** One-time catch-up check on widget open — NOT polled. Only ever called
 * when the tenant has the feature on, so an ordinary tenant pays zero extra
 * requests. Lets a visitor who reloads the page mid-handoff see the correct
 * bar state immediately, instead of it silently resetting to idle. */
async function fetchHandoffState(
  apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string,
): Promise<HandoffState | null> {
  try {
    const url = `${apiBaseUrl}/public/widget/handoff/history?widgetKey=${encodeURIComponent(widgetKey)}` +
      `&sessionId=${encodeURIComponent(sessionId)}&visitorId=${encodeURIComponent(visitorId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as HandoffState;
  } catch {
    return null;
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
  // Reassigned by the header's "start a new conversation" reset button
  // (see handleReset below) — every closure that reads `sessionId` below
  // does so at call time, not at definition time, so a reset correctly
  // takes effect for every subsequent send/claim/etc. without needing to
  // re-run init() or reconstruct the UI.
  let sessionId = getSessionId();
  // Captured before config.greeting is ever conditionally blanked out below
  // — resetConversation() always wants the tenant's real configured
  // greeting, never whatever history happened to suppress it to on load.
  const originalGreeting = config.greeting;

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

  // Backward-compat gate per ui.ts's own contract: an absent/falsy value
  // must behave as OFF, never "on by default." Only checked here — and only
  // ever fetches the extra handoff-state endpoint — when explicitly true.
  const humanHandoffEnabled = config.humanHandoffEnabled === true;
  const initialHandoffState = humanHandoffEnabled
    ? await fetchHandoffState(apiBaseUrl, widgetKey, sessionId, visitorId)
    : null;

  let voiceState: VoiceUiState = 'idle';
  const recorder = new VoiceRecorder();
  let player: VoicePlayer | null = null;
  const liveSession = new ContinuousVoiceSession();

  const ui = new WidgetUI(
    config,
    async (message) => {
      ui.setBusy(true);
      const reply = await sendChat(apiBaseUrl, widgetKey, sessionId, visitorId, message);
      if (reply.humanMode) {
        // The visitor's own bubble was already rendered by sendText() before
        // onSend fired — the real staff reply, if any, arrives over the
        // handoff socket, not in this HTTP response. Nothing more to render.
        ui.setBusy(false);
        return;
      }
      ui.addMessage('assistant', reply.response, reply.items, reply.totalMatches, message);
      ui.setBusy(false);
    },
    config.voiceEnabled ? () => { void handleMicClick(); } : undefined,
    config.continuousVoiceEnabled ? () => { void handleLiveToggle(); } : undefined,
    humanHandoffEnabled ? () => { void handleRequestHuman(); } : undefined,
    () => handleReset(),
  );

  // 'system' messages (join/claim/hand-back audit events) are for the staff
  // inbox's own thread view, not this widget — a visitor sees the hand-back
  // moment via its own dedicated addMessage() call below instead. 'staff'
  // renders visually like any other reply from "the other side."
  for (const m of history) {
    if (m.role === 'system') continue;
    ui.addMessage(m.role === 'staff' ? 'assistant' : m.role, m.content);
  }

  if (config.voiceEnabled) player = new VoicePlayer(ui.getShadowRoot());

  const setVoiceState = (state: VoiceUiState): void => {
    voiceState = state;
    ui.setVoiceState(state);
  };

  // Human Handoff — the widget's own Socket.IO connection, opened lazily
  // (only once a handoff actually exists for this visitor), never on every
  // widget load. Uses the narrowly-scoped widget token minted by
  // postHandoffRequest — see server.ts's io.use for the matching
  // verification branch; this socket structurally cannot join any room but
  // its own session:{id}, even if it tried.
  let handoffSocket: Socket | null = null;

  const onHandoffClaimed = (payload: { assignedToName?: string }): void => {
    ui.setHandoffState('claimed', payload.assignedToName);
  };
  // Only 'staff'-authored messages are rendered here — the visitor's OWN
  // messages are already rendered synchronously by sendText() the moment
  // they're typed; the session room echoes every message to both sides, so
  // rendering role:'user' here too would duplicate the visitor's own bubble.
  const onHandoffMessage = (payload: { role: string; content: string }): void => {
    if (payload.role === 'staff') ui.addMessage('assistant', payload.content);
  };
  const onHandoffClosed = (): void => {
    ui.setHandoffState('idle');
    ui.addMessage('assistant', "You're back with the AI assistant.");
    clearHandoffToken();
    handoffSocket?.disconnect();
    handoffSocket = null;
  };

  const connectHandoffSocket = (token: string): void => {
    handoffSocket?.disconnect();
    handoffSocket = ioClient(new URL(apiBaseUrl).origin, { auth: { token } });
    handoffSocket.on('connect', () => handoffSocket?.emit('join-own-session'));
    // A connection failure here (CORS, expired token, server unreachable)
    // would otherwise be entirely silent to a visitor and to whoever's
    // debugging it — logged, not surfaced in the UI, since this is a
    // best-effort live-push channel and text chat still works via the
    // normal gated HTTP path regardless.
    handoffSocket.on('connect_error', (err) => {
      console.warn('[LeadRyze Widget] Handoff socket connection failed:', err.message);
    });
    handoffSocket.on('handoff:claimed', onHandoffClaimed);
    handoffSocket.on('handoff:message', onHandoffMessage);
    handoffSocket.on('handoff:closed', onHandoffClosed);
  };

  const handleRequestHuman = async (): Promise<void> => {
    ui.setHandoffState('waiting');
    const result = await requestHandoff(apiBaseUrl, widgetKey, sessionId, visitorId);
    if (!result) {
      ui.setHandoffState('idle');
      ui.addMessage('assistant', "Sorry, we couldn't connect you with a team member right now — please try again shortly.");
      return;
    }
    setHandoffToken(sessionId, result.widgetToken);
    if (result.waitingMessage) ui.addMessage('assistant', result.waitingMessage);
    connectHandoffSocket(result.widgetToken);
  };

  // Header "start a new conversation" button — tears down any live handoff
  // connection (a fresh session has no active handoff), mints a brand-new
  // sessionId so subsequent messages land in a NEW ChatSession document
  // rather than appending to the old one (which is left exactly as-is, not
  // deleted — still visible in admin history under its own old sessionId),
  // and resets the visible transcript back to just the greeting.
  const handleReset = (): void => {
    handoffSocket?.disconnect();
    handoffSocket = null;
    clearHandoffToken();
    sessionId = resetSessionId();
    ui.resetConversation(originalGreeting);
  };

  // Reload/reopen mid-handoff — reflect the correct bar state immediately,
  // and reconnect the socket if this tab still holds a (un-expired, same-
  // session) token from when the handoff was originally requested. No
  // stored token (private browsing, a different tab/device, or the ~2h
  // token has expired) still leaves the bar in the right state — the
  // visitor simply won't get live push until they reopen from the tab that
  // originally requested it; text still reaches staff via the normal gated
  // chat endpoint either way.
  if (initialHandoffState?.handoffStatus === 'waiting' || initialHandoffState?.handoffStatus === 'claimed') {
    ui.setHandoffState(initialHandoffState.handoffStatus as HandoffUiState, initialHandoffState.assignedToName);
    const storedToken = getHandoffToken(sessionId);
    if (storedToken) connectHandoffSocket(storedToken);
  }

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
