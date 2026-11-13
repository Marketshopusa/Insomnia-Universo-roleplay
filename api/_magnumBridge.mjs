import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, publishableKey } from './_config.mjs';
import { MAGNUM_CHANNEL, MAGNUM_PROFILE, sealMagnum, openMagnum } from './_magnumProtocol.mjs';
export async function requestMagnum(payload, { timeoutMs = 35000, secret = process.env.MAGNUM_CONVERSATION_SECRET, clientFactory = createClient } = {}) {
  if (!secret) throw Object.assign(new Error('Magnum todavía no está conectado.'), { status: 503, code: 'magnum_not_configured' });
  const client = clientFactory(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const channel = client.channel(MAGNUM_CHANNEL, { config: { broadcast: { ack: true } } });
  const id = randomUUID(), expiresAt = Date.now() + Math.min(55000, timeoutMs + 5000);
  let timer, settled = false;
  const response = new Promise((resolve, reject) => {
    const fail = () => { if (!settled) { settled = true; reject(Object.assign(new Error('Magnum no respondió. Comprueba que tu PC y su conexión estén activos.'), { status: 503, code: 'magnum_offline' })); } };
    timer = setTimeout(fail, timeoutMs);
    channel.on('broadcast', { event: 'response' }, ({ payload: packet }) => {
      let result; try { result = openMagnum(packet, 'response', secret); } catch { return; }
      if (result.id !== id || settled) return;
      settled = true;
      if (result.error) reject(Object.assign(new Error(result.message || 'Magnum no pudo completar la respuesta.'), { status: 503, code: result.error }));
      else resolve(result);
    });
    channel.subscribe(async (state) => {
      if (settled) return;
      if (state === 'SUBSCRIBED') {
        try {
          const sent = await channel.send({ type: 'broadcast', event: 'request', payload: sealMagnum({ ...payload, id, expiresAt, profile: MAGNUM_PROFILE }, 'request', secret) });
          if (sent !== 'ok') fail();
        } catch { fail(); }
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) fail();
    });
  });
  try { return await response; }
  finally { clearTimeout(timer); await client.removeAllChannels().catch(() => {}); client.realtime.disconnect(); }
}
