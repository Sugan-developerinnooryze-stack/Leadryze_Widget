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
  /** "Connect with Your Local Branch" — a SEPARATE, independent capability
   * from Human Handoff above: a deterministic lead-capture form embedded in
   * the panel (no live agent, no socket). Same backward-compat rule: an
   * absent/undefined `connectBranchEnabled` must always mean OFF. */
  connectBranchEnabled?: boolean;
  connectBranchButtonText?: string;
  connectBranchFormTitle?: string;
  connectBranchFormDescription?: string;
  connectBranchSubmitButtonText?: string;
  connectBranchSuccessMessage?: string;
  connectBranchFields?: ConnectBranchFieldConfig[];
}

export interface ConnectBranchFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'dropdown';
  required: boolean;
  /** Dropdown options for a tenant-added CUSTOM dropdown field only — there
   * is no built-in branch-picker field; City/State are plain text (see the
   * reference design), and the backend best-effort matches a Branch from
   * those values server-side instead of the visitor choosing one. */
  options?: string[];
}

export interface ConnectBranchSubmitResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
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

// ══════════════════════════ Icon system ══════════════════════════
// Lucide-style, hand-inlined (no npm "lucide" dependency — this package has
// no framework/bundler-level icon runtime, just string templates, matching
// every existing icon here). ONE stroke-width (1.75) and ONE corner style
// (round caps/joins) across every icon, so nothing looks mismatched sitting
// next to anything else. Sizes: 16–20px for controls, 20–24px for
// quick-action cards — set per call site, not baked into the markup, so the
// same icon constant can be reused at different sizes via CSS/attribute
// override where needed.
const ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
const ICON_CHAT = `<svg viewBox="0 0 24 24" width="25" height="25" ${ICON_STROKE}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" width="17" height="17" ${ICON_STROKE}><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const ICON_RESET = `<svg viewBox="0 0 24 24" width="15" height="15" ${ICON_STROKE}><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M8 21v-5h5"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 24 24" width="17" height="17" ${ICON_STROKE}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 24 24" width="16" height="16" ${ICON_STROKE}><path d="m9 18 6-6-6-6"/></svg>`;
const ICON_CHEVRON_LEFT = `<svg viewBox="0 0 24 24" width="14" height="14" ${ICON_STROKE}><path d="m15 18-6-6 6-6"/></svg>`;
const ICON_MIC = `<svg viewBox="0 0 24 24" width="16" height="16" ${ICON_STROKE}><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/></svg>`;
const ICON_STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const ICON_SPEAKER = `<svg viewBox="0 0 24 24" width="13" height="13" ${ICON_STROKE}><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`;
const ICON_PHONE = `<svg viewBox="0 0 24 24" width="15" height="15" ${ICON_STROKE}><path d="M13.8 16.2a12 12 0 0 1-5.95-5.95l2-2.25a1.7 1.7 0 0 0 .3-1.9L8.5 3.5a1.7 1.7 0 0 0-2-.95L3.9 3.3A1.7 1.7 0 0 0 2.6 5c.5 4.5 2.6 8.8 6 12.2s7.7 5.5 12.2 6a1.7 1.7 0 0 0 1.7-1.3l.75-2.6a1.7 1.7 0 0 0-.95-2l-2.6-1.65a1.7 1.7 0 0 0-1.9.3Z"/></svg>`;
const ICON_PHONE_OFF = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>';
// New, premium-redesign icons
const ICON_HEADSET = `<svg viewBox="0 0 24 24" width="20" height="20" ${ICON_STROKE}><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 14a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3zM3 14a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H3z"/><path d="M21 16v1a4 4 0 0 1-4 4h-3"/></svg>`;
const ICON_MAP_PIN = `<svg viewBox="0 0 24 24" width="20" height="20" ${ICON_STROKE}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const ICON_MESSAGE = `<svg viewBox="0 0 24 24" width="20" height="20" ${ICON_STROKE}><path d="M7.9 18A8 8 0 1 0 4.5 14.6L3 21Z"/></svg>`;
const ICON_USER = `<svg viewBox="0 0 24 24" width="15" height="15" ${ICON_STROKE}><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>`;
const ICON_BUILDING = `<svg viewBox="0 0 24 24" width="15" height="15" ${ICON_STROKE}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/></svg>`;
const ICON_MAIL = `<svg viewBox="0 0 24 24" width="15" height="15" ${ICON_STROKE}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
const ICON_MESSAGE_SQUARE = `<svg viewBox="0 0 24 24" width="15" height="15" ${ICON_STROKE}><path d="M5 19 3 21V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7Z"/></svg>`;
const ICON_CHECK_CIRCLE = `<svg viewBox="0 0 24 24" width="30" height="30" ${ICON_STROKE}><circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 5-5"/></svg>`;
const ICON_SPINNER = '<svg viewBox="0 0 24 24" width="16" height="16" class="lr-spin" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>';

// A small, generic set of quick-reply suggestions — deliberately
// business-type-agnostic (no industry-specific wording), since this same
// bundle serves every tenant regardless of what they sell. Rendered as one
// consistent card list (.lr-qa-card) across every template.
const QUICK_SUGGESTIONS = ['Book an appointment', 'I have a question', 'Talk to a human'];

/** Leading icon for a Connect-with-Branch field, by well-known key first
 * (firstName/lastName/company/email/phone/city/state/message — the built-in
 * fields every tenant starts with), then by TYPE for anything else (a
 * tenant-added custom field) — a dropdown gets the generic message icon, a
 * typed text/email/phone field gets its own icon regardless of key. Every
 * field gets SOME icon (never none), so the input's left padding in the CSS
 * can stay unconditional rather than depending on a :has() selector. */
function connectBranchFieldIcon(key: string, type: ConnectBranchFieldConfig['type']): string {
  switch (key) {
    case 'firstName': case 'lastName': return ICON_USER;
    case 'company': return ICON_BUILDING;
    case 'email': return ICON_MAIL;
    case 'phone': return ICON_PHONE;
    case 'city': case 'state': return ICON_MAP_PIN;
    case 'message': return ICON_MESSAGE_SQUARE;
  }
  switch (type) {
    case 'email': return ICON_MAIL;
    case 'phone': return ICON_PHONE;
    case 'textarea': return ICON_MESSAGE_SQUARE;
    default: return ICON_USER;
  }
}


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
  /** Drives buildQaCard()'s stagger-in animation-delay — reset once per
   * render pass at the top of renderQuickReplies() so the quick-reply cards
   * and the action cards right after them cascade in as one continuous
   * sequence. */
  private cardStaggerIndex = 0;
  private handoffBarEl: HTMLElement | null = null;
  private humanHandoffEnabled: boolean;
  // "Connect with Your Local Branch" — entirely separate elements/state from
  // handoffBarEl/humanHandoffEnabled above; this feature never reads or
  // writes anything Human Handoff owns, and vice versa.
  private connectBranchEnabled: boolean;
  private connectBranchFields: ConnectBranchFieldConfig[];
  private connectBranchPanelEl: HTMLElement | null = null;
  private connectBranchFieldsEl: HTMLElement | null = null;
  private connectBranchErrorEl: HTMLElement | null = null;
  private connectBranchSubmitBtn: HTMLButtonElement | null = null;
  private onSubmitConnectBranch?: (values: Record<string, string>) => Promise<ConnectBranchSubmitResult>;
  // Stored so renderActionCards() can rebuild + rewire these cards again
  // after a reset (resetConversation() wipes #lr-messages, which is now
  // where these cards live — see renderActionCards()'s own doc comment).
  private onRequestHuman?: () => void;
  private onConnectBranchClick?: () => void;
  private humanHandoffButtonText: string;
  private connectBranchButtonText: string;
  private connectBranchFormDescription: string;

  constructor(
    config: WidgetConfig, onSend: (message: string) => void, onMicClick?: () => void,
    onLiveToggle?: () => void, onRequestHuman?: () => void, onReset?: () => void,
    onConnectBranchClick?: () => void,
    onSubmitConnectBranch?: (values: Record<string, string>) => Promise<ConnectBranchSubmitResult>,
  ) {
    this.onSend = onSend;
    this.allowTextDuringVoice = config.allowTextDuringVoice !== false;
    this.quickQuestions = config.quickQuestions?.length ? config.quickQuestions : QUICK_SUGGESTIONS;
    this.humanHandoffEnabled = !!config.humanHandoffEnabled;
    this.connectBranchEnabled = !!config.connectBranchEnabled;
    this.connectBranchFields = config.connectBranchFields ?? [];
    this.onSubmitConnectBranch = onSubmitConnectBranch;
    this.onRequestHuman = onRequestHuman;
    this.onConnectBranchClick = onConnectBranchClick;
    this.humanHandoffButtonText = config.humanHandoffButtonText || 'Connect with an expert';
    this.connectBranchButtonText = config.connectBranchButtonText || 'Connect with Your Local Branch';
    this.connectBranchFormDescription = config.connectBranchFormDescription || "Leave your details and we'll be in touch shortly.";
    const host = document.createElement('div');
    host.id = 'leadryze-widget-host';
    // `all: initial` isolates this host element's own box from the host
    // page's inherited styles — the real isolation is the Shadow DOM below,
    // this is just belt-and-suspenders for the host element itself.
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000;';
    document.body.appendChild(host);
    this.shadow = host.attachShadow({ mode: 'open' });
    const template = config.template ?? 'modern';
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

    // The Connect-with-Branch FORM PANEL (the actual field list, shown via
    // data-form="branch") stays a fixed, static part of the shell — only
    // its TRIGGER card moves into the message flow below, via
    // renderActionCards(). The panel's own Back/Submit buttons are wired
    // once here since the panel itself is never rebuilt.
    if (this.connectBranchEnabled) {
      this.connectBranchPanelEl = this.shadow.getElementById('lr-connect-branch-panel');
      this.connectBranchFieldsEl = this.shadow.getElementById('lr-connect-branch-fields');
      this.connectBranchErrorEl = this.shadow.getElementById('lr-connect-branch-error');
      this.connectBranchSubmitBtn = this.shadow.getElementById('lr-connect-branch-submit') as HTMLButtonElement | null;
      const backBtn = this.shadow.getElementById('lr-connect-branch-back');
      backBtn?.addEventListener('click', () => this.hideConnectBranchForm());
      this.connectBranchSubmitBtn?.addEventListener('click', () => void this.handleConnectBranchSubmit());
    }

    if (config.greeting) this.addMessage('assistant', config.greeting);

    // Renders identically across every template now (premium redesign
    // retired the old per-template pill/stacked-menu split) — previously
    // only wired up for 'chips'/'dark', which silently dropped a tenant's
    // configured Quick Questions on 'modern'/'minimal' (modern is every new
    // tenant's default); that gap no longer exists since there's only one
    // card rendering path left.
    this.renderQuickReplies();
    // Human Handoff's and Connect-with-Branch's own trigger cards — appended
    // right after the quick-reply cards, inside the SAME scrollable
    // #lr-messages flow (not a separately pinned bar below it), so there's
    // no leftover empty space between "the last thing you see" and "these
    // two actions" regardless of how little content came before them.
    this.renderActionCards();
  }

  /** Shared card builder — icon + title + optional description + chevron,
   * the one visual shape used for every clickable "do something" row in the
   * widget (generic quick replies, Human Handoff, Connect with Branch).
   * `.textContent` only, never innerHTML, for the tenant-authored
   * title/description text. */
  private buildQaCard(iconHtml: string, title: string, desc?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'lr-qa-card';
    btn.type = 'button';
    // A gentle cascade (50ms apart, capped at 300ms) rather than every card
    // popping in at once — resets once per render pass in renderQuickReplies().
    btn.style.animationDelay = `${Math.min(this.cardStaggerIndex++ * 50, 300)}ms`;
    const icon = document.createElement('span');
    icon.className = 'lr-qa-icon';
    icon.innerHTML = iconHtml;
    const text = document.createElement('span');
    text.className = 'lr-qa-text';
    const titleEl = document.createElement('span');
    titleEl.className = 'lr-qa-title';
    titleEl.textContent = title;
    text.appendChild(titleEl);
    if (desc) {
      const descEl = document.createElement('span');
      descEl.className = 'lr-qa-desc';
      descEl.textContent = desc;
      text.appendChild(descEl);
    }
    const chevron = document.createElement('span');
    chevron.className = 'lr-qa-chevron';
    chevron.innerHTML = ICON_CHEVRON;
    btn.appendChild(icon);
    btn.appendChild(text);
    btn.appendChild(chevron);
    return btn;
  }

  /** Each quick question renders as a `.lr-qa-card`, one-shot: the whole
   * list is removed the moment any one of them is clicked, same behavior
   * this always had. A generic message-square icon is used for every card
   * here — there's no per-question icon/description metadata in the
   * tenant's Quick Questions config (unlike Human Handoff/Connect with
   * Branch, which have real fields to draw a title+description from). */
  private renderQuickReplies(): void {
    // Reset here (not in renderActionCards) so the two card lists —
    // rendered back-to-back, constructor and after a reset — cascade in as
    // ONE continuous staggered sequence rather than each restarting its own.
    this.cardStaggerIndex = 0;
    const wrap = document.createElement('div');
    wrap.className = 'lr-qa-list';
    for (const label of this.quickQuestions) {
      const btn = this.buildQaCard(ICON_MESSAGE, label);
      btn.addEventListener('click', () => {
        wrap.remove();
        this.sendText(label);
      });
      wrap.appendChild(btn);
    }
    this.messagesEl.appendChild(wrap);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Human Handoff's and Connect-with-Branch's own trigger cards — built and
   * appended into the SAME #lr-messages flow as the quick-reply cards above
   * (not a separately pinned bar below it, which previously left a big,
   * ugly empty gap whenever there wasn't much conversation yet to fill
   * #lr-messages' own flex:1 height). Unlike quick replies, these are
   * PERSISTENT — never removed on click — since Human Handoff needs to keep
   * showing live status (idle/waiting/claimed) for the rest of the session,
   * and Connect with Branch just opens the form panel rather than sending a
   * message. Rebuilt fresh each call (constructor, and again after
   * resetConversation() wipes #lr-messages) — `this.handoffBarEl` always
   * points at the CURRENT one, which is all setHandoffState() needs. */
  private renderActionCards(): void {
    if (!this.humanHandoffEnabled && !this.connectBranchEnabled) return;
    const wrap = document.createElement('div');
    wrap.className = 'lr-qa-list';

    if (this.humanHandoffEnabled) {
      const bar = document.createElement('div');
      bar.id = 'lr-handoff-bar';
      bar.dataset.state = 'idle';
      const btn = this.buildQaCard(ICON_HEADSET, this.humanHandoffButtonText, 'Chat live with our team');
      btn.id = 'lr-handoff-btn';
      if (this.onRequestHuman) btn.addEventListener('click', () => this.onRequestHuman!());
      const statusWrap = document.createElement('div');
      statusWrap.id = 'lr-handoff-status-wrap';
      const dot = document.createElement('span');
      dot.id = 'lr-handoff-dot';
      const status = document.createElement('span');
      status.id = 'lr-handoff-status';
      statusWrap.appendChild(dot);
      statusWrap.appendChild(status);
      bar.appendChild(btn);
      bar.appendChild(statusWrap);
      wrap.appendChild(bar);
      this.handoffBarEl = bar;
    }

    if (this.connectBranchEnabled) {
      const btn = this.buildQaCard(ICON_MAP_PIN, this.connectBranchButtonText, this.connectBranchFormDescription);
      btn.id = 'lr-connect-branch-btn';
      if (this.onConnectBranchClick) btn.addEventListener('click', () => this.onConnectBranchClick!());
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

  /** Drives the persistent handoff card's three states — NOT a quick-reply
   * chip (those self-remove after one click; a visitor might want to check
   * or re-trigger this at any point in the conversation, so it's never
   * removed — just stays part of the message flow, same as any other card).
   * 'idle' shows the button; 'waiting'/'claimed' replace it with a live
   * status line. No-ops entirely if humanHandoff was never enabled for this
   * tenant — the bar element doesn't exist in the DOM at all in that case. */
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

  /** Builds and shows the Connect-with-Branch form INSIDE the panel —
   * replaces #lr-messages/#lr-handoff-bar/#lr-inputbar via the
   * `data-form="branch"` attribute on #lr-panel (see the CSS in
   * renderShell), never touching Human Handoff's own `data-state` attribute
   * or handoffBarEl. Fields are built fresh every call (not cached) from
   * `connectBranchFields`, with `createElement`/`.textContent` only — never
   * `innerHTML` with tenant-authored label text, matching this file's
   * existing XSS posture for item-card titles. City/State are plain text
   * fields here (matching the reference design) — the backend resolves
   * which Branch they map to server-side, so there is no branch dropdown to
   * populate. */
  showConnectBranchForm(): void {
    if (!this.connectBranchFieldsEl) return;
    this.connectBranchFieldsEl.innerHTML = '';
    this.setConnectBranchFieldErrors({});

    for (const field of this.connectBranchFields) {
      const wrap = document.createElement('div');
      wrap.className = 'lr-cb-field';

      // No separate label row — the field's own name (plus a required
      // asterisk) IS the placeholder inside the box, matching the reference
      // design exactly: a plain, unlabeled input per field, nothing above
      // it — but WITH its leading icon kept, inside the same box.
      const placeholderText = field.label + (field.required ? '*' : '');

      const controlWrap = document.createElement('div');
      controlWrap.className = 'lr-cb-field-control';

      let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (field.type === 'textarea') {
        control = document.createElement('textarea');
        control.rows = 3;
        control.placeholder = placeholderText;
        controlWrap.dataset.multiline = '1';
      } else if (field.type === 'dropdown') {
        const select = document.createElement('select');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderText;
        select.appendChild(placeholder);
        for (const opt of field.options ?? []) {
          const el = document.createElement('option');
          el.value = opt;
          el.textContent = opt;
          select.appendChild(el);
        }
        control = select;
      } else {
        const input = document.createElement('input');
        input.type = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text';
        input.placeholder = placeholderText;
        control = input;
      }
      control.id = `lr-cb-${field.key}`;
      control.dataset.fieldKey = field.key;

      const icon = document.createElement('span');
      icon.className = 'lr-cb-field-icon';
      icon.innerHTML = connectBranchFieldIcon(field.key, field.type);
      controlWrap.appendChild(icon);
      controlWrap.appendChild(control);
      wrap.appendChild(controlWrap);

      const err = document.createElement('div');
      err.className = 'lr-cb-field-error';
      err.id = `lr-cb-err-${field.key}`;
      wrap.appendChild(err);

      this.connectBranchFieldsEl.appendChild(wrap);

      // Clears that one field's inline error (and its red border) the
      // moment it has a value — both this and updateSubmitEnabled() are
      // purely client-side UX polish; the server re-validates everything
      // regardless, so neither can let an invalid submission through on
      // its own.
      control.addEventListener('input', () => {
        if (control.value.trim()) this.setConnectBranchFieldErrors({
          ...this.getConnectBranchFieldErrorsSnapshot(), [field.key]: '',
        });
        this.updateConnectBranchSubmitEnabled();
      });
    }

    this.updateConnectBranchSubmitEnabled();
    this.panelEl.dataset.form = 'branch';
  }

  /** Disables Submit until every required field has a non-empty value — a
   * fast, local signal only (never the source of truth: the server
   * re-validates every field against the tenant's own saved config on
   * submit regardless, including email/phone format, which this check
   * deliberately doesn't duplicate). */
  private updateConnectBranchSubmitEnabled(): void {
    if (!this.connectBranchFieldsEl || !this.connectBranchSubmitBtn) return;
    const allRequiredFilled = this.connectBranchFields.every((field) => {
      if (!field.required) return true;
      const control = this.connectBranchFieldsEl!.querySelector(`#lr-cb-${field.key}`) as
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      return !!control?.value.trim();
    });
    this.connectBranchSubmitBtn.disabled = !allRequiredFilled;
  }

  private getConnectBranchFieldErrorsSnapshot(): Record<string, string> {
    if (!this.connectBranchFieldsEl) return {};
    const snapshot: Record<string, string> = {};
    for (const field of this.connectBranchFields) {
      const el = this.connectBranchFieldsEl.querySelector(`#lr-cb-err-${field.key}`);
      if (el?.textContent) snapshot[field.key] = el.textContent;
    }
    return snapshot;
  }

  /** Back button — returns to the normal conversation exactly as it was;
   * nothing in #lr-messages/#lr-handoff-bar was ever touched while the form
   * was open. */
  hideConnectBranchForm(): void {
    delete this.panelEl.dataset.form;
  }

  private setConnectBranchFieldErrors(errors: Record<string, string>): void {
    if (!this.connectBranchFieldsEl) return;
    for (const field of this.connectBranchFields) {
      const el = this.connectBranchFieldsEl.querySelector(`#lr-cb-err-${field.key}`);
      if (el) el.textContent = errors[field.key] ?? '';
      const control = this.connectBranchFieldsEl.querySelector(`#lr-cb-${field.key}`);
      control?.classList.toggle('lr-cb-invalid', !!errors[field.key]);
    }
    if (this.connectBranchErrorEl) {
      this.connectBranchErrorEl.textContent = errors._form ?? '';
      this.connectBranchErrorEl.style.display = errors._form ? 'block' : 'none';
    }
  }

  /** Swaps the submit button's icon for a spinner and disables it for the
   * duration of the request — also the one thing standing between a visitor
   * double-clicking Submit and firing two network requests for the same
   * enquiry (the backend's own session claim is the real duplicate guard;
   * this is just the visible, immediate feedback layer). */
  private setConnectBranchSubmitting(submitting: boolean): void {
    if (!this.connectBranchSubmitBtn) return;
    this.connectBranchSubmitBtn.disabled = submitting;
    const iconEl = this.shadow.getElementById('lr-connect-branch-submit-icon');
    if (iconEl) iconEl.innerHTML = submitting ? ICON_SPINNER : ICON_SEND;
  }

  /** Client-side required-field check only (a fast, no-network first pass) —
   * the server re-validates every field against the tenant's own saved
   * config regardless, so this is purely to avoid a wasted round trip for
   * the common case of an empty required field. */
  private async handleConnectBranchSubmit(): Promise<void> {
    if (!this.connectBranchFieldsEl || !this.onSubmitConnectBranch) return;
    const values: Record<string, string> = {};
    const clientErrors: Record<string, string> = {};
    for (const field of this.connectBranchFields) {
      const control = this.connectBranchFieldsEl.querySelector(`#lr-cb-${field.key}`) as
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      const value = control?.value.trim() ?? '';
      values[field.key] = value;
      if (field.required && !value) clientErrors[field.key] = `${field.label} is required`;
    }
    if (Object.keys(clientErrors).length > 0) {
      this.setConnectBranchFieldErrors(clientErrors);
      return;
    }

    this.setConnectBranchSubmitting(true);
    const result = await this.onSubmitConnectBranch(values);
    this.setConnectBranchSubmitting(false);

    if (result.ok) {
      this.showConnectBranchSuccess(result.message);
    } else if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      this.setConnectBranchFieldErrors(result.fieldErrors);
    } else {
      this.setConnectBranchFieldErrors({ _form: result.message || 'Something went wrong — please try again.' });
    }
  }

  /** Replaces the form with a polished check-circle confirmation card (not a
   * plain text bubble) appended to the normal conversation — same
   * "chat window, not a standalone modal" feel the rest of the widget
   * already has, just dressed appropriately for "you successfully did a
   * thing" rather than looking like an ordinary assistant reply. */
  private showConnectBranchSuccess(message?: string): void {
    this.hideConnectBranchForm();
    if (this.typingEl) { this.typingEl.remove(); this.typingEl = null; }
    const card = document.createElement('div');
    card.className = 'lr-success-card';
    const icon = document.createElement('div');
    icon.className = 'lr-success-icon';
    icon.innerHTML = ICON_CHECK_CIRCLE;
    const text = document.createElement('div');
    text.className = 'lr-success-text';
    text.textContent = message || "Thanks! We've received your details and will be in touch shortly.";
    card.appendChild(icon);
    card.appendChild(text);
    this.messagesEl.appendChild(card);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** "Start a new conversation" — clears the visible transcript and any
   * in-progress typing/live-segment state, and re-renders the greeting +
   * quick replies + action cards exactly as a brand-new widget load would.
   * The handoff bar is rebuilt fresh by renderActionCards() below (always
   * starts at idle — a fresh session has no active handoff — so there's no
   * separate "reset it to idle" step needed first). Purely a UI reset —
   * loader.ts is the one that actually mints the new sessionId and tears
   * down any live handoff socket; this method doesn't know about either. */
  resetConversation(greeting: string): void {
    this.messagesEl.innerHTML = '';
    this.liveMessages.clear();
    this.typingEl = null;
    if (greeting) this.addMessage('assistant', greeting);
    this.renderQuickReplies();
    this.renderActionCards();
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
    // Default accent is now a premium teal (was a generic blue) — the
    // out-of-the-box look for a tenant who's never opened Appearance.
    const color = theme.accentColor || config.primaryColor || '#00A6B7';
    const colorDark = shade(color, -0.18);
    // Default header is a deep-navy → teal gradient (not just the accent
    // shaded darker) for the premium look the reference design uses — only
    // when the tenant hasn't picked their own single headerColor, in which
    // case the old "shade it darker" 2-stop gradient still applies exactly
    // as before (a 2-stop navy→teal gradient only makes sense for OUR OWN
    // default palette, not an arbitrary tenant color).
    const headerBg     = theme.headerColor || '#102A43';
    const headerBgDark = theme.headerColor ? shade(headerBg, -0.18) : color;
    const headerText   = theme.headerTextColor || '#ffffff';
    const bgColor      = theme.backgroundColor || '#F5F8FB';
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
    const botText      = theme.botTextColor || '#172B4D';
    const userBubble   = theme.userBubbleColor || color;
    const userText     = theme.userTextColor || '#ffffff';
    // Inter by default (premium redesign) — falls through to the system
    // stack only if Inter itself somehow fails to load.
    const fontFamily   = theme.fontFamily || "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
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
    const googleFontName = Object.keys(GOOGLE_FONTS).find((name) => fontFamily.includes(name));
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
    position: fixed; right: 22px; bottom: 22px; width: 58px; height: 58px; border-radius: 50%;
    border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, ${color} 0%, ${colorDark} 100%);
    box-shadow: 0 8px 20px -6px ${color}5c, 0 2px 8px rgba(16,42,67,0.14);
    transition: transform .15s ease, box-shadow .15s ease;
    /* A restrained, slow presence pulse — not a constant attention-grabbing
       bounce. A box-shadow ring (not a separate layered element) so it stays
       geometrically concentric with the button. */
    animation: lr-ring-pulse 3.6s cubic-bezier(.4,0,.6,1) infinite;
  }
  #lr-bubble-wrap { position: fixed; right: 22px; bottom: 22px; animation: lr-bubble-in .45s cubic-bezier(.34,1.56,.64,1); }
  #lr-bubble-wrap #lr-bubble { position: static; }
  #lr-bubble:hover { transform: scale(1.05); box-shadow: 0 12px 24px -6px ${color}70, 0 2px 8px rgba(16,42,67,0.16); }
  #lr-bubble:active { transform: scale(.97); }
  @keyframes lr-ring-pulse {
    0%   { box-shadow: 0 8px 20px -6px ${color}5c, 0 2px 8px rgba(16,42,67,0.14), 0 0 0 0 ${color}40; }
    70%  { box-shadow: 0 8px 20px -6px ${color}5c, 0 2px 8px rgba(16,42,67,0.14), 0 0 0 8px ${color}00; }
    100% { box-shadow: 0 8px 20px -6px ${color}5c, 0 2px 8px rgba(16,42,67,0.14), 0 0 0 8px ${color}00; }
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
  #lr-header-sub { display: flex; align-items: center; gap: 5px; font-size: 11.5px; opacity: .85; margin-top: 2px; }
  #lr-header-online-dot { width: 6px; height: 6px; border-radius: 50%; background: #16A34A; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,0.25); }
  #lr-close, #lr-reset { background: rgba(255,255,255,0.14); border: none; color: ${headerText}; width: 29px; height: 29px; border-radius: 50%;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .15s ease, transform .15s ease; }
  #lr-close:hover, #lr-reset:hover { background: rgba(255,255,255,0.26); transform: scale(1.08); }
  #lr-reset:active { transform: scale(.92) rotate(-45deg); }
  #lr-status { display: none; align-items: center; gap: 6px; padding: 6px 16px 12px; font-size: 11px; color: ${headerText}; margin-bottom: -1px; background: ${headerBg}; }
  #lr-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #16A34A; animation: lr-pulse 1.8s infinite ease-in-out; }
  #lr-wave { display: none; width: 100%; height: 14px; margin-top: -1px; flex-shrink: 0; }

  #lr-badge { position: absolute; top: -2px; right: -2px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px;
    background: #DC2626; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    border: 2px solid #fff; }

  #lr-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: transparent; }
  #lr-messages::-webkit-scrollbar { width: 6px; }
  #lr-messages::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }

  .lr-msg { max-width: 82%; padding: 9px 13px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap;
    word-break: break-word; animation: lr-fade-in .18s ease; transform-origin: bottom center; }
  .lr-msg-assistant { align-self: flex-start; background: ${botBubble}; border: 1px solid #E2E8F0; color: ${botText};
    animation: lr-slide-in-left .32s cubic-bezier(.34,1.56,.64,1); }
  .lr-msg-user { align-self: flex-end; background: ${userBubble}; color: ${userText};
    animation: lr-slide-in-right .32s cubic-bezier(.34,1.56,.64,1); }

  .lr-typing { display: flex; align-items: center; gap: 4px; padding: 12px 14px; }
  .lr-typing span { width: 6px; height: 6px; border-radius: 50%; background: #94A3B8; display: inline-block;
    animation: lr-bounce 1.2s infinite ease-in-out; }
  .lr-typing span:nth-child(2) { animation-delay: .15s; }
  .lr-typing span:nth-child(3) { animation-delay: .3s; }

  /* ══════ Action cards — ONE shared premium visual language for every ══════
   * clickable "do something" surface in the widget: generic quick-question
   * replies (one-shot — the whole list is removed after a click), and the
   * two persistent, state-aware actions below (Human Handoff, Connect with
   * Branch) — all built by buildQaCard() and all living in the SAME
   * scrollable #lr-messages flow (renderQuickReplies()/renderActionCards()),
   * never a separately pinned bar below it, so there's never leftover empty
   * space between "the last thing you see" and these actions. */
  .lr-qa-card {
    display: flex; align-items: center; gap: 11px; width: 100%; text-align: left;
    background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px;
    cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
    font-family: inherit;
    /* animation-fill-mode backwards keeps the card in its opacity:0 starting
       frame for the whole animation-delay (set per-card in JS for the
       stagger effect) — without it, a delayed card would flash fully
       visible first, then suddenly jump back to invisible the instant its
       delay elapsed. */
    animation: lr-fade-in .3s ease backwards;
  }
  .lr-qa-card:hover { border-color: ${color}; box-shadow: 0 4px 14px -5px ${color}4d; transform: translateY(-1px); }
  .lr-qa-card:active { transform: translateY(0) scale(.99); }
  .lr-qa-icon { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: ${color}17; color: ${color}; }
  /* .lr-qa-title/.lr-qa-desc are <span>s (inline by default) — without this,
     a card WITH a description ran its title and description together on
     the same line instead of stacking them, since nothing forced a line
     break between two inline children. */
  .lr-qa-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .lr-qa-title { font-size: 13px; font-weight: 600; color: #172B4D; line-height: 1.3; }
  .lr-qa-desc { font-size: 11.5px; color: #64748B; line-height: 1.35; margin-top: 1px; }
  .lr-qa-chevron { flex-shrink: 0; color: #94A3B8; transition: color .15s ease; }
  .lr-qa-card:hover .lr-qa-chevron { color: ${color}; }
  .lr-qa-list { display: flex; flex-direction: column; gap: 8px; width: 100%; align-self: stretch; animation: lr-fade-in .2s ease; }

  /* #lr-handoff-bar is just a plain wrapper around #lr-handoff-btn (the
     .lr-qa-card) + #lr-handoff-status-wrap, living inside .lr-qa-list —
     data-state only ever toggles which of those TWO children shows, never
     the bar's own visibility (it's always a normal list item now). */
  #lr-handoff-bar[data-state="waiting"] #lr-handoff-btn, #lr-handoff-bar[data-state="claimed"] #lr-handoff-btn { display: none; }
  #lr-handoff-status-wrap { display: none; align-items: center; gap: 10px; background: #F5F8FB; border: 1px solid #E2E8F0;
    border-radius: 12px; padding: 10px 12px; font-size: 12.5px; color: #172B4D; font-weight: 500; }
  #lr-handoff-bar[data-state="waiting"] #lr-handoff-status-wrap, #lr-handoff-bar[data-state="claimed"] #lr-handoff-status-wrap { display: flex; }
  #lr-handoff-dot { width: 8px; height: 8px; border-radius: 50%; background: #16A34A; flex-shrink: 0; animation: lr-pulse 1.8s infinite ease-in-out; }

  #lr-panel[data-form="branch"] #lr-messages,
  #lr-panel[data-form="branch"] #lr-inputbar { display: none; }

  /* Header stays fixed (#lr-header, above), composer stays fixed
     (#lr-inputbar, hidden while the form is open anyway) — only the form's
     OWN content scrolls, in #lr-connect-branch-scroll, while the submit
     button sits in a separate, non-scrolling footer below it so it's always
     reachable regardless of how many fields a tenant has configured. */
  #lr-connect-branch-panel { display: none; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
  #lr-panel[data-form="branch"] #lr-connect-branch-panel { display: flex; }
  #lr-connect-branch-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 18px 4px; }
  #lr-connect-branch-back { align-self: flex-start; display: flex; align-items: center; gap: 4px; border: none;
    background: transparent; color: #64748B; font-size: 12px; font-weight: 600; cursor: pointer; padding: 2px 0 10px; }
  #lr-connect-branch-back:hover { color: ${color}; }
  #lr-connect-branch-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
  #lr-connect-branch-title-icon { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
    border-radius: 8px; background: ${color}17; color: ${color}; flex-shrink: 0; }
  #lr-connect-branch-title-icon svg { width: 15px; height: 15px; }
  #lr-connect-branch-title { font-size: 15px; font-weight: 700; color: #172B4D; }
  #lr-connect-branch-desc { font-size: 12.5px; color: #64748B; line-height: 1.35; margin-bottom: 12px; }
  /* Compact, direct-to-fill layout (matching the reference exactly) — no
     dead space reserved for an error that isn't there. .lr-cb-field-error
     has no min-height/margin of its own, so an empty one (the common case)
     collapses to 0px; the :not(:empty) rule below is the ONLY thing that
     ever adds space for it, and only once there's real error text to show. */
  /* No label row at all — each field is just one icon-prefixed box, the
     field's own name is its placeholder, matching the reference design
     exactly (no header text above any input). */
  #lr-connect-branch-fields { display: flex; flex-direction: column; gap: 8px; }
  .lr-cb-field { display: flex; flex-direction: column; gap: 3px; }
  .lr-cb-field-control { position: relative; display: flex; align-items: center; }
  .lr-cb-field-icon { position: absolute; left: 12px; display: flex; align-items: center; justify-content: center;
    color: #94A3B8; pointer-events: none; }
  .lr-cb-field-control[data-multiline] .lr-cb-field-icon { align-self: flex-start; margin-top: 11px; }
  .lr-cb-field input, .lr-cb-field select, .lr-cb-field textarea {
    width: 100%; min-height: 40px; padding: 8px 12px 8px 34px; border: 1px solid #E2E8F0; border-radius: 10px; font-size: 13.5px;
    font-family: inherit; outline: none; background: #fff; color: #172B4D; transition: border-color .15s ease, box-shadow .15s ease;
    resize: vertical;
  }
  .lr-cb-field input::placeholder, .lr-cb-field textarea::placeholder { color: #94A3B8; }
  .lr-cb-field textarea { min-height: 64px; }
  .lr-cb-field input:focus, .lr-cb-field select:focus, .lr-cb-field textarea:focus {
    border-color: ${color}; box-shadow: 0 0 0 3px ${color}1f; }
  /* Invalid state — red border on the box itself (not just red text below
     it), matching the reference's own required-field styling exactly. */
  .lr-cb-invalid { border-color: #DC2626 !important; }
  .lr-cb-invalid:focus { box-shadow: 0 0 0 3px #DC26261f !important; }
  .lr-cb-field-control:has(.lr-cb-invalid) .lr-cb-field-icon { color: #DC2626; }
  .lr-cb-field-error { font-size: 11px; color: #DC2626; line-height: 1.3; }
  .lr-cb-field-error:not(:empty) { margin-top: 2px; }
  #lr-connect-branch-footer { flex-shrink: 0; padding: 10px 18px 16px; border-top: 1px solid #E2E8F0; background: #fff; }
  #lr-connect-branch-error { display: none; font-size: 12px; color: #DC2626; margin-bottom: 8px; }
  #lr-connect-branch-submit { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
    height: 46px; border: none; color: #fff; background: linear-gradient(135deg, ${color} 0%, ${colorDark} 100%);
    border-radius: 11px; font-size: 13.5px; font-weight: 600; cursor: pointer;
    box-shadow: 0 4px 12px -4px ${color}66; transition: opacity .15s ease, transform .1s ease, box-shadow .15s ease; }
  #lr-connect-branch-submit:hover:not(:disabled) { box-shadow: 0 6px 16px -4px ${color}80; }
  #lr-connect-branch-submit:active:not(:disabled) { transform: scale(.98); }
  #lr-connect-branch-submit:disabled { opacity: .55; cursor: default; box-shadow: none; }
  .lr-spin { animation: lr-spin 0.8s linear infinite; }
  @keyframes lr-spin { to { transform: rotate(360deg); } }

  /* ══════ Success confirmation — a dedicated card, not a plain text bubble ══════ */
  .lr-success-card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;
    align-self: center; max-width: 88%; padding: 18px 16px; background: #fff; border: 1px solid #E2E8F0;
    border-radius: 14px; animation: lr-fade-in .25s ease; }
  .lr-success-icon { color: #16A34A; }
  .lr-success-text { font-size: 13px; color: #172B4D; line-height: 1.45; }

  /* Narrow viewports — near-full-screen with safe margins, not just a
     width clamp: #lr-panel otherwise had no viewport-relative constraint at
     all beyond an 80vh max-height, so a fixed compact/standard/large px
     size could overflow a small phone both horizontally AND vertically. */
  @media (max-width: 480px) {
    #lr-bubble-wrap { right: 16px; bottom: 16px; }
    #lr-panel {
      right: 10px; left: 10px; top: max(10px, env(safe-area-inset-top));
      bottom: max(10px, env(safe-area-inset-bottom)); width: auto; height: auto; max-height: none;
      border-radius: 16px;
    }
  }

  #lr-inputbar { display: flex; align-items: flex-end; gap: 8px; padding: 12px; border-top: 1px solid #E2E8F0; background: transparent; flex-shrink: 0; }
  #lr-input { flex: 1; padding: 10px 14px; border: 1px solid #E2E8F0; border-radius: 18px; font-size: 13.5px;
    font-family: inherit; line-height: 1.4; resize: none; outline: none; transition: border-color .15s ease, box-shadow .15s ease;
    max-height: 96px; overflow-y: auto; background: #fff; }
  #lr-input:focus { border-color: ${color}; box-shadow: 0 0 0 3px ${color}1f; }
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
  #lr-mic[data-voice-state="recording"] { background: #DC2626; border-color: #DC2626; color: #fff; animation: lr-pulse 1.1s infinite ease-in-out; }
  #lr-mic[data-voice-state="uploading"], #lr-mic[data-voice-state="thinking"], #lr-mic[data-voice-state="speaking"] { opacity: .7; }

  #lr-live { border: 1.5px solid ${color}; color: ${color}; background: #fff; border-radius: 50%; width: 36px; height: 36px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform .1s ease, background .15s ease, color .15s ease; }
  #lr-live:hover { transform: scale(1.06); }
  #lr-live[data-live-state="active"] { background: #DC2626; border-color: #DC2626; color: #fff; animation: lr-pulse 1.4s infinite ease-in-out; }

  .lr-play-fallback { display: flex; align-items: center; gap: 6px; align-self: flex-start; background: #fff;
    border: 1.5px solid ${color}; color: ${color}; font-size: 12px; font-weight: 600; padding: 6px 12px;
    border-radius: 999px; cursor: pointer; transition: background .15s ease, color .15s ease; animation: lr-fade-in .18s ease; }
  .lr-play-fallback:hover { background: ${color}; color: #fff; }

  /* ══════ Item / product cards — one shared style across all 4 templates, ══════
   * using the tenant's own color tokens rather than per-template bespoke designs. */
  .lr-cards { display: flex; flex-direction: column; gap: 8px; align-self: stretch; animation: lr-fade-in .2s ease; }
  .lr-card { display: flex; gap: 10px; background: #fff; border: 1px solid #E2E8F0; border-radius: 10px;
    padding: 10px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
  .lr-card-img { width: 64px; height: 64px; flex-shrink: 0; border-radius: 8px; object-fit: cover; background: #F5F8FB; }
  .lr-card-img-placeholder { display: flex; align-items: center; justify-content: center; background:
    linear-gradient(135deg, #eef0f4, #e4e7ec); }
  .lr-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .lr-card-title { font-size: 13.5px; font-weight: 700; color: #172B4D; line-height: 1.3; }
  .lr-card-price { font-size: 13px; font-weight: 600; color: ${color}; }
  .lr-card-specs { font-size: 11.5px; color: #64748B; line-height: 1.4; }
  .lr-card-actions { display: flex; gap: 6px; margin-top: 4px; }
  .lr-card-btn { flex: 1; border: 1.5px solid ${color}; background: #fff; color: ${color}; font-size: 11.5px;
    font-weight: 600; padding: 6px 8px; border-radius: 999px; cursor: pointer; transition: background .15s ease, color .15s ease; }
  .lr-card-btn:hover { background: ${color}; color: #fff; }
  .lr-card-btn-primary { background: ${color}; color: #fff; }
  .lr-card-btn-primary:hover { background: ${colorDark}; }
  .lr-cards-more { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748B; align-self: stretch; }
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

  /* ══════════════════ Compact Chips ══════════════════ */
  #lr-panel[data-template="chips"] #lr-avatar { background: #fff; color: ${headerBg}; }
  #lr-panel[data-template="chips"] .lr-msg { border-radius: 12px; }
  #lr-panel[data-template="chips"] .lr-msg-assistant { border-radius: 4px 12px 12px 12px; }
  #lr-panel[data-template="chips"] .lr-msg-user { border-radius: 12px 4px 12px 12px; }

  /* ══════════════════ Dark Professional — dark chrome ══════════════════
   * Quick-action cards (.lr-qa-card) are defined ONCE, above, and look
   * identical across every template — premium redesign retired the old
   * per-template pill/stacked-menu split in favor of one consistent card
   * language everywhere. */
  #lr-panel[data-template="dark"] #lr-avatar { background: rgba(255,255,255,0.1); }
  #lr-panel[data-template="dark"] #lr-close, #lr-panel[data-template="dark"] #lr-reset { background: rgba(255,255,255,0.08); }
  #lr-panel[data-template="dark"] #lr-close:hover, #lr-panel[data-template="dark"] #lr-reset:hover { background: rgba(255,255,255,0.16); }
  #lr-panel[data-template="dark"] .lr-msg { border-radius: 4px 12px 12px 12px; }
  #lr-panel[data-template="dark"] .lr-msg-user { border-radius: 12px 4px 12px 12px; }
  #lr-panel[data-template="dark"] #lr-inputbar { background: transparent; border-top-color: #e4e6ea; }
</style>
<div id="lr-bubble-wrap">
  <button id="lr-bubble" data-template="${template}" aria-label="Chat with us" title="Chat with us">${ICON_CHAT}</button>
  <span id="lr-badge">1</span>
</div>
<div id="lr-panel" data-template="${template}">
  <div id="lr-header">
    <div id="lr-avatar">${avatar}</div>
    <div id="lr-header-text">
      <span id="lr-header-name">${escapeHtml(config.agentName)}</span>
      <span id="lr-header-sub"><span id="lr-header-online-dot"></span>${escapeHtml(config.companyName)}</span>
    </div>
    <button id="lr-reset" aria-label="Start a new conversation" title="Start a new conversation">${ICON_RESET}</button>
    <button id="lr-close" aria-label="Close chat" title="Close">${ICON_CLOSE}</button>
  </div>
  <div id="lr-status"><span id="lr-status-dot"></span><span id="lr-status-text">We're online</span></div>
  ${hasBgImage ? '' : `<svg id="lr-wave" viewBox="0 0 336 14" preserveAspectRatio="none"><path d="M0,0 C56,14 112,14 168,7 C224,0 280,0 336,7 L336,14 L0,14 Z" fill="${bgColor}"/></svg>`}
  <div id="lr-messages"></div>
  ${config.connectBranchEnabled ? `
  <div id="lr-connect-branch-panel">
    <div id="lr-connect-branch-scroll">
      <button id="lr-connect-branch-back" type="button">${ICON_CHEVRON_LEFT}<span>Back</span></button>
      <div id="lr-connect-branch-title-row">
        <span id="lr-connect-branch-title-icon">${ICON_MAP_PIN}</span>
        <div id="lr-connect-branch-title">${escapeHtml(config.connectBranchFormTitle || 'Connect with a branch')}</div>
      </div>
      <div id="lr-connect-branch-desc">${escapeHtml(config.connectBranchFormDescription || "Leave your details and we'll be in touch shortly.")}</div>
      <div id="lr-connect-branch-fields"></div>
    </div>
    <div id="lr-connect-branch-footer">
      <div id="lr-connect-branch-error"></div>
      <button id="lr-connect-branch-submit" type="button">
        <span id="lr-connect-branch-submit-icon">${ICON_SEND}</span>
        <span id="lr-connect-branch-submit-label">${escapeHtml(config.connectBranchSubmitButtonText || 'Submit Request')}</span>
      </button>
    </div>
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
