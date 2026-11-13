import fs from 'node:fs';
import path from 'node:path';
// Outbound-only encrypted relay. The local inference port is never published.
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, publishableKey } from '../api/_config.mjs';
import { MAGNUM_CHANNEL, MAGNUM_MODEL, MAGNUM_PROFILE, sealMagnum, openMagnum } from '../api/_magnumProtocol.mjs';
if (!process.env.MAGNUM_CONVERSATION_SECRET) throw new Error('MAGNUM_CONVERSATION_SECRET is required');
const stateDir = path.join(process.env.LOCALAPPDATA || process.cwd(), 'Insomnia');
fs.mkdirSync(stateDir, { recursive: true });
const lockPath = path.join(stateDir, 'magnum-conversation-worker.lock');
try {
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, 'utf8'));
    let alive = false; try { if (pid > 0) { process.kill(pid, 0); alive = true; } } catch {}
    if (alive) { console.log('MAGNUM_CONVERSATION already running'); process.exit(0); }
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
} catch { throw new Error('magnum_worker_lock_failed'); }
process.on('exit', () => { try { if (fs.readFileSync(lockPath, 'utf8') === String(process.pid)) fs.unlinkSync(lockPath); } catch {} });
const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const channel = client.channel(MAGNUM_CHANNEL, { config: { broadcast: { ack: true } } });
// Realtime sockets may be unref'ed; this connector must survive idle conversations.
const keepAlive = setInterval(() => {}, 30000);
const seen = new Map();
let busy = false;
async function modelHealth() {
  const response = await fetch('http://127.0.0.1:8788/v1/models', { signal: AbortSignal.timeout(2000) });
  const data = await response.json();
  if (!response.ok || !data.data?.some((model) => /magnum-v4-12b/i.test(model.id))) throw new Error('magnum_model_mismatch');
}
async function reply(request, data) {
  await channel.send({ type: 'broadcast', event: 'response', payload: sealMagnum({ ...data, id: request.id, expiresAt: Date.now() + 15000, profile: MAGNUM_PROFILE }, 'response') });
}
channel.on('broadcast', { event: 'request' }, async ({ payload }) => {
  let request; try { request = openMagnum(payload, 'request'); } catch { return; }
  for (const [id, expiry] of seen) if (expiry < Date.now()) seen.delete(id);
  if (seen.has(request.id) || seen.size > 256) return;
  seen.set(request.id, request.expiresAt);
  if (request.kind === 'ping') {
    try { await modelHealth(); await reply(request, { model: MAGNUM_MODEL, ready: !busy }); }
    catch { await reply(request, { error: 'magnum_model_mismatch', message: 'Magnum no está cargado en el PC.' }); }
    return;
  }
  if (request.kind !== 'generate' || request.approved !== true || !Array.isArray(request.messages)) return;
  if (busy) { await reply(request, { error: 'magnum_busy', message: 'Magnum está atendiendo otra conversación. Inténtalo de nuevo en unos segundos.' }); return; }
  busy = true;
  try {
    await modelHealth();
    const system = String(request.messages[0]?.role === 'system' ? request.messages[0].content : '').slice(0, 16000);
    const language = request.language === 'en' ? 'Write every JSON value in English.' : 'Escribe todos los valores del JSON en español nativo, nunca en inglés.';
    const messages = [{ role: 'system', content: 'Este servicio SOLO admite conversación no sexual y romance no explícito con consentimiento. No generes contenido sexual.\n' + system + '\n' + language }, ...request.messages.slice(1).filter((turn) => ['user', 'assistant'].includes(turn?.role)).slice(-26).map((turn) => ({ role: turn.role, content: String(turn.content || '').slice(0, 1800) }))];
    // LLaMA's template requires a user turn before an assistant opening greeting.
    if (messages[1]?.role === 'assistant') messages.splice(1, 0, { role: 'user', content: 'Continuamos esta conversación.' });
    const response = await fetch('http://127.0.0.1:8788/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MAGNUM_MODEL, messages, temperature: 0.75, max_tokens: Math.max(32, Math.min(600, Number(request.maxTokens) || 450)), response_format: { type: 'json_object' }, repeat_penalty: 1.06 }),
      signal: AbortSignal.timeout(Math.max(100, Math.min(request.call ? 16000 : 32000, request.expiresAt - Date.now()))),
    });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!response.ok || !content || !/magnum-v4-12b/i.test(String(data.model || '')) || data.choices?.[0]?.finish_reason === 'length') throw new Error('magnum_generation_incomplete');
    await reply(request, { model: MAGNUM_MODEL, content });
    console.log('MAGNUM_CONVERSATION completed');
  } catch { await reply(request, { error: 'magnum_generation_failed', message: 'Magnum no pudo completar la respuesta. Tu historial se conserva.' }); }
  finally { busy = false; }
});
channel.subscribe((status) => console.log('MAGNUM_CONVERSATION connection', status));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { clearInterval(keepAlive); await client.removeAllChannels(); client.realtime.disconnect(); process.exit(0); });
