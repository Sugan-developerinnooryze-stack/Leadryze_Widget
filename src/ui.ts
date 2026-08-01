export interface WidgetConfig {
  companyName: string;
  agentName: string;
  logoUrl?: string;
  primaryColor: string;
  greeting: string;
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

  constructor(config: WidgetConfig, onSend: (message: string) => void) {
    const host = document.createElement('div');
    host.id = 'leadryze-widget-host';
    // `all: initial` isolates this host element's own box from the host
    // page's inherited styles — the real isolation is the Shadow DOM below,
    // this is just belt-and-suspenders for the host element itself.
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000;';
    document.body.appendChild(host);
    this.shadow = host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = this.renderShell(config);

    this.bubbleEl   = this.shadow.getElementById('lr-bubble') as HTMLElement;
    this.panelEl    = this.shadow.getElementById('lr-panel') as HTMLElement;
    this.messagesEl = this.shadow.getElementById('lr-messages') as HTMLElement;
    this.inputEl    = this.shadow.getElementById('lr-input') as HTMLInputElement;
    this.sendBtn    = this.shadow.getElementById('lr-send') as HTMLButtonElement;
    const closeEl   = this.shadow.getElementById('lr-close') as HTMLElement;

    this.bubbleEl.addEventListener('click', () => this.toggle());
    closeEl.addEventListener('click', () => this.toggle());
    this.sendBtn.addEventListener('click', () => this.handleSend(onSend));
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSend(onSend);
    });

    if (config.greeting) this.addMessage('assistant', config.greeting);
  }

  private handleSend(onSend: (message: string) => void): void {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';
    this.addMessage('user', text);
    onSend(text);
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

  private typingEl: HTMLElement | null = null;

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

  private renderShell(config: WidgetConfig): string {
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
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

  #lr-bubble {
    position: fixed; right: 22px; bottom: 22px; width: 60px; height: 60px; border-radius: 50%;
    border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 24px -6px ${color}66, 0 2px 8px rgba(0,0,0,0.15);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  #lr-bubble:hover { transform: scale(1.06); box-shadow: 0 14px 28px -6px ${color}80, 0 2px 8px rgba(0,0,0,0.18); }
  #lr-bubble:active { transform: scale(.97); }

  #lr-panel {
    display: none; flex-direction: column; position: fixed; right: 22px; bottom: 96px;
    width: 336px; height: 460px; max-height: 72vh; background: #fff; border-radius: 18px;
    box-shadow: 0 20px 50px -12px rgba(15,23,42,0.3), 0 4px 14px rgba(15,23,42,0.1);
    overflow: hidden; opacity: 0; transform: translateY(10px) scale(.97);
    transition: opacity .16s ease, transform .16s ease;
  }
  #lr-panel.lr-open { opacity: 1; transform: translateY(0) scale(1); animation: lr-pop .16s ease; }

  #lr-header {
    display: flex; align-items: center; gap: 10px; padding: 14px 16px;
    background: linear-gradient(135deg, ${color}, ${colorDark}); color: #fff; flex-shrink: 0;
  }
  #lr-avatar { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.22);
    display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; font-weight: 700; font-size: 14px; }
  #lr-avatar-img { width: 100%; height: 100%; object-fit: cover; }
  #lr-header-text { flex: 1; min-width: 0; }
  #lr-header-name { display: block; font-size: 14px; font-weight: 600; letter-spacing: .1px; }
  #lr-header-sub { display: block; font-size: 11.5px; opacity: .85; margin-top: 1px; }
  #lr-close { background: rgba(255,255,255,0.14); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%;
    cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .15s ease; }
  #lr-close:hover { background: rgba(255,255,255,0.26); }

  #lr-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f8f9fb; }
  #lr-messages::-webkit-scrollbar { width: 6px; }
  #lr-messages::-webkit-scrollbar-thumb { background: #d8dce3; border-radius: 3px; }

  .lr-msg { max-width: 82%; padding: 9px 13px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap;
    word-break: break-word; animation: lr-fade-in .18s ease; }
  .lr-msg-assistant { align-self: flex-start; background: #fff; border: 1px solid #e8eaee; color: #1e2430;
    border-radius: 4px 16px 16px 16px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
  .lr-msg-user { align-self: flex-end; background: ${color}; color: #fff; border-radius: 16px 4px 16px 16px; }

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
</style>
<button id="lr-bubble" aria-label="Open chat" style="background:${color}">${ICON_CHAT}</button>
<div id="lr-panel">
  <div id="lr-header">
    <div id="lr-avatar">${avatar}</div>
    <div id="lr-header-text">
      <span id="lr-header-name">${escapeHtml(config.agentName)}</span>
      <span id="lr-header-sub">${escapeHtml(config.companyName)}</span>
    </div>
    <button id="lr-close" aria-label="Close chat">${ICON_CLOSE}</button>
  </div>
  <div id="lr-messages"></div>
  <div id="lr-inputbar">
    <input id="lr-input" type="text" placeholder="Type a message..." autocomplete="off" />
    <button id="lr-send" aria-label="Send">${ICON_SEND}</button>
  </div>
</div>`;
  }
}
