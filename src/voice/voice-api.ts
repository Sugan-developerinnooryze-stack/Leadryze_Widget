import { VoiceChatResult } from './types';

export async function sendVoiceChat(
  apiBaseUrl: string, widgetKey: string, sessionId: string, visitorId: string,
  audioBlob: Blob, durationSeconds: number,
): Promise<VoiceChatResult | null> {
  try {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    form.append('sessionId', sessionId);
    form.append('visitorId', visitorId);
    form.append('pageUrl', location.href);
    form.append('durationSeconds', String(Math.round(durationSeconds)));
    const res = await fetch(`${apiBaseUrl}/public/widget/voice/chat?widgetKey=${encodeURIComponent(widgetKey)}`, {
      method: 'POST',
      body: form,
    });
    const body = await res.json();
    if (!res.ok || !body.success) return null;
    return body.data as VoiceChatResult;
  } catch {
    return null;
  }
}
