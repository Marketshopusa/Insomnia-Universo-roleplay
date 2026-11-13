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
