export interface WidgetConfig {
  companyName: string;
  agentName: string;
  logoUrl?: string;
  primaryColor: string;
  greeting: string;
  template?: 'modern' | 'minimal' | 'chips' | 'dark';
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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
const ICON_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

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
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private panelEl: HTMLElement;
  private bubbleEl: HTMLElement;
  private open = false;
  private onSend: (message: string) => void;
  private typingEl: HTMLElement | null = null;

  constructor(config: WidgetConfig, onSend: (message: string) => void) {
    this.onSend = onSend;
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
    this.inputEl    = this.shadow.getElementById('lr-input') as HTMLInputElement;
    this.sendBtn    = this.shadow.getElementById('lr-send') as HTMLButtonElement;
    const closeEl   = this.shadow.getElementById('lr-close') as HTMLElement;

    this.bubbleEl.addEventListener('click', () => this.toggle());
    closeEl.addEventListener('click', () => this.toggle());
    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSend();
    });

    if (config.greeting) this.addMessage('assistant', config.greeting);

    if (template === 'chips') this.renderQuickReplies('lr-chips', 'lr-chip');
    if (template === 'dark') this.renderQuickReplies('lr-actions', 'lr-action');
  }

  /** Same suggestion list, rendered as either horizontal pills (chips
   * template) or a vertical stacked menu (dark template) — the wrapper/item
   * class names are the only difference; both send identically on click. */
  private renderQuickReplies(wrapClass: string, itemClass: string): void {
    const wrap = document.createElement('div');
    wrap.className = wrapClass;
    for (const label of QUICK_SUGGESTIONS) {
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

  private handleSend(): void {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';
    this.sendText(text);
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
      requestAnimationFrame(() => this.inputEl.focus());
    } else {
      // Let the closing transition finish before actually hiding, so the
      // panel fades/scales out instead of just vanishing.
      setTimeout(() => { if (!this.open) this.panelEl.style.display = 'none'; }, 160);
    }
  }

  addMessage(role: 'user' | 'assistant', text: string): void {
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
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  setBusy(busy: boolean): void {
    this.sendBtn.disabled = busy;
    this.inputEl.disabled = busy;
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

  private renderShell(config: WidgetConfig, template: string): string {
    const color = config.primaryColor || '#2563eb';
    const colorDark = shade(color, -0.18);
    const avatar = config.logoUrl
      ? `<img src="${escapeHtml(config.logoUrl)}" alt="" id="lr-avatar-img" />`
      : `<span id="lr-avatar-fallback">${escapeHtml((config.agentName || config.companyName || '?').charAt(0).toUpperCase())}</span>`;

    return `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  @keyframes lr-pop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes lr-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }
  @keyframes lr-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes lr-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

  /* ══════════════════════════ Base — shared plumbing only ══════════════════════════ */
  #lr-bubble {
    position: fixed; right: 22px; bottom: 22px; width: 60px; height: 60px; border-radius: 50%;
    border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    background: ${color}; box-shadow: 0 10px 24px -6px ${color}66, 0 2px 8px rgba(0,0,0,0.15);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  #lr-bubble:hover { transform: scale(1.06); box-shadow: 0 14px 28px -6px ${color}80, 0 2px 8px rgba(0,0,0,0.18); }
  #lr-bubble:active { transform: scale(.97); }

  #lr-panel {
    display: none; flex-direction: column; position: fixed; right: 22px; bottom: 96px;
    width: 336px; height: 470px; max-height: 72vh; background: #fff; border-radius: 18px;
    box-shadow: 0 20px 50px -12px rgba(15,23,42,0.3), 0 4px 14px rgba(15,23,42,0.1);
    overflow: hidden; opacity: 0; transform: translateY(10px) scale(.97);
    transition: opacity .16s ease, transform .16s ease;
  }
  #lr-panel.lr-open { opacity: 1; transform: translateY(0) scale(1); animation: lr-pop .16s ease; }

  #lr-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; color: #fff; flex-shrink: 0; }
  #lr-avatar { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.22);
    display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; font-weight: 700; font-size: 14px; }
  #lr-avatar-img { width: 100%; height: 100%; object-fit: cover; }
  #lr-header-text { flex: 1; min-width: 0; }
  #lr-header-name { display: block; font-size: 14px; font-weight: 600; letter-spacing: .1px; }
  #lr-header-sub { display: block; font-size: 11.5px; opacity: .85; margin-top: 1px; }
  #lr-close { background: rgba(255,255,255,0.14); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .15s ease; }
  #lr-close:hover { background: rgba(255,255,255,0.26); }
  #lr-status { display: none; align-items: center; gap: 6px; padding: 6px 16px 9px; font-size: 11px; color: #fff; }
  #lr-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; animation: lr-pulse 1.8s infinite ease-in-out; }

  #lr-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f8f9fb; }
  #lr-messages::-webkit-scrollbar { width: 6px; }
  #lr-messages::-webkit-scrollbar-thumb { background: #d8dce3; border-radius: 3px; }

  .lr-msg { max-width: 82%; padding: 9px 13px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap;
    word-break: break-word; animation: lr-fade-in .18s ease; }
  .lr-msg-assistant { align-self: flex-start; background: #fff; border: 1px solid #e8eaee; color: #1e2430; }
  .lr-msg-user { align-self: flex-end; color: #fff; }

  .lr-typing { display: flex; align-items: center; gap: 4px; padding: 12px 14px; }
  .lr-typing span { width: 6px; height: 6px; border-radius: 50%; background: #a7adba; display: inline-block;
    animation: lr-bounce 1.2s infinite ease-in-out; }
  .lr-typing span:nth-child(2) { animation-delay: .15s; }
  .lr-typing span:nth-child(3) { animation-delay: .3s; }

  #lr-inputbar { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #edeef2; background: #fff; flex-shrink: 0; }
  #lr-input { flex: 1; padding: 9px 13px; border: 1px solid #dfe2e8; border-radius: 22px; font-size: 13.5px;
    outline: none; transition: border-color .15s ease; }
  #lr-input:focus { border-color: ${color}; }
  #lr-send { border: none; color: #fff; background: ${color}; border-radius: 50%; width: 36px; height: 36px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform .1s ease, opacity .15s ease; }
  #lr-send:hover:not(:disabled) { transform: scale(1.06); }
  #lr-send:disabled, #lr-input:disabled { opacity: .55; cursor: default; }

  /* ══════════════════ Modern — gradient header, live-status bar, soft bubbles ══════════════════ */
  #lr-panel[data-template="modern"] #lr-header { background: linear-gradient(135deg, ${color}, ${colorDark}); padding-bottom: 8px; }
  #lr-panel[data-template="modern"] #lr-status { display: flex; background: linear-gradient(135deg, ${color}, ${colorDark}); }
  #lr-panel[data-template="modern"] .lr-msg-assistant { border-radius: 4px 16px 16px 16px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
  #lr-panel[data-template="modern"] .lr-msg-user { background: ${color}; border-radius: 16px 4px 16px 16px; }

  /* ══════════════════ Minimal Flat — bare, quiet, no avatar/status/shadow ══════════════════ */
  #lr-panel[data-template="minimal"] { border-radius: 8px; box-shadow: 0 2px 16px rgba(15,23,42,0.14); }
  #lr-panel[data-template="minimal"] #lr-header { background: ${color}; }
  #lr-panel[data-template="minimal"] #lr-avatar { display: none; }
  #lr-bubble[data-template="minimal"] { border-radius: 14px; box-shadow: 0 3px 10px rgba(0,0,0,0.16); }
  #lr-panel[data-template="minimal"] .lr-msg { border-radius: 6px; }
  #lr-panel[data-template="minimal"] .lr-msg-user { background: ${color}; }
  #lr-panel[data-template="minimal"] #lr-input { border-radius: 6px; }
  #lr-panel[data-template="minimal"] #lr-send { border-radius: 6px; }

  /* ══════════════════ Compact Chips — icon avatar, horizontal pill quick-replies ══════════════════ */
  #lr-panel[data-template="chips"] #lr-header { background: ${color}; }
  #lr-panel[data-template="chips"] #lr-avatar { background: #fff; color: ${color}; }
  #lr-panel[data-template="chips"] .lr-msg { border-radius: 12px; }
  #lr-panel[data-template="chips"] .lr-msg-assistant { border-radius: 4px 12px 12px 12px; }
  #lr-panel[data-template="chips"] .lr-msg-user { background: ${color}; border-radius: 12px 4px 12px 12px; }
  .lr-chips { display: flex; flex-wrap: wrap; gap: 6px; animation: lr-fade-in .2s ease; }
  .lr-chip { border: 1.5px solid ${color}; background: #fff; color: ${color}; font-size: 12.5px; font-weight: 600;
    padding: 7px 12px; border-radius: 999px; cursor: pointer; transition: background .15s ease, color .15s ease; }
  .lr-chip:hover { background: ${color}; color: #fff; }

  /* ══════════════════ Dark Professional — dark chrome, vertical stacked action menu ══════════════════ */
  #lr-panel[data-template="dark"] { background: #f4f5f7; }
  #lr-panel[data-template="dark"] #lr-header { background: #1a1f2e; }
  #lr-panel[data-template="dark"] #lr-avatar { background: rgba(255,255,255,0.1); }
  #lr-panel[data-template="dark"] #lr-close { background: rgba(255,255,255,0.08); }
  #lr-panel[data-template="dark"] #lr-close:hover { background: rgba(255,255,255,0.16); }
  #lr-panel[data-template="dark"] #lr-messages { background: #f4f5f7; }
  #lr-panel[data-template="dark"] .lr-msg { border-radius: 4px 12px 12px 12px; }
  #lr-panel[data-template="dark"] .lr-msg-user { background: #1a1f2e; border-radius: 12px 4px 12px 12px; }
  #lr-panel[data-template="dark"] #lr-inputbar { background: #fff; border-top-color: #e4e6ea; }
  #lr-panel[data-template="dark"] #lr-send { background: ${color}; }
  .lr-actions { display: flex; flex-direction: column; gap: 6px; width: 100%; animation: lr-fade-in .2s ease; }
  .lr-action { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left;
    background: #fff; border: 1px solid #e4e6ea; color: #1e2430; font-size: 13px; font-weight: 500;
    padding: 10px 13px; border-radius: 10px; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
  .lr-action:hover { border-color: ${color}; background: ${color}0d; }
  .lr-action svg { flex-shrink: 0; color: ${color}; margin-left: 8px; }
</style>
<button id="lr-bubble" data-template="${template}" aria-label="Open chat">${ICON_CHAT}</button>
<div id="lr-panel" data-template="${template}">
  <div id="lr-header">
    <div id="lr-avatar">${avatar}</div>
    <div id="lr-header-text">
      <span id="lr-header-name">${escapeHtml(config.agentName)}</span>
      <span id="lr-header-sub">${escapeHtml(config.companyName)}</span>
    </div>
    <button id="lr-close" aria-label="Close chat">${ICON_CLOSE}</button>
  </div>
  <div id="lr-status"><span id="lr-status-dot"></span>We're online</div>
  <div id="lr-messages"></div>
  <div id="lr-inputbar">
    <input id="lr-input" type="text" placeholder="Type a message..." autocomplete="off" />
    <button id="lr-send" aria-label="Send">${ICON_SEND}</button>
  </div>
</div>`;
  }
}
