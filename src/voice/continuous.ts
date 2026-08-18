import { Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant } from 'livekit-client';
import { VoiceCallState } from './types';

export interface TranscriptSegment {
  id: string;
  text: string;
  final: boolean;
}

export interface ContinuousVoiceHandlers {
  /** The single source of truth for this call's UI — every LiveKit event
   * (connection lifecycle, the agent's own published lk.agent.state
   * attribute, mic/connection failures) funnels through this one callback
   * rather than several independently-fired ones, so the widget can never
   * end up with the phone icon, status text, and input-enabled-ness
   * disagreeing about what's actually happening. */
  onStateChange?: (state: VoiceCallState, message?: string) => void;
  /** The visitor's own live-transcribed speech — segments arrive
   * non-final first (text filling in as they talk) then one final segment
   * per utterance; same `id` across that whole sequence. */
  onUserTranscript?: (segment: TranscriptSegment) => void;
  /** The agent's own spoken reply, published the identical way. */
  onAgentTranscript?: (segment: TranscriptSegment) => void;
}

/** Fetches a scoped LiveKit room token from the backend's own
 * getVoiceToken() endpoint (never talks to LiveKit's own API directly —
 * same "backend resolves the tenant, the browser never holds a
 * tenant-wide secret" pattern every other public-widget call already
 * follows). */
async function fetchVoiceToken(
  apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string,
): Promise<{ token: string; url: string } | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/public/widget/voice/token?widgetKey=${encodeURIComponent(widgetKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, visitorId }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) return null;
    return { token: body.data.token as string, url: body.data.url as string };
  } catch {
    return null;
  }
}

/** A continuous, hands-free voice conversation over LiveKit — connects once,
 * publishes the visitor's microphone, plays back the agent's spoken
 * replies as they arrive, surfaces both directions' live transcripts, and
 * drives one authoritative VoiceCallState for the widget to render.
 * Deliberately separate from voice-api.ts's one-shot push-to-talk
 * request/response shape — this holds an open connection for the life of
 * the conversation instead. */
export class ContinuousVoiceSession {
  private room: Room | null = null;
  private handlers: ContinuousVoiceHandlers = {};
  /** Distinguishes a visitor-initiated hangup (stop(), no error message
   * needed) from an unexpected drop (network loss, server-side close) —
   * both fire the identical RoomEvent.Disconnected, but only the latter
   * should show a "connection lost" message. */
  private intentionalDisconnect = false;
  /** Closes a real race window: `isActive` (below) stays false for the
   * ENTIRE duration of the token-fetch + room.connect() round-trip below,
   * since `this.room` isn't set until after both complete. A second
   * start() call (e.g. a double-click on the call button) during that
   * window had nothing stopping it from firing a second fetchVoiceToken()
   * + a second LiveKit room connection for the same visitor — two
   * concurrent agent sessions. Set true at the very start of start(),
   * always cleared in a finally. */
  private isConnecting = false;

  private setState(state: VoiceCallState, message?: string): void {
    this.handlers.onStateChange?.(state, message);
  }

  /** container: where the agent's own hidden <audio> element gets attached —
   * defaults to document.body if omitted so any existing/future caller that
   * doesn't pass one keeps working, but every real caller in this widget
   * should pass its Shadow root, matching the isolation ui.ts already
   * enforces everywhere else. */
  async start(
    apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string,
    handlers: ContinuousVoiceHandlers = {},
    container: Node = document.body,
  ): Promise<boolean> {
    if (this.isConnecting || this.isActive) return false; // already starting or already connected — no-op, not a second session
    this.isConnecting = true;
    try {
      return await this.startInternal(apiBaseUrl, widgetKey, sessionId, visitorId, handlers, container);
    } finally {
      this.isConnecting = false;
    }
  }

  private async startInternal(
    apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string,
    handlers: ContinuousVoiceHandlers,
    container: Node,
  ): Promise<boolean> {
    this.handlers = handlers;
    this.setState('connecting');

    const creds = await fetchVoiceToken(apiBaseUrl, widgetKey, sessionId, visitorId);
    if (!creds) {
      this.setState('connection_failed', "Couldn't start the voice call — please try again, or continue by typing.");
      return false;
    }

    const room = new Room();
    this.room = room;
    const localIdentity = `visitor-${visitorId}`;

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      // The agent's own spoken reply — attach() returns a real
      // <audio>/<video> element already wired to play the track.
      if (track.kind === 'audio') {
        const el = track.attach();
        el.autoplay = true;
        container.appendChild(el);
      }
    });

    // Both directions of live transcript — already published automatically
    // by the worker's AgentSession (transcriptionEnabled defaults true in
    // @livekit/agents, confirmed directly in the installed package's own
    // source — no server-side change needed for this). Distinguish by
    // comparing against the room's own local identity rather than a
    // fragile "isLocal" flag lookup.
    room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
      const isLocal = participant?.identity === localIdentity;
      for (const seg of segments) {
        const payload: TranscriptSegment = { id: seg.id, text: seg.text, final: !!seg.final };
        if (isLocal) this.handlers.onUserTranscript?.(payload);
        else this.handlers.onAgentTranscript?.(payload);
      }
    });

    // The agent's own published conversational state (lk.agent.state —
    // 'initializing'|'listening'|'thinking'|'speaking', set by
    // @livekit/agents' RoomIO automatically) — maps directly onto our own
    // VoiceCallState so the widget's status text reflects what the AI is
    // actually doing, not just whether the call is connected.
    room.on(RoomEvent.ParticipantAttributesChanged, (attrs, participant) => {
      if (participant?.identity === localIdentity) return; // only the agent's own state matters here
      const agentState = attrs['lk.agent.state'];
      if (agentState === 'listening') this.setState('listening');
      else if (agentState === 'thinking') this.setState('thinking');
      else if (agentState === 'speaking') this.setState('ai_speaking');
      // 'initializing' has no distinct UI state — 'connected' already covers it.
    });

    // The agent leaving (session.close() on the worker side — e.g. after a
    // maxSessionMinutes wrap-up) only ends ITS OWN participant connection,
    // not the room itself — a real LiveKit semantic: disconnecting one
    // participant never force-disconnects the others. In a 1:1 agent+visitor
    // room, the agent's departure unambiguously means the call is over, so
    // the widget hangs up on its own in response — exactly how a real phone
    // call ends when the other party hangs up, and the only mechanism that
    // doesn't require a separate server-side admin API call (LiveKit's
    // RoomServiceClient) just to end a call cleanly.
    room.on(RoomEvent.ParticipantDisconnected, () => { void this.stop(); });

    room.on(RoomEvent.Reconnecting, () => this.setState('reconnecting'));
    room.on(RoomEvent.Reconnected, () => this.setState('connected'));
    room.on(RoomEvent.Disconnected, () => {
      this.room = null;
      if (this.intentionalDisconnect) {
        this.setState('idle');
      } else {
        this.setState('idle', 'Voice connection lost — you can keep chatting by typing below.');
      }
      this.intentionalDisconnect = false;
    });

    try {
      await room.connect(creds.url, creds.token);
    } catch {
      this.setState('connection_failed', "Couldn't start the voice call — please try again, or continue by typing.");
      this.room = null;
      return false;
    }

    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      // Real DOMException names, re-thrown as-is by livekit-client's own
      // getUserMedia wrapper (confirmed directly in the installed package) —
      // distinguishing these is what lets the widget show "permission
      // denied" vs "no microphone" vs "microphone busy" instead of one
      // generic error, per this pass's own explicit requirement.
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError') {
        this.setState('mic_permission_denied', 'Microphone permission required — please allow microphone access to use voice.');
      } else if (name === 'NotFoundError') {
        this.setState('mic_unavailable', 'No microphone found on this device.');
      } else if (name === 'NotReadableError') {
        this.setState('mic_in_use', 'Your microphone is being used by another application.');
      } else {
        this.setState('connection_failed', 'Could not access your microphone, or the connection failed.');
      }
      await this.stop();
      return false;
    }

    this.setState('connected');
    return true;
  }

  async stop(): Promise<void> {
    if (this.room) {
      this.intentionalDisconnect = true;
      this.setState('disconnecting');
      await this.room.disconnect();
      this.room = null;
    }
  }

  get isActive(): boolean {
    return this.room !== null;
  }
}
