import { requestMagnum } from './_magnumBridge.mjs';
import { MAGNUM_MODEL } from './_magnumProtocol.mjs';

/** Transport to the already running PC service; no provider substitution or content classification. */
export async function generateConnectedMagnum(messages, options = {}, request = requestMagnum) {
  const lengthRule = options.language === 'en'
    ? (options.brief ? 'For this simple exchange, use a brief reaction and 15–40 words of dialogue. Finish the JSON completely.' : 'Use a brief reaction and 90–125 words of dialogue, 90–150 words total. Finish every sentence and the JSON completely; keep the current scene.')
    : (options.brief ? 'Para este intercambio sencillo, usa una reacción breve y un diálogo de 15–40 palabras. Cierra el JSON por completo.' : 'Usa una reacción breve y un diálogo de 90–125 palabras, 90–150 palabras en total. Termina todas las frases y cierra el JSON por completo; conserva la escena actual.');
  const character = String(options.characterRole || (options.language === 'en' ? 'your assigned character' : 'tu personaje asignado')).slice(0, 240);
  const player = String(options.playerRole || (options.language === 'en' ? 'the user' : 'el usuario')).slice(0, 240);
  const formatRule = options.language === 'en'
    ? `Return only JSON with reaction and dialogue. In both fields I means ${character}; you means ${player}. reaction contains one short first-person gesture by ${character}. dialogue contains only the words ${character} says to ${player}, without narration, actions or the user's lines.`
    : `Devuelve únicamente JSON con gesto y dialogo. En ambos campos YO soy ${character}; TÚ eres ${player}. gesto contiene una sola reacción breve de ${character} en primera persona. dialogo contiene únicamente las palabras que ${character} le dice a ${player}, sin narración, acciones ni frases del usuario.`;
  const system = [{ role: 'system', content: (messages[0]?.role === 'system' ? String(messages[0].content).slice(0, 14000) + '\n' : '') + lengthRule + '\n' + formatRule }];
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
    // Decoding budget includes JSON syntax and Spanish tokenization, not only visible words.
    maxTokens: options.brief ? 300 : 600,
    temperature: options.temperature ?? 0.85,
  }, { timeoutMs: options.call ? 21000 : 42000 });
  if (result.model !== MAGNUM_MODEL) throw Object.assign(new Error('El servicio no confirmó Magnum v4 12B.'), { code: 'magnum_model_mismatch', status: 503 });
  let parsed;
  try { parsed = JSON.parse(result.content); } catch { throw Object.assign(new Error('Magnum devolvió una respuesta incompleta.'), { code: 'magnum_generation_incomplete', status: 503 }); }
  const reaction = parsed.gesto ?? parsed.narracion ?? parsed.reaction;
  const dialogue = parsed.dialogo ?? parsed.dialogue;
  if (typeof reaction !== 'string' || !reaction.trim() || typeof dialogue !== 'string' || !dialogue.trim()) throw Object.assign(new Error('Magnum devolvió una respuesta incompleta.'), { code: 'magnum_generation_incomplete', status: 503 });
  const content = `*${reaction.trim().replace(/^\*|\*$/g, '')}* ${dialogue.trim()}`;
  if (options.isRepeated?.(content) || (options.validate && !options.validate(content))) throw Object.assign(new Error('La respuesta de Magnum no pudo validarse para este turno.'), { code: 'off_role', status: 503 });
  return { content, engine: { profile: 'magnum-v4-local', model: MAGNUM_MODEL, provider: 'local-pc', fallback: false } };
}
