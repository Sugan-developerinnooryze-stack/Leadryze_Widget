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
    this.panelEl.style.display = this.open ? 'flex' : 'none';
  }

  addMessage(role: 'user' | 'assistant', text: string): void {
    const div = document.createElement('div');
    div.className = `lr-msg lr-msg-${role}`;
    div.textContent = text;
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  setBusy(busy: boolean): void {
    this.sendBtn.disabled = busy;
    this.inputEl.disabled = busy;
  }

  private renderShell(config: WidgetConfig): string {
    const color = config.primaryColor || '#2563eb';
    return `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  #lr-bubble {
    position: fixed; right: 20px; bottom: 20px; width: 56px; height: 56px; border-radius: 50%;
    border: none; color: #fff; font-size: 24px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
  #lr-panel {
    display: none; flex-direction: column; position: fixed; right: 20px; bottom: 88px;
    width: 320px; height: 440px; max-height: 70vh; background: #fff; border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.25); overflow: hidden;
  }
  #lr-header {
    display: flex; align-items: center; justify-content: space-between; padding: 12px 14px;
    color: #fff; font-size: 14px; font-weight: 600;
  }
  #lr-close { background: none; border: none; color: #fff; font-size: 16px; cursor: pointer; }
  #lr-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: #f7f7f8; }
  .lr-msg { max-width: 85%; padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; }
  .lr-msg-assistant { align-self: flex-start; background: #fff; border: 1px solid #e5e5e5; color: #1a1a1a; }
  .lr-msg-user { align-self: flex-end; background: ${color}; color: #fff; }
  #lr-inputbar { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #eee; }
  #lr-input { flex: 1; padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; }
  #lr-send { border: none; color: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
  #lr-send:disabled, #lr-input:disabled { opacity: 0.6; cursor: default; }
</style>
<button id="lr-bubble" aria-label="Open chat" style="background:${color}">&#128172;</button>
<div id="lr-panel">
  <div id="lr-header" style="background:${color}">
    <span>${escapeHtml(config.agentName)} &middot; ${escapeHtml(config.companyName)}</span>
    <button id="lr-close" aria-label="Close chat">&#10005;</button>
  </div>
  <div id="lr-messages"></div>
  <div id="lr-inputbar">
    <input id="lr-input" type="text" placeholder="Type a message..." />
    <button id="lr-send" style="background:${color}" aria-label="Send">&#10148;</button>
  </div>
</div>`;
  }
}
