import { expect, it } from 'vitest';
import { normalizeAssistantReply } from './roleReply';
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
