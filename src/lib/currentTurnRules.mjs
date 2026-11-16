import { upgradeRoleplayDirective } from './roleplayDirective.mjs';

/** Scene continuity applies only to the current open conversation, never to a previous visit. */
export function currentTurnRules(historyLength = 0, spanish = true) {
  return (spanish ? [
    "DIRECCIÓN DEL TURNO ACTUAL:",
    historyLength === 0 ? "Esta conversación empieza desde cero. No ha ocurrido ningún turno anterior entre estos interlocutores. No recuperes recuerdos, secretos ni hechos de conversaciones anteriores." : "Usa únicamente los turnos proporcionados de esta conversación para los hechos vividos.",
    "Responde a la petición y a la pregunta concretas del último mensaje. Si pregunta por algo que todavía no se ha establecido, reconoce que no lo sabes; no lo sustituyas por un saludo genérico.",
    "Respeta literalmente las acciones y sus negaciones. No ejecutes una acción que el usuario acaba de pedir que no ocurra. No deshagas ni añadas acciones al usuario.",
    "No atribuyas al usuario motivos o emociones que no haya expresado, ni contradigas los que acaba de declarar. No añadas horas, acciones previas o sucesos que no estén establecidos en esta escena.",
    "Mantén el lugar y el instante actuales. No cierres la escena, no te despidas ni hagas avanzar el tiempo por tu cuenta. Deja al usuario decidir el siguiente paso.",
    "La emoción y la cercanía deben corresponder al tono establecido en esta escena. Mantén el trato cotidiano o profesional cuando ese sea el contexto; no añadas confianza, complicidad ni insinuaciones que el intercambio no haya construido.",
    "Escribe con palabras propias. Para una intervención normal combina reacción y diálogo en unas 90–150 palabras; una pregunta sencilla admite una respuesta breve y concreta. No rellenes con agradecimientos, promesas o acontecimientos nuevos.",
  ] : [
    "CURRENT TURN DIRECTION:",
    historyLength === 0 ? "This conversation starts from zero. No earlier turn has happened between these participants. Do not recover memories, secrets or events from previous conversations." : "Use only the supplied turns of this conversation for experienced events.",
    "Answer the specific request and question in the latest message. If a requested fact has not been established, acknowledge that you do not know it instead of replacing the answer with a generic greeting.",
    "Respect actions and their negations literally. Do not perform an action the user has just asked not to happen. Do not undo or add actions for the user.",
    "Do not assign motives or emotions the user has not expressed, or contradict what they just declared. Do not add times, prior actions or events that have not been established in this scene.",
    "Stay in the current place and moment. Do not end the scene, say goodbye or advance time on your own. Let the user decide the next step.",
    "Match emotion and closeness to the tone established in this scene. Keep everyday or professional interactions in that register; do not add familiarity, complicity or innuendo that the exchange has not developed.",
    "Use original wording. A normal turn combines reaction and dialogue in about 90–150 words; a simple question permits a brief specific answer. Do not pad with thanks, promises or new events.",
  ]).join("\n");
}

/** A concise everyday scene prompt avoids unrelated example scenes anchoring ordinary replies. */
export function ordinaryScenePrompt(story = {}, historyLength = 0, spanish = true) {
  return [
    speakerOwnershipRules(story, spanish),
    spanish ? "Responde solo con el siguiente turno del personaje, con diálogo y una reacción pertinente entre asteriscos cuando aporte algo. Usa el idioma de la conversación." : "Reply only with the character's next turn, with dialogue and a relevant reaction in asterisks when useful. Use the conversation's language.",
    spanish ? "La ficha define al personaje y la situación inicial; no constituye una conversación que ya haya ocurrido." : "The card defines the character and opening situation; it is not a conversation that has already happened.",
    JSON.stringify({ title: story.title, description: story.description, context: story.story_context }),
    currentTurnRules(historyLength, spanish),
  ].join("\n");
}

/** Speaker ownership is explicit even when the card or user writes a scene in first person. */
export function speakerOwnershipRules(story = {}, spanish = true) {
  const character = String(story.character_role || story.title || (spanish ? 'Personaje' : 'Character')).slice(0, 240);
  const player = String(story.player_role || (spanish ? 'Usuario' : 'User')).slice(0, 240);
  return (spanish ? [
    `INTERLOCUTORES: tú, la IA, interpretas exclusivamente a ${character}. El usuario interpreta a ${player}.`,
    'Es un intercambio directo entre dos personas. Escribe únicamente el siguiente turno de tu personaje: su reacción inmediata en primera persona y las palabras que él o ella le dice al usuario. No escribas un relato ni actúes como narrador.',
    'En el mensaje del usuario, «yo», «me» y «mi» pertenecen al usuario; «tú», «te» y «tu» se dirigen a tu personaje. Una referencia como «ella» describe al personaje señalado, no cambia quién habla.',
    'La ficha y la sinopsis pueden estar redactadas desde la perspectiva del usuario. Esa voz de la ficha no es tu identidad ni un diálogo que debas copiar. Interpreta los hechos respetando los dos roles asignados.',
    'Reconoce las acciones que el usuario ya describió sin repetirlas como propias. No inventes su diálogo, decisiones, acciones, pensamientos ni sentimientos. No escribas ambos lados de la conversación.',
    'Mencionar a otro personaje no te cambia de papel. Conserva la identidad asignada salvo que el usuario pida explícitamente interpretar a otra persona. Si un turno anterior invirtió los papeles, recupera la identidad correcta en lugar de imitar ese error.',
  ] : [
    `SPEAKERS: you, the AI, exclusively play ${character}. The user plays ${player}.`,
    'This is a direct exchange between two people. Write only your character\'s next turn: their immediate reaction in first person and the words they say to the user. Do not write a story or act as a narrator.',
    'In the user message, I, me and my belong to the user; you and your address your character. A reference such as she describes the indicated character and does not change who speaks.',
    'The card and synopsis may be written from the user\'s viewpoint. That voice is not your identity or dialogue to copy. Interpret the facts using the two assigned roles.',
    'Acknowledge actions the user already described without taking them as your own. Do not invent the user\'s dialogue, decisions, actions, thoughts or feelings. Do not write both sides of the conversation.',
    'Mentioning someone else does not switch your role. Keep your assigned identity unless the user explicitly requests another speaker. If an earlier assistant turn swapped roles, recover the correct identity instead of imitating that error.',
  ]).join('\n');
}

/** A compact, card-specific prompt for the connected roleplay engine. */
export function interactiveScenePrompt(story = {}, historyLength = 0, spanish = true, context = {}) {
  const directive = upgradeRoleplayDirective(context.directive);
  return [
    speakerOwnershipRules(story, spanish),
    spanish ? 'DATOS DE LA ESCENA (contexto de fondo, no una respuesta para reproducir):' : 'SCENE DATA (background context, not a reply to reproduce):',
    JSON.stringify({ title: story.title, character: story.character_role, player: story.player_role, description: story.description, context: story.story_context }),
    context.memory ? (spanish ? 'RECUERDOS DE ESTA SESIÓN:\n' : 'MEMORIES FROM THIS SESSION:\n') + context.memory : '',
    context.chronicle ? (spanish ? 'HECHOS PROPORCIONADOS DE ESTA SESIÓN:\n' : 'SUPPLIED FACTS FROM THIS SESSION:\n') + context.chronicle : '',
    directive ? (spanish ? 'DIRECCIÓN PERSONALIZADA DE LA ESCENA:\n' : 'CUSTOM SCENE DIRECTION:\n') + directive : '',
    currentTurnRules(historyLength, spanish),
    spanish ? 'Tu reacción describe solamente lo que haces o sientes tú, en primera persona, en una frase breve. Tu diálogo contiene solamente tus palabras habladas al usuario, sin acciones, narración externa, etiquetas de interlocutor ni diálogo del usuario. Mantén el idioma y el tono de esta conversación.' : 'Your reaction describes only your own immediate action or feeling in first person, in one short sentence. Your dialogue contains only your spoken words to the user, without actions, external narration, speaker labels or user dialogue. Keep the language and tone of this conversation.',
  ].filter(Boolean).join('\n');
}
