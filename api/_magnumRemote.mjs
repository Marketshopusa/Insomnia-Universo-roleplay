import { requestMagnum } from './_magnumBridge.mjs';
import { MAGNUM_MODEL } from './_magnumProtocol.mjs';

/** Transport to the already running PC service; no provider substitution or content classification. */
export async function generateConnectedMagnum(messages, options = {}, request = requestMagnum) {
  const system = messages[0]?.role === 'system' ? [{ role: 'system', content: String(messages[0].content).slice(0, 16000) }] : [];
  const turns = [];
  for (const turn of messages.filter(turn => ['user', 'assistant'].includes(turn.role)).slice(-25)) {
    const content = String(turn.content || '').slice(0, 1800);
    if (!content) continue;
    if (turns.at(-1)?.role === turn.role) turns.at(-1).content = (turns.at(-1).content + '\n' + content).slice(-1800);
    else turns.push({ role: turn.role, content });
  }
  while (turns[0]?.role === 'assistant') turns.shift();
  while (turns.length > 1 && Buffer.byteLength(JSON.stringify([...system, ...turns])) > 65000) { turns.shift(); while (turns[0]?.role === 'assistant') turns.shift(); }
  const result = await request({
    kind: 'generate', mode: 'adult', approved: true, adultAccess: true,
    messages: [...system, ...turns], language: options.language === 'en' ? 'en' : 'es',
    call: options.call === true, brief: options.brief === true,
    maxTokens: options.brief ? 180 : Math.max(450, Number(options.maxTokens) || 450),
    temperature: options.temperature ?? 0.85,
  }, { timeoutMs: options.call ? 21000 : 42000 });
  if (result.model !== MAGNUM_MODEL) throw Object.assign(new Error('El servicio no confirmó Magnum v4 12B.'), { code: 'magnum_model_mismatch', status: 503 });
  let parsed;
  try { parsed = JSON.parse(result.content); } catch { throw Object.assign(new Error('Magnum devolvió una respuesta incompleta.'), { code: 'magnum_generation_incomplete', status: 503 }); }
  const reaction = parsed.narracion ?? parsed.reaction;
  const dialogue = parsed.dialogo ?? parsed.dialogue;
  if (typeof reaction !== 'string' || !reaction.trim() || typeof dialogue !== 'string' || !dialogue.trim()) throw Object.assign(new Error('Magnum devolvió una respuesta incompleta.'), { code: 'magnum_generation_incomplete', status: 503 });
  const content = `*${reaction.trim().replace(/^\*|\*$/g, '')}* ${dialogue.trim()}`;
  if (options.isRepeated?.(content) || (options.validate && !options.validate(content))) throw Object.assign(new Error('La respuesta de Magnum no pudo validarse para este turno.'), { code: 'off_role', status: 503 });
  return { content, engine: { profile: 'magnum-v4-local', model: MAGNUM_MODEL, provider: 'local-pc', fallback: false } };
}
