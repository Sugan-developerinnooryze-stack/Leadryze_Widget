/** A single hidden <audio> element living in the widget's own Shadow DOM. */
export class VoicePlayer {
  private audioEl: HTMLAudioElement;

  constructor(root: ShadowRoot) {
    this.audioEl = document.createElement('audio');
    this.audioEl.style.display = 'none';
    root.appendChild(this.audioEl);
  }

  /** Returns true once playback has actually started, false if the browser
   * blocked it — iOS Safari specifically refuses .play() calls not directly
   * triggered by a user gesture, and this call is triggered by an async
   * network response, not a tap. Callers show a "tap to hear reply" fallback
   * when this comes back false rather than leaving a silently-broken reply. */
  async play(base64Audio: string, format: string): Promise<boolean> {
    this.audioEl.src = `data:audio/${format};base64,${base64Audio}`;
    try {
      await this.audioEl.play();
      return true;
    } catch {
      return false;
    }
  }

  /** Replays the currently-loaded audio — used by the "tap to hear reply"
   * fallback button, which IS a direct user gesture so this one always works. */
  replay(): void {
    void this.audioEl.play();
  }
}
