/** Drives the mic button's 4 visual states — kept as one explicit union
 * (rather than scattered booleans) so a future streaming/interruption pass
 * extends this same type ('interrupted'/'paused') instead of retrofitting
 * ad-hoc flags. */
export type VoiceUiState = 'idle' | 'recording' | 'uploading' | 'thinking' | 'speaking';

/** Drives the CONTINUOUS voice call's UI, as one single authoritative state
 * rather than several independently-mutated flags (a phone-icon boolean, a
 * status-text string, an input-disabled boolean) that could drift out of
 * sync — every ContinuousVoiceSession event funnels through exactly one
 * `onStateChange(state)` callback, and ui.ts derives everything visual from
 * this one value. Deliberately a separate type from VoiceUiState above
 * (push-to-talk's own 4-state cycle) — continuous mode's states map to a
 * genuinely different, richer lifecycle (LiveKit's own connection states
 * plus the agent's own published lk.agent.state attribute), not a superset
 * of the push-to-talk ones. */
export type VoiceCallState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'ai_speaking'
  | 'reconnecting'
  | 'disconnecting'
  | 'mic_permission_denied'
  | 'mic_unavailable'
  | 'mic_in_use'
  | 'connection_failed';

export interface VoiceChatResult {
  transcript: string;
  response: string;
  escalate: boolean;
  capturedData: Record<string, string>;
  audio: string | null;
  audioFormat: string | null;
}
