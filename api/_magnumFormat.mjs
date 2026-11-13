// Require both components and a substantial dialogue; leave maximum length unconstrained
// during decoding so the model can finish words and sentences naturally.
export function magnumReplySchema(brief = false, language = 'es') {
  const reactionKey = language === 'en' ? 'reaction' : 'narracion';
  const dialogueKey = language === 'en' ? 'dialogue' : 'dialogo';
  return { type: 'object', properties: {
    [reactionKey]: { type: 'string', minLength: 1 },
    [dialogueKey]: brief ? { type: 'string', minLength: 1 } : { type: 'string', pattern: String.raw`^[^ \n\r"]+( [^ \n\r"]+){89,}$` },
  }, required: [reactionKey, dialogueKey], additionalProperties: false };
}
// Fit a long draft using complete sentences only. Never slice a sentence or an action.
export function fitDialogue(reaction, dialogue, budget = 150, language = 'es') {
  const count = (text) => (text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
  if (count(reaction) + count(dialogue) <= budget) return dialogue;
  const segments = new Intl.Segmenter(language === 'en' ? 'en' : 'es', { granularity: 'sentence' }).segment(dialogue);
  let selected = '', used = count(reaction);
  for (const {segment} of segments) {
    const size = count(segment);
    if (used + size > budget) break;
    selected += segment;
    used += size;
  }
  return selected.trim();
}
