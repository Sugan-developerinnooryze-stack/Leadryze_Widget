import type { VoiceCallState } from './voice/types';

/** Full color/font/size customization — independent of `template` (which now
 * controls ONLY structure: header gradient vs flat, avatar visibility,
 * bubble corner shape). Every field has a sensible fallback (see
 * renderShell's resolution below) so a tenant who sets only primaryColor —
 * or none of these at all — still gets a coherent, today-equivalent look;
 * this is purely additive. Resolved server-side (public-widget.controller.ts)
 * from the tenant's own saved values merged with their template's defaults,
 * so the widget itself never needs to know what template was picked. */
export interface WidgetTheme {
  accentColor?: string;
  headerColor?: string;
  headerTextColor?: string;
  backgroundColor?: string;
  botBubbleColor?: string;
  botTextColor?: string;
  userBubbleColor?: string;
  userTextColor?: string;
  fontFamily?: string;
  /** Panel/bubble footprint — 'standard' is noticeably larger than the
   * original fixed 336x470 (now 'compact', kept for tenants who prefer the
   * smaller footprint), matching typical desktop chat-widget proportions. */
  size?: 'compact' | 'standard' | 'large';
  /** Tiled (WhatsApp-wallpaper style) background image for the message
   * area — layered OVER backgroundColor, never instead of it, so an unset
   * value (every tenant who's never uploaded one) looks exactly as before
   * this field existed. */
  backgroundImageUrl?: string;
}

export interface WidgetConfig {
  companyName: string;
  agentName: string;
  logoUrl?: string;
  primaryColor: string;
  theme?: WidgetTheme;
  greeting: string;
  template?: 'modern' | 'minimal' | 'chips' | 'dark';
  /** Already ANDed with browser support (isVoiceSupported()) by loader.ts
   * before this reaches WidgetUI — true here always means "safe to render
   * the mic button," never just "the tenant turned it on." */
  voiceEnabled?: boolean;
  voiceAutoPlay?: boolean;
  /** Continuous, hands-free voice conversation (LiveKit) — a separate
   * capability from voiceEnabled (push-to-talk) above; shown INSTEAD of the
   * push-to-talk mic button when on, never both at once. */
  continuousVoiceEnabled?: boolean;
  /** Whether the text input stays usable while a continuous voice call is
   * active — tenant-configurable (Tenant.widget.voice.allowTextDuringVoice),
   * defaults true (hybrid mode) unless the tenant explicitly turns it off. */
  allowTextDuringVoice?: boolean;
  /** Tenant-authored suggestion chips (Quick Questions) — already filtered
   * to enabled-only, plain strings, by the backend's getConfig() projection.
   * Falls back to QUICK_SUGGESTIONS below when unset, so existing tenants
   * who never configured any don't regress to an empty chip row. */
  quickQuestions?: string[];
  /** "Connect with an expert" real-time human handoff. Backward-compat rule:
   * an absent/undefined value here must always be treated as OFF (checked
   * with a plain `if`, never `??`) — every tenant that predates this
   * feature, or hasn't turned it on, must see ZERO change to today's widget. */
  humanHandoffEnabled?: boolean;
  humanHandoffButtonText?: string;
  humanHandoffWaitingMessage?: string;
}

export type HandoffUiState = 'idle' | 'waiting' | 'claimed';

/** Mirrors the AI-side shape (ai/src/agents/dataset-item-card.types.ts) —
 * built exclusively from a real search_dataset tool result on the backend,
 * never from the LLM's own generated text, so a "Request Quote" click
 * always traces back to a genuine record. */
export interface DatasetItemCard {
  datasetId: string;
  datasetName: string;
  recordId: string;
  title: string;
  price?: string;
  imageUrl?: string;
  keySpecs?: string[];
}

export type VoiceUiState = 'idle' | 'recording' | 'uploading' | 'thinking' | 'speaking';

const CALL_ACTIVE_STATES: VoiceCallState[] = [
  'connecting', 'connected', 'listening', 'thinking', 'ai_speaking', 'reconnecting', 'disconnecting',
];
const CALL_STATE_LABELS: Partial<Record<VoiceCallState, string>> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  listening: 'Listening…',
  thinking: 'Thinking…',
  ai_speaking: 'AI is speaking…',
  reconnecting: 'Reconnecting…',
  disconnecting: 'Ending call…',
};

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Only http(s):// is ever treated as a real image — defense in depth
 * alongside the same check already applied server-side (search-dataset.tool.ts's
 * isSafeImageUrl). Rejects javascript:/data:/file:/anything else, and any
 * value that fails to parse as a URL at all. Assigned directly to img.src
 * as a validated string, never built via string concatenation. */
function isSafeImageUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Darkens/lightens a #rrggbb hex color by `amount` (-1..1) — used to derive
 * a hover shade from the tenant's own primaryColor without needing a second
 * configured color. */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  const r = clamp(((n >> 16) & 0xff) + 255 * amount);
  const g = clamp(((n >> 8) & 0xff) + 255 * amount);
  const b = clamp((n & 0xff) + 255 * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const ICON_CHAT = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_RESET = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
const ICON_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
const ICON_MIC = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
const ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
const ICON_PHONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const ICON_PHONE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>';

// A small, generic set of quick-reply suggestions — deliberately
// business-type-agnostic (no industry-specific wording), since this same
// bundle serves every tenant regardless of what they sell. "chips" renders
// these as horizontal pill buttons (Stalmart/HappyAir-style); "dark" renders
// the identical list as a vertical stacked action menu (HappyFox-style) —
// same data, deliberately different structure, not just a recolor.
const QUICK_SUGGESTIONS = ['Book an appointment', 'I have a question', 'Talk to a human'];

/** Renders inside a Shadow DOM (`mode:'open'`) so the tenant's own site CSS
 * can never leak into the widget or vice versa — this matters here
 * specifically because, unlike a scraping-only content script, this widget
 * must coexist visually with an arbitrary, unknown host page indefinitely. */
export class WidgetUI {
  private shadow: ShadowRoot;
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private micEl: HTMLButtonElement | null = null;
  private liveEl: HTMLButtonElement | null = null;
  private panelEl: HTMLElement;
  private bubbleEl: HTMLElement;
  private open = false;
  private onSend: (message: string) => void;
  private typingEl: HTMLElement | null = null;
  /** In-progress live-transcript bubbles, keyed by LiveKit segment id — an
   * id's bubble is updated in place on every non-final segment (the text
   * visibly filling in as the visitor/AI speaks) and removed from this map
   * once its final segment arrives, so a later, different id starts fresh. */
  private liveMessages = new Map<string, HTMLElement>();
  private allowTextDuringVoice = true;
  private quickQuestions: string[];
  private handoffBarEl: HTMLElement | null = null;
  private humanHandoffEnabled: boolean;
  /** Kept to re-render the right quick-reply layout (pills vs stacked menu)
   * after a reset — the constructor only renders it once otherwise. */
  private template: string;

  constructor(
    config: WidgetConfig, onSend: (message: string) => void, onMicClick?: () => void,
    onLiveToggle?: () => void, onRequestHuman?: () => void, onReset?: () => void,
  ) {
    this.onSend = onSend;
    this.allowTextDuringVoice = config.allowTextDuringVoice !== false;
    this.quickQuestions = config.quickQuestions?.length ? config.quickQuestions : QUICK_SUGGESTIONS;
    this.humanHandoffEnabled = !!config.humanHandoffEnabled;
    const host = document.createElement('div');
    host.id = 'leadryze-widget-host';
    // `all: initial` isolates this host element's own box from the host
    // page's inherited styles — the real isolation is the Shadow DOM below,
    // this is just belt-and-suspenders for the host element itself.
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000;';
    document.body.appendChild(host);
    this.shadow = host.attachShadow({ mode: 'open' });
    const template = config.template ?? 'modern';
    this.template = template;
    this.shadow.innerHTML = this.renderShell(config, template);

    this.bubbleEl   = this.shadow.getElementById('lr-bubble') as HTMLElement;
    this.panelEl    = this.shadow.getElementById('lr-panel') as HTMLElement;
    this.messagesEl = this.shadow.getElementById('lr-messages') as HTMLElement;
    this.inputEl    = this.shadow.getElementById('lr-input') as HTMLTextAreaElement;
    this.sendBtn    = this.shadow.getElementById('lr-send') as HTMLButtonElement;
    const closeEl   = this.shadow.getElementById('lr-close') as HTMLElement;
    const resetEl   = this.shadow.getElementById('lr-reset') as HTMLElement;

    this.bubbleEl.addEventListener('click', () => this.toggle());
    closeEl.addEventListener('click', () => this.toggle());
    if (onReset) resetEl?.addEventListener('click', () => onReset());
    this.sendBtn.addEventListener('click', () => this.handleSend());
    // Enter sends; Shift+Enter inserts a newline (default textarea
    // behavior — only prevented on a plain Enter). autoGrow runs on every
    // keystroke, not just after a newline, so deleting lines shrinks the
    // box back down too, not just growing it.
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
    this.inputEl.addEventListener('input', () => this.autoGrowInput());

    if (config.continuousVoiceEnabled && onLiveToggle) {
      this.liveEl = this.shadow.getElementById('lr-live') as HTMLButtonElement;
      this.liveEl?.addEventListener('click', () => onLiveToggle());
    } else if (config.voiceEnabled && onMicClick) {
      this.micEl = this.shadow.getElementById('lr-mic') as HTMLButtonElement;
      this.micEl?.addEventListener('click', () => onMicClick());
    }

    if (this.humanHandoffEnabled && onRequestHuman) {
      this.handoffBarEl = this.shadow.getElementById('lr-handoff-bar');
      const handoffBtn = this.shadow.getElementById('lr-handoff-btn');
      handoffBtn?.addEventListener('click', () => onRequestHuman());
    }

    if (config.greeting) this.addMessage('assistant', config.greeting);

    // Real gap fixed here: quick-question chips were only ever wired up for
    // the 'chips'/'dark' templates, so a tenant on 'modern' or 'minimal'
    // (modern is every new tenant's default) had their configured Quick
    // Questions silently never render at all — confirmed live against a
    // real tenant with 6 correctly-saved, enabled questions that never
    // appeared in the widget. The .lr-chips/.lr-chip CSS below was never
    // template-scoped to begin with (only .lr-actions/.lr-action's dark
    // vertical-menu style is template-specific), so every other template
    // now gets the same horizontal pill chips 'chips' already had.
    if (template === 'dark') this.renderQuickReplies('lr-actions', 'lr-action');
    else this.renderQuickReplies('lr-chips', 'lr-chip');
  }

  /** Same suggestion list, rendered as either horizontal pills (chips
   * template) or a vertical stacked menu (dark template) — the wrapper/item
   * class names are the only difference; both send identically on click. */
  private renderQuickReplies(wrapClass: string, itemClass: string): void {
    const wrap = document.createElement('div');
    wrap.className = wrapClass;
    for (const label of this.quickQuestions) {
      const btn = document.createElement('button');
      btn.className = itemClass;
      btn.type = 'button';
      btn.innerHTML = itemClass === 'lr-action' ? `<span>${escapeHtml(label)}</span>${ICON_CHEVRON}` : escapeHtml(label);
      btn.addEventListener('click', () => {
        wrap.remove();
        this.sendText(label);
      });
      wrap.appendChild(btn);
    }
    this.messagesEl.appendChild(wrap);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** One shared card style across all 4 templates (reusing the tenant's own
   * color tokens via CSS, not 4 bespoke designs) — built entirely with
   * createElement/.textContent, never innerHTML with tenant/dataset-sourced
   * text, matching this file's existing XSS posture. Appended as a distinct
   * element after the assistant's text bubble, same structural pattern
   * renderQuickReplies() already uses. */
  private renderItemCards(items: DatasetItemCard[], totalMatches: number | undefined, sourceQuestion: string | undefined): void {
    const wrap = document.createElement('div');
    wrap.className = 'lr-cards';

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'lr-card';

      if (isSafeImageUrl(item.imageUrl)) {
        const img = document.createElement('img');
        img.className = 'lr-card-img';
        img.loading = 'lazy';
        img.alt = item.title;
        img.onerror = () => { img.replaceWith(this.buildCardImagePlaceholder()); };
        img.src = item.imageUrl as string;
        card.appendChild(img);
      } else {
        card.appendChild(this.buildCardImagePlaceholder());
      }

      const body = document.createElement('div');
      body.className = 'lr-card-body';

      const title = document.createElement('div');
      title.className = 'lr-card-title';
      title.textContent = item.title;
      body.appendChild(title);

      if (item.price) {
        const price = document.createElement('div');
        price.className = 'lr-card-price';
        price.textContent = item.price;
        body.appendChild(price);
      }

      if (item.keySpecs?.length) {
        const specs = document.createElement('div');
        specs.className = 'lr-card-specs';
        for (const spec of item.keySpecs) {
          const line = document.createElement('div');
          line.textContent = spec;
          specs.appendChild(line);
        }
        body.appendChild(specs);
      }

      const actions = document.createElement('div');
      actions.className = 'lr-card-actions';
      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'lr-card-btn';
      detailsBtn.textContent = 'View Details';
      detailsBtn.addEventListener('click', () => this.sendText(`Tell me more about ${item.title}`));
      const quoteBtn = document.createElement('button');
      quoteBtn.type = 'button';
      quoteBtn.className = 'lr-card-btn lr-card-btn-primary';
      quoteBtn.textContent = 'Request Quote';
      quoteBtn.addEventListener('click', () => this.sendText(`I'd like a quote for ${item.title}`));
      actions.appendChild(detailsBtn);
      actions.appendChild(quoteBtn);
      body.appendChild(actions);

      card.appendChild(body);
      wrap.appendChild(card);
    }

    this.messagesEl.appendChild(wrap);

    // "Show more" — only when the query genuinely matched more than what's
    // shown; never implies these items are the complete result set
    // otherwise. Just another normal chat turn, no pagination state kept.
    if (typeof totalMatches === 'number' && totalMatches > items.length && sourceQuestion) {
      const more = document.createElement('div');
      more.className = 'lr-cards-more';
      const note = document.createElement('span');
      note.textContent = `Showing ${items.length} of ${totalMatches} matches. `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lr-card-btn';
      btn.textContent = 'Show more';
      btn.addEventListener('click', () => this.sendText(`Show more ${sourceQuestion}`));
      more.appendChild(note);
      more.appendChild(btn);
      this.messagesEl.appendChild(more);
    }
  }

  private buildCardImagePlaceholder(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'lr-card-img lr-card-img-placeholder';
    return div;
  }

  private handleSend(): void {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';
    this.autoGrowInput();
    this.sendText(text);
  }

  /** Grows the textarea to fit its content up to a bounded max height (the
   * CSS max-height below), then lets it scroll internally rather than
   * growing forever — matches the Slack/WhatsApp-style "input grows with
   * you, panel doesn't" pattern. Reset-to-scrollHeight-then-remeasure is
   * the standard trick for shrinking back down when text is deleted (a
   * plain scrollHeight read without the reset would only ever grow). */
  private autoGrowInput(): void {
    this.inputEl.style.height = 'auto';
    this.inputEl.style.height = `${this.inputEl.scrollHeight}px`;
  }

  private sendText(text: string): void {
    this.addMessage('user', text);
    this.onSend(text);
  }

  toggle(): void {
    this.open = !this.open;
    this.panelEl.classList.toggle('lr-open', this.open);
    if (this.open) {
      this.panelEl.style.display = 'flex';
      this.shadow.getElementById('lr-badge')?.remove();
      requestAnimationFrame(() => this.inputEl.focus());
    } else {
      // Let the closing transition finish before actually hiding, so the
      // panel fades/scales out instead of just vanishing.
      setTimeout(() => { if (!this.open) this.panelEl.style.display = 'none'; }, 160);
    }
  }

  addMessage(role: 'user' | 'assistant', text: string, items?: DatasetItemCard[], totalMatches?: number, sourceQuestion?: string): void {
    // A reply arriving removes the typing indicator right as it's replaced
    // by the real message, rather than leaving it to linger until setBusy(false).
    if (role === 'assistant' && this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
    }
    const div = document.createElement('div');
    div.className = `lr-msg lr-msg-${role}`;
    div.textContent = text;
    this.messagesEl.appendChild(div);
    if (role === 'assistant' && items?.length) this.renderItemCards(items, totalMatches, sourceQuestion);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  setBusy(busy: boolean): void {
    this.sendBtn.disabled = busy;
    this.inputEl.disabled = busy;
    if (this.micEl) this.micEl.disabled = busy;
    if (busy) {
      const div = document.createElement('div');
      div.className = 'lr-msg lr-msg-assistant lr-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      this.messagesEl.appendChild(div);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      this.typingEl = div;
    } else {
      this.typingEl?.remove();
      this.typingEl = null;
    }
  }

  /** Updates the mic button's icon/pulse to reflect where a voice turn
   * currently is — text input stays disabled for the whole non-idle window
   * so a visitor can't start two conversational turns at once. */
  setVoiceState(state: VoiceUiState): void {
    if (!this.micEl) return;
    this.micEl.dataset.voiceState = state;
    this.micEl.innerHTML = state === 'recording' ? ICON_STOP : ICON_MIC;
    const busy = state !== 'idle';
    this.sendBtn.disabled = busy;
    this.inputEl.disabled = busy;
  }

  /** The single place that derives every visible piece of continuous-call UI
   * (phone icon, #lr-status text, whether text input is enabled) from one
   * authoritative VoiceCallState — replaces the old setLiveActive(boolean),
   * which only ever toggled two states and always disabled text input
   * unconditionally. `message`, when present, is shown as a normal inline
   * assistant bubble (used for connection-lost/mic-error notices — the
   * phone button's own idle state IS the "try again" affordance, and the
   * text input's own enabled-ness IS "continue with text," so neither needs
   * a bespoke button). */
  setCallState(state: VoiceCallState, message?: string): void {
    if (this.liveEl) {
      const active = CALL_ACTIVE_STATES.includes(state);
      this.liveEl.dataset.liveState = active ? 'active' : 'idle';
      this.liveEl.innerHTML = active ? ICON_PHONE_OFF : ICON_PHONE;
      this.liveEl.setAttribute('aria-label', active ? 'End voice conversation' : 'Start voice conversation');
      const disableTextInput = active && !this.allowTextDuringVoice;
      this.inputEl.disabled = disableTextInput;
      this.sendBtn.disabled = disableTextInput;
    }
    const statusTextEl = this.shadow.getElementById('lr-status-text');
    if (statusTextEl) statusTextEl.textContent = CALL_STATE_LABELS[state] ?? "We're online";
    if (message) this.addMessage('assistant', message);
  }

  /** Drives the persistent handoff bar's three states — NOT a quick-reply
   * chip (those self-remove after one click; a visitor might want to check
   * or re-trigger this at any point in the conversation, so it stays put
   * above the input bar for the whole session). 'idle' shows the button;
   * 'waiting'/'claimed' replace it with a live status line. No-ops entirely
   * if humanHandoff was never enabled for this tenant — the bar element
   * doesn't exist in the DOM at all in that case. */
  setHandoffState(state: HandoffUiState, assignedToName?: string): void {
    if (!this.handoffBarEl) return;
    this.handoffBarEl.dataset.state = state;
    const statusEl = this.shadow.getElementById('lr-handoff-status');
    if (statusEl) {
      statusEl.textContent = state === 'claimed'
        ? `You're chatting with ${assignedToName || 'a team member'}`
        : state === 'waiting'
          ? "Connecting you with a team member…"
          : '';
    }
  }

  /** "Start a new conversation" — clears the visible transcript and any
   * in-progress typing/live-segment state, drops the handoff bar back to
   * idle (a fresh session has no active handoff), and re-renders the
   * greeting + quick replies exactly as a brand-new widget load would.
   * Purely a UI reset — loader.ts is the one that actually mints the new
   * sessionId and tears down any live handoff socket; this method doesn't
   * know about either. */
  resetConversation(greeting: string): void {
    this.messagesEl.innerHTML = '';
    this.liveMessages.clear();
    this.typingEl = null;
    this.setHandoffState('idle');
    if (greeting) this.addMessage('assistant', greeting);
    if (this.template === 'dark') this.renderQuickReplies('lr-actions', 'lr-action');
    else this.renderQuickReplies('lr-chips', 'lr-chip');
  }

  /** Live-updating transcript bubble — creates one on first sight of `id`,
   * updates its text in place on every subsequent call with the same `id`
   * (a non-final segment), and stops tracking it once `final` is true so a
   * later, different id starts a fresh bubble. This is what makes the
   * transcript feel "live" rather than one bubble appearing only once an
   * utterance completes. */
  upsertMessage(id: string, role: 'user' | 'assistant', text: string, final: boolean): void {
    if (role === 'assistant' && this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
    }
    let el = this.liveMessages.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = `lr-msg lr-msg-${role}`;
      this.messagesEl.appendChild(el);
    }
    el.textContent = text;
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    if (final) this.liveMessages.delete(id);
    else this.liveMessages.set(id, el);
  }

  /** iOS Safari blocks autoplay not triggered by a direct tap — when
   * player.play() reports it was blocked, this appends a small inline button
   * next to the just-added assistant reply so the visitor can tap to hear it
   * instead of the reply silently never playing. */
  addPlayFallback(onClick: () => void): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lr-play-fallback';
    btn.innerHTML = `${ICON_SPEAKER} Tap to hear reply`;
    btn.addEventListener('click', () => onClick());
    this.messagesEl.appendChild(btn);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  getShadowRoot(): ShadowRoot {
    return this.shadow;
  }

  private renderShell(config: WidgetConfig, template: string): string {
    const theme = config.theme ?? {};
    // `color`/`colorDark` kept as the accent token's own name throughout the
    // rest of this template literal — only its SOURCE changed (theme override
    // first, falling back to the legacy single primaryColor field so a
    // tenant who never touches the new theme UI sees zero visual change).
    const color = theme.accentColor || config.primaryColor || '#2563eb';
    const colorDark = shade(color, -0.18);
    const headerBg     = theme.headerColor || color;
    const headerBgDark = shade(headerBg, -0.18);
    const headerText   = theme.headerTextColor || '#ffffff';
    const bgColor      = theme.backgroundColor || '#f8f9fb';
    // Single image, scaled to fill the message area and centered — NOT
    // tiled. A fixed-size repeating tile (the original design here) only
    // looks right for a purpose-built seamless pattern; an arbitrary
    // uploaded photo/illustration (anything with a visible edge, which is
    // most images) visibly repeats as an ugly grid at small tile sizes —
    // confirmed live. `cover` + centered is the one setting that looks
    // correct for any image a tenant uploads, same as a normal CSS
    // background photo. Layered over bgColor (visible through any
    // transparent PNG edges), never replacing it. isSafeImageUrl guards
    // this exactly like dataset item-card images (http(s):// only; this
    // value is server-uploaded via the dedicated endpoint, but defense in
    // depth costs nothing here).
    const hasBgImage   = isSafeImageUrl(theme.backgroundImageUrl);
    const bgImageCss   = hasBgImage
      ? `background-image: url('${(theme.backgroundImageUrl as string).replace(/'/g, "%27")}'); background-repeat: no-repeat; background-size: cover; background-position: center;`
      : '';
    const botBubble    = theme.botBubbleColor || '#ffffff';
    const botText      = theme.botTextColor || '#1e2430';
    const userBubble   = theme.userBubbleColor || color;
    const userText     = theme.userTextColor || '#ffffff';
    const fontFamily   = theme.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const SIZES = {
      compact:  { w: 336, h: 470 },
      standard: { w: 392, h: 600 },
      large:    { w: 420, h: 680 },
    } as const;
    const { w: panelW, h: panelH } = SIZES[theme.size ?? 'standard'];
    const avatar = config.logoUrl
      ? `<img src="${escapeHtml(config.logoUrl)}" alt="" id="lr-avatar-img" />`
      : `<span id="lr-avatar-fallback">${escapeHtml((config.agentName || config.companyName || '?').charAt(0).toUpperCase())}</span>`;

    // Setting font-family alone doesn't load the actual font file — without
    // this, picking e.g. "Poppins" in the admin settings would silently fall
    // back to the system font, a confusing "I set it but nothing changed"
    // bug. @import must be the very first rule in the stylesheet (CSS spec),
    // before even :host, so this only matches one of the curated Google
    // Fonts names FONT_OPTIONS (WidgetSettingsPage.tsx) actually offers —
    // never a blind lookup against arbitrary tenant-entered text.
    const GOOGLE_FONTS: Record<string, string> = {
      Inter: 'Inter:wght@400;600;700', Roboto: 'Roboto:wght@400;500;700',
      Poppins: 'Poppins:wght@400;600;700', 'Open Sans': 'Open+Sans:wght@400;600;700',
      Lato: 'Lato:wght@400;700', Montserrat: 'Montserrat:wght@400;600;700',
    };
    const googleFontName = Object.keys(GOOGLE_FONTS).find((name) => (theme.fontFamily ?? '').includes(name));
    const fontImport = googleFontName
      ? `@import url('https://fonts.googleapis.com/css2?family=${GOOGLE_FONTS[googleFontName]}&display=swap');`
      : '';

    return `
<style>
  ${fontImport}
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ${fontFamily}; }
  @keyframes lr-pop { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes lr-bounce { 0%, 60%, 100% { transform: translateY(0) scale(1); opacity: .4; } 30% { transform: translateY(-4px) scale(1.15); opacity: 1; } }
  @keyframes lr-fade-in { from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes lr-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes lr-bubble-in { from { opacity: 0; transform: scale(.4) rotate(-20deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
  @keyframes lr-breathe { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.35); } 50% { box-shadow: 0 0 0 4px rgba(255,255,255,0); } }
  /* Directional bubble entrance — a bot reply slides in from the avatar's
     side, the visitor's own message slides in from the send button's side,
     same "where it came from" motion language WhatsApp/iMessage use. */
  @keyframes lr-slide-in-left  { from { opacity: 0; transform: translateX(-18px) scale(.9); } to { opacity: 1; transform: translateX(0) scale(1); } }
  @keyframes lr-slide-in-right { from { opacity: 0; transform: translateX(18px) scale(.9); } to { opacity: 1; transform: translateX(0) scale(1); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

  /* ══════════════════════════ Base — shared plumbing only ══════════════════════════ */
  #lr-bubble {
    position: fixed; right: 22px; bottom: 22px; width: 60px; height: 60px; border-radius: 50%;
    border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, ${color} 0%, ${colorDark} 100%);
    box-shadow: 0 10px 24px -6px ${color}66, 0 2px 8px rgba(0,0,0,0.15);
    transition: transform .15s ease, box-shadow .15s ease;
    /* The quiet "someone's here" pulse — a box-shadow ring rather than a
       separate layered element, so it's geometrically guaranteed to stay
       perfectly concentric with the button (a sibling/pseudo-element shape
       here previously rendered as a visibly offset ghost circle instead of
       a clean ring — confirmed live, this replaces that). */
    animation: lr-ring-pulse 2.6s cubic-bezier(.4,0,.6,1) infinite;
  }
  #lr-bubble-wrap { position: fixed; right: 22px; bottom: 22px; animation: lr-bubble-in .45s cubic-bezier(.34,1.56,.64,1); }
  #lr-bubble-wrap #lr-bubble { position: static; }
  #lr-bubble:hover { transform: scale(1.06); box-shadow: 0 14px 28px -6px ${color}80, 0 2px 8px rgba(0,0,0,0.18); }
  #lr-bubble:active { transform: scale(.97); }
  @keyframes lr-ring-pulse {
    0%   { box-shadow: 0 10px 24px -6px ${color}66, 0 2px 8px rgba(0,0,0,0.15), 0 0 0 0 ${color}55; }
    70%  { box-shadow: 0 10px 24px -6px ${color}66, 0 2px 8px rgba(0,0,0,0.15), 0 0 0 14px ${color}00; }
    100% { box-shadow: 0 10px 24px -6px ${color}66, 0 2px 8px rgba(0,0,0,0.15), 0 0 0 14px ${color}00; }
  }

  #lr-panel {
    display: none; flex-direction: column; position: fixed; right: 22px; bottom: 96px;
    width: ${panelW}px; height: ${panelH}px; max-height: 80vh; border-radius: 18px;
    box-shadow: 0 20px 50px -12px rgba(15,23,42,0.3), 0 4px 14px rgba(15,23,42,0.1);
    overflow: hidden; opacity: 0; transform: translateY(10px) scale(.97);
    transition: opacity .2s ease, transform .2s cubic-bezier(.34,1.56,.64,1);
    /* The background image (when set) lives HERE, on the whole panel, not
       just #lr-messages — confirmed live that a tenant expects it to cover
       the full body: the status row, the message area, the handoff bar,
       AND the input bar, everything below the header, as one continuous
       image rather than stopping at the message scroll area. #lr-header
       paints its own opaque background over this, so the image never shows
       through there regardless. */
    background-color: ${bgColor}; ${bgImageCss}
  }
  #lr-panel.lr-open { opacity: 1; transform: translateY(0) scale(1); animation: lr-pop .22s cubic-bezier(.34,1.56,.64,1); }

  #lr-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; color: ${headerText}; flex-shrink: 0;
    background: linear-gradient(135deg, ${headerBg} 0%, ${headerBgDark} 100%); position: relative; overflow: hidden; }
  /* Soft overlapping circles — the same decorative language the admin
     dashboard's own internal AI assistant (ChatWidget.tsx) already uses on
     its header, borrowed here for a consistent, already-settled "premium"
     look rather than inventing a new one. Purely decorative: pointer-events
     off so they never intercept clicks on the avatar/buttons above them. */
  #lr-header::before, #lr-header::after { content: ''; position: absolute; border-radius: 50%; z-index: 0;
    background: rgba(255,255,255,0.12); pointer-events: none; }
  #lr-header::before { width: 90px; height: 90px; top: -30px; right: -20px; }
  #lr-header::after  { width: 56px; height: 56px; bottom: -26px; left: -10px; }
  #lr-header > * { position: relative; z-index: 1; }
  #lr-avatar { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.22);
    display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; font-weight: 700; font-size: 14px;
    animation: lr-breathe 3.2s ease-in-out infinite; }
  #lr-avatar-img { width: 100%; height: 100%; object-fit: cover; }
  #lr-header-text { flex: 1; min-width: 0; }
  #lr-header-name { display: block; font-size: 14px; font-weight: 600; letter-spacing: .1px; }
  #lr-header-sub { display: block; font-size: 11.5px; opacity: .85; margin-top: 1px; }
  #lr-close, #lr-reset { background: rgba(255,255,255,0.14); border: none; color: ${headerText}; width: 28px; height: 28px; border-radius: 50%;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .15s ease, transform .15s ease; }
  #lr-close:hover, #lr-reset:hover { background: rgba(255,255,255,0.26); transform: scale(1.08); }
  #lr-reset:active { transform: scale(.92) rotate(-45deg); }
  #lr-status { display: none; align-items: center; gap: 6px; padding: 6px 16px 12px; font-size: 11px; color: ${headerText}; margin-bottom: -1px; background: ${headerBg}; }
  #lr-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; animation: lr-pulse 1.8s infinite ease-in-out; }
  #lr-wave { display: none; width: 100%; height: 14px; margin-top: -1px; flex-shrink: 0; }

  #lr-badge { position: absolute; top: -2px; right: -2px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px;
    background: #ef4444; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    border: 2px solid #fff; }

  #lr-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: transparent; }
  #lr-messages::-webkit-scrollbar { width: 6px; }
  #lr-messages::-webkit-scrollbar-thumb { background: #d8dce3; border-radius: 3px; }

  .lr-msg { max-width: 82%; padding: 9px 13px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap;
    word-break: break-word; animation: lr-fade-in .18s ease; transform-origin: bottom center; }
  .lr-msg-assistant { align-self: flex-start; background: ${botBubble}; border: 1px solid #e8eaee; color: ${botText};
    animation: lr-slide-in-left .32s cubic-bezier(.34,1.56,.64,1); }
  .lr-msg-user { align-self: flex-end; background: ${userBubble}; color: ${userText};
    animation: lr-slide-in-right .32s cubic-bezier(.34,1.56,.64,1); }

  .lr-typing { display: flex; align-items: center; gap: 4px; padding: 12px 14px; }
  .lr-typing span { width: 6px; height: 6px; border-radius: 50%; background: #a7adba; display: inline-block;
    animation: lr-bounce 1.2s infinite ease-in-out; }
  .lr-typing span:nth-child(2) { animation-delay: .15s; }
  .lr-typing span:nth-child(3) { animation-delay: .3s; }

  #lr-handoff-bar { display: none; align-items: center; justify-content: space-between; gap: 10px;
    padding: 9px 14px; background: transparent; border-top: 1px solid #edeef2; flex-shrink: 0; }
  #lr-handoff-bar[data-state="idle"], #lr-handoff-bar[data-state="waiting"], #lr-handoff-bar[data-state="claimed"] { display: flex; }
  #lr-handoff-btn { border: 1.5px solid ${color}; background: #fff; color: ${color}; font-size: 12px; font-weight: 600;
    padding: 6px 13px; border-radius: 999px; cursor: pointer; white-space: nowrap; transition: background .15s ease, color .15s ease; }
  #lr-handoff-btn:hover { background: ${color}; color: #fff; }
  #lr-handoff-bar[data-state="waiting"] #lr-handoff-btn, #lr-handoff-bar[data-state="claimed"] #lr-handoff-btn { display: none; }
  #lr-handoff-status-wrap { display: none; align-items: center; gap: 7px; font-size: 12px; color: #4b5263; }
  #lr-handoff-bar[data-state="waiting"] #lr-handoff-status-wrap, #lr-handoff-bar[data-state="claimed"] #lr-handoff-status-wrap { display: flex; }
  #lr-handoff-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; flex-shrink: 0; animation: lr-pulse 1.8s infinite ease-in-out; }

  #lr-inputbar { display: flex; align-items: flex-end; gap: 8px; padding: 12px; border-top: 1px solid #edeef2; background: transparent; flex-shrink: 0; }
  #lr-input { flex: 1; padding: 9px 13px; border: 1px solid #dfe2e8; border-radius: 18px; font-size: 13.5px;
    font-family: inherit; line-height: 1.4; resize: none; outline: none; transition: border-color .15s ease;
    max-height: 96px; overflow-y: auto; background: #fff; }
  #lr-input:focus { border-color: ${color}; }
  #lr-send { border: none; color: #fff; background: linear-gradient(135deg, ${color} 0%, ${colorDark} 100%);
    border-radius: 50%; width: 36px; height: 36px; box-shadow: 0 3px 10px -2px ${color}80;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: transform .1s ease, opacity .15s ease, box-shadow .15s ease; }
  #lr-send:hover:not(:disabled) { transform: scale(1.1) rotate(8deg); box-shadow: 0 5px 14px -2px ${color}99; }
  #lr-send:active:not(:disabled) { transform: scale(.85); }
  #lr-send:disabled, #lr-input:disabled { opacity: .55; cursor: default; }

  #lr-mic { border: 1.5px solid ${color}; color: ${color}; background: #fff; border-radius: 50%; width: 36px; height: 36px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform .1s ease, background .15s ease, color .15s ease; }
  #lr-mic:hover:not(:disabled) { transform: scale(1.06); }
  #lr-mic:disabled { opacity: .55; cursor: default; }
  #lr-mic[data-voice-state="recording"] { background: #ef4444; border-color: #ef4444; color: #fff; animation: lr-pulse 1.1s infinite ease-in-out; }
  #lr-mic[data-voice-state="uploading"], #lr-mic[data-voice-state="thinking"], #lr-mic[data-voice-state="speaking"] { opacity: .7; }

  #lr-live { border: 1.5px solid ${color}; color: ${color}; background: #fff; border-radius: 50%; width: 36px; height: 36px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform .1s ease, background .15s ease, color .15s ease; }
  #lr-live:hover { transform: scale(1.06); }
  #lr-live[data-live-state="active"] { background: #ef4444; border-color: #ef4444; color: #fff; animation: lr-pulse 1.4s infinite ease-in-out; }

  .lr-play-fallback { display: flex; align-items: center; gap: 6px; align-self: flex-start; background: #fff;
    border: 1.5px solid ${color}; color: ${color}; font-size: 12px; font-weight: 600; padding: 6px 12px;
    border-radius: 999px; cursor: pointer; transition: background .15s ease, color .15s ease; animation: lr-fade-in .18s ease; }
  .lr-play-fallback:hover { background: ${color}; color: #fff; }

  /* ══════ Item / product cards — one shared style across all 4 templates, ══════
   * using the tenant's own color tokens rather than per-template bespoke designs. */
  .lr-cards { display: flex; flex-direction: column; gap: 8px; align-self: stretch; animation: lr-fade-in .2s ease; }
  .lr-card { display: flex; gap: 10px; background: #fff; border: 1px solid #e8eaee; border-radius: 10px;
    padding: 10px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
  .lr-card-img { width: 64px; height: 64px; flex-shrink: 0; border-radius: 8px; object-fit: cover; background: #f1f2f5; }
  .lr-card-img-placeholder { display: flex; align-items: center; justify-content: center; background:
    linear-gradient(135deg, #eef0f4, #e4e7ec); }
  .lr-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .lr-card-title { font-size: 13.5px; font-weight: 700; color: #1e2430; line-height: 1.3; }
  .lr-card-price { font-size: 13px; font-weight: 600; color: ${color}; }
  .lr-card-specs { font-size: 11.5px; color: #6b7280; line-height: 1.4; }
  .lr-card-actions { display: flex; gap: 6px; margin-top: 4px; }
  .lr-card-btn { flex: 1; border: 1.5px solid ${color}; background: #fff; color: ${color}; font-size: 11.5px;
    font-weight: 600; padding: 6px 8px; border-radius: 999px; cursor: pointer; transition: background .15s ease, color .15s ease; }
  .lr-card-btn:hover { background: ${color}; color: #fff; }
  .lr-card-btn-primary { background: ${color}; color: #fff; }
  .lr-card-btn-primary:hover { background: ${colorDark}; }
  .lr-cards-more { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; align-self: stretch; }
  .lr-cards-more .lr-card-btn { flex: 0 0 auto; padding: 6px 14px; }

  /* ══════════════════ Modern — gradient header, wave transition, live-status, soft bubbles ══════════════════
   * Colors now come entirely from the theme tokens above (headerBg/userBubble/
   * etc, tenant-customizable) — every template section below is STRUCTURE
   * only (gradient vs flat, avatar visibility, corner shapes), never a color
   * value of its own, so a tenant's custom palette applies identically
   * regardless of which template/shape they picked. */
  #lr-panel[data-template="modern"] #lr-header { background: linear-gradient(135deg, ${headerBg}, ${headerBgDark}); padding-bottom: 8px; }
  #lr-panel[data-template="modern"] #lr-avatar { width: 40px; height: 40px; box-shadow: 0 0 0 2px rgba(255,255,255,0.4); }
  #lr-panel[data-template="modern"] #lr-status { display: flex; background: linear-gradient(135deg, ${headerBg}, ${headerBgDark}); }
  #lr-panel[data-template="modern"] #lr-wave { display: block; }
  #lr-panel[data-template="modern"] .lr-msg-assistant { border-radius: 4px 16px 16px 16px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
  #lr-panel[data-template="modern"] .lr-msg-user { border-radius: 16px 4px 16px 16px; }

  /* ══════════════════ Minimal Flat — bare, quiet, no avatar/status/shadow ══════════════════ */
  #lr-panel[data-template="minimal"] { border-radius: 8px; box-shadow: 0 2px 16px rgba(15,23,42,0.14); }
  #lr-panel[data-template="minimal"] #lr-avatar { display: none; }
  #lr-bubble[data-template="minimal"] { border-radius: 14px; box-shadow: 0 3px 10px rgba(0,0,0,0.16); }
  #lr-panel[data-template="minimal"] .lr-msg { border-radius: 6px; }
  #lr-panel[data-template="minimal"] #lr-input { border-radius: 6px; }
  #lr-panel[data-template="minimal"] #lr-send { border-radius: 6px; }

  /* ══════════════════ Compact Chips — icon avatar, horizontal pill quick-replies ══════════════════ */
  #lr-panel[data-template="chips"] #lr-avatar { background: #fff; color: ${headerBg}; }
  #lr-panel[data-template="chips"] .lr-msg { border-radius: 12px; }
  #lr-panel[data-template="chips"] .lr-msg-assistant { border-radius: 4px 12px 12px 12px; }
  #lr-panel[data-template="chips"] .lr-msg-user { border-radius: 12px 4px 12px 12px; }
  .lr-chips { display: flex; flex-wrap: wrap; gap: 6px; animation: lr-fade-in .2s ease; }
  .lr-chip { border: 1.5px solid ${color}; background: #fff; color: ${color}; font-size: 12.5px; font-weight: 600;
    padding: 7px 12px; border-radius: 999px; cursor: pointer; transition: background .15s ease, color .15s ease, transform .15s ease, box-shadow .15s ease; }
  .lr-chip:hover { background: ${color}; color: #fff; transform: translateY(-2px); box-shadow: 0 4px 10px -2px ${color}55; }
  .lr-chip:active { transform: translateY(0) scale(.96); }

  /* ══════════════════ Dark Professional — dark chrome, vertical stacked action menu ══════════════════ */
  #lr-panel[data-template="dark"] #lr-avatar { background: rgba(255,255,255,0.1); }
  #lr-panel[data-template="dark"] #lr-close, #lr-panel[data-template="dark"] #lr-reset { background: rgba(255,255,255,0.08); }
  #lr-panel[data-template="dark"] #lr-close:hover, #lr-panel[data-template="dark"] #lr-reset:hover { background: rgba(255,255,255,0.16); }
  #lr-panel[data-template="dark"] .lr-msg { border-radius: 4px 12px 12px 12px; }
  #lr-panel[data-template="dark"] .lr-msg-user { border-radius: 12px 4px 12px 12px; }
  #lr-panel[data-template="dark"] #lr-inputbar { background: transparent; border-top-color: #e4e6ea; }
  /* Same list as Chips' pills, rendered as a vertical stacked menu instead —
   * first item filled/primary, the rest outlined/secondary, matching the
   * HappyFox-style "one primary action + secondary options" pattern. */
  .lr-actions { display: flex; flex-direction: column; gap: 7px; width: 100%; animation: lr-fade-in .2s ease; }
  .lr-action { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left;
    background: #fff; border: 1.5px solid ${color}; color: ${color}; font-size: 13px; font-weight: 600;
    padding: 10px 14px; border-radius: 999px; cursor: pointer; transition: background .15s ease, color .15s ease; }
  .lr-action:hover { background: ${color}; color: #fff; }
  .lr-action:hover svg { color: #fff; }
  .lr-action svg { flex-shrink: 0; color: ${color}; margin-left: 8px; transition: color .15s ease; }
  .lr-action:first-child { background: ${color}; color: #fff; }
  .lr-action:first-child svg { color: #fff; }
  .lr-action:first-child:hover { background: ${colorDark}; }
</style>
<div id="lr-bubble-wrap">
  <button id="lr-bubble" data-template="${template}" aria-label="Open chat">${ICON_CHAT}</button>
  <span id="lr-badge">1</span>
</div>
<div id="lr-panel" data-template="${template}">
  <div id="lr-header">
    <div id="lr-avatar">${avatar}</div>
    <div id="lr-header-text">
      <span id="lr-header-name">${escapeHtml(config.agentName)}</span>
      <span id="lr-header-sub">${escapeHtml(config.companyName)}</span>
    </div>
    <button id="lr-reset" aria-label="Start a new conversation" title="Start a new conversation">${ICON_RESET}</button>
    <button id="lr-close" aria-label="Close chat">${ICON_CLOSE}</button>
  </div>
  <div id="lr-status"><span id="lr-status-dot"></span><span id="lr-status-text">We're online</span></div>
  ${hasBgImage ? '' : `<svg id="lr-wave" viewBox="0 0 336 14" preserveAspectRatio="none"><path d="M0,0 C56,14 112,14 168,7 C224,0 280,0 336,7 L336,14 L0,14 Z" fill="${bgColor}"/></svg>`}
  <div id="lr-messages"></div>
  ${config.humanHandoffEnabled ? `
  <div id="lr-handoff-bar" data-state="idle">
    <button id="lr-handoff-btn" type="button">${escapeHtml(config.humanHandoffButtonText || 'Connect with an expert')}</button>
    <div id="lr-handoff-status-wrap"><span id="lr-handoff-dot"></span><span id="lr-handoff-status"></span></div>
  </div>` : ''}
  <div id="lr-inputbar">
    <textarea id="lr-input" rows="1" placeholder="Type a message..." autocomplete="off"></textarea>
    ${config.continuousVoiceEnabled
      ? `<button id="lr-live" type="button" aria-label="Start voice conversation" data-live-state="idle">${ICON_PHONE}</button>`
      : config.voiceEnabled
        ? `<button id="lr-mic" type="button" aria-label="Record voice message" data-voice-state="idle">${ICON_MIC}</button>`
        : ''}
    <button id="lr-send" aria-label="Send">${ICON_SEND}</button>
  </div>
</div>`;
  }
}
