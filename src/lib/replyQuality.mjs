export const MAX_REPLY_CHARS = 3000;

/** A full stop cannot turn a dangling connective into a complete thought. */
export function isIncompleteTurn(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  const spoken = text.replace(/\*[^*]*\*/g, ' ').trim();
  if (!spoken) return false;
  if (/\b(?:palabra|término|conector|word|term)\b/iu.test(spoken) && /["'»”][.!?]*$/u.test(spoken)) return false;
  const ending = spoken.replace(/[\s.!?…,;:"'»”*)\]]+$/gu, '');
  return /(?:^|\s)(?:porque|ya que|debido a|que|pero|aunque|mientras|para|con|de|del|al|el|la|los|las|un|una|su|sus|mi|mis|tu|tus|tan|muy|and|because|although|with|the)$/iu.test(ending);
}

export const truncatedCompletion = (reason) => /^(?:length|max_tokens|max_output_tokens)$/i.test(String(reason || ''));

/** Catch a whole answer drifting into the other supported UI language. */
export function replyLanguageMismatch(value, language = 'es') {
  const text = String(value || '').toLowerCase();
  const english = (text.match(/\b(?:the|this|that|with|and|your|you|she|her|him|would|could|should|have|was|were|will|from|for|about|let|know|hear|later|today)\b/gu) || []).length;
  const spanish = (text.match(/\b(?:el|la|los|las|de|del|que|para|con|una|por|estoy|estás|tú|yo|ella|aquí|pero|porque|quiero|cómo|qué|puedo|podemos|vamos|tarde|hoy)\b/gu) || []).length;
  return language === 'en' ? spanish >= 4 && spanish > english : english >= 4 && english > spanish * 0.5;
}
