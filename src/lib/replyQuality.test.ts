import { expect, it } from 'vitest';
import { isIncompleteTurn, truncatedCompletion } from './replyQuality.mjs';
it.each(['Solo te esperaba porque.', 'Lo necesito para', 'Me quedé aquí y porque…', '*Te miro* Te llamé ya que.'])
('rejects a dangling sentence even with punctuation: %s', (text) => expect(isIncompleteTurn(text)).toBe(true));
it.each(['Porque sí.', 'No sé dónde está.', '*Suspiro*', 'La palabra es «porque».', 'Quería hablar contigo'])
('allows complete answers and literal words: %s', (text) => expect(isIncompleteTurn(text)).toBe(false));
it('recognizes provider-reported truncation rather than guessing from punctuation', () => {
  expect(truncatedCompletion('length')).toBe(true);
  expect(truncatedCompletion('MAX_TOKENS')).toBe(true);
  expect(truncatedCompletion('stop')).toBe(false);
});
