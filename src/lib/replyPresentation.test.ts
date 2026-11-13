import { expect, it } from 'vitest';
import { normalizeAssistantReply, normalizeAssistantResponse } from './roleReply';
it('retains the actual answer after an earlier complete sentence when the final period is absent', () => {
  const text = 'Te estaba esperando en la oficina desde esta mañana. Necesito que firmes el permiso para poder presentar el proyecto mañana';
  expect(normalizeAssistantReply(text)).toBe(text);
});
it('retains a configured long reply including the answer at its end', () => {
  const text = 'Revisamos el informe y comprobamos cada una de sus cifras con cuidado. '.repeat(14) + 'La fecha acordada para la reunión es el jueves a las cuatro.';
  expect(normalizeAssistantReply(text)).toBe(text);
});

it('preserves both validated Magnum components when a saved reply is rendered again', async () => {
  const { normalizeAssistantResponse } = await import('./roleReply');
  const reaction = 'Asiento con calma y acerco las notas para que podamos revisarlas juntos. Después dejo el bolígrafo sobre la mesa y me dispongo a escuchar tus ideas.';
  const content = `*${reaction}* Podemos empezar por el objetivo de la presentación y organizar después las ideas más importantes.`;
  const saved = JSON.parse(JSON.stringify({ content, engine: { profile: 'magnum-conversation', model: 'magnum-v4-12b', fallback: false } }));
  expect(normalizeAssistantResponse(saved)).toBe(content);
});

it('retains the complete reaction for the verified adult-mode Magnum response after storage', () => {
  const content = '*Me siento junto a ti con calma y dejo mis notas sobre la mesa para revisar contigo los puntos pendientes de la presentación de mañana.* Podemos empezar por la introducción y después revisar los ejemplos.';
  const data = JSON.parse(JSON.stringify({ content, engine: { profile: 'magnum-v4-local', model: 'magnum-v4-12b', provider: 'local-pc', fallback: false } }));
  expect(normalizeAssistantResponse(data)).toBe(content);
});
