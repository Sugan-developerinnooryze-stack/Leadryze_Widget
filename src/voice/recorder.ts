/** Feature-detected once at widget-init time, BEFORE the mic button is ever
 * rendered — an unsupported browser (old version, or a non-HTTPS context
 * where getUserMedia is unavailable by spec) never sees a broken mic button
 * at all, rather than seeing one that fails on tap. */
export function isVoiceSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';
}

// Hard client-side cap — the primary duration guard (the backend's own 5MB
// multer limit, ai/src/api/voice.routes.ts, is defense-in-depth behind it).
const MAX_RECORDING_MS = 60_000;

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;

  /** Throws if the user denies the permission prompt — callers should catch
   * this and fall back to the text input, never dead-end the conversation. */
  async start(onAutoStop: () => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.startedAt = Date.now();
    this.autoStopTimer = setTimeout(onAutoStop, MAX_RECORDING_MS);
  }

  stop(): Promise<{ blob: Blob; durationSeconds: number }> {
    return new Promise((resolve) => {
      if (this.autoStopTimer) { clearTimeout(this.autoStopTimer); this.autoStopTimer = null; }
      const durationSeconds = (Date.now() - this.startedAt) / 1000;
      const recorder = this.mediaRecorder;
      if (!recorder) { resolve({ blob: new Blob(), durationSeconds: 0 }); return; }
      const mimeType = recorder.mimeType || 'audio/webm';
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        resolve({ blob, durationSeconds });
      };
      recorder.stop();
    });
  }
}
