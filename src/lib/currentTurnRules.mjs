/** Scene continuity applies only to the current open conversation, never to a previous visit. */
export function currentTurnRules(historyLength = 0, spanish = true) {
  return (spanish ? [
    "DIRECCIÓN DEL TURNO ACTUAL:",
    historyLength === 0 ? "Esta conversación empieza desde cero. No ha ocurrido ningún turno anterior entre estos interlocutores. No recuperes recuerdos, secretos ni hechos de conversaciones anteriores." : "Usa únicamente los turnos proporcionados de esta conversación para los hechos vividos.",
    "Responde a la petición y a la pregunta concretas del último mensaje. Si pregunta por algo que todavía no se ha establecido, reconoce que no lo sabes; no lo sustituyas por un saludo genérico.",
    "Respeta literalmente las acciones y sus negaciones. No ejecutes una acción que el usuario acaba de pedir que no ocurra. No deshagas ni añadas acciones al usuario.",
    "Mantén el lugar y el instante actuales. No cierres la escena, no te despidas ni hagas avanzar el tiempo por tu cuenta. Deja al usuario decidir el siguiente paso.",
    "La emoción y la cercanía deben corresponder al tono establecido en esta escena. Mantén el trato cotidiano o profesional cuando ese sea el contexto; no añadas confianza, complicidad ni insinuaciones que el intercambio no haya construido.",
    "Escribe con palabras propias. Para una intervención normal combina reacción y diálogo en unas 90–150 palabras; una pregunta sencilla admite una respuesta breve y concreta. No rellenes con agradecimientos, promesas o acontecimientos nuevos.",
  ] : [
    "CURRENT TURN DIRECTION:",
    historyLength === 0 ? "This conversation starts from zero. No earlier turn has happened between these participants. Do not recover memories, secrets or events from previous conversations." : "Use only the supplied turns of this conversation for experienced events.",
    "Answer the specific request and question in the latest message. If a requested fact has not been established, acknowledge that you do not know it instead of replacing the answer with a generic greeting.",
    "Respect actions and their negations literally. Do not perform an action the user has just asked not to happen. Do not undo or add actions for the user.",
    "Stay in the current place and moment. Do not end the scene, say goodbye or advance time on your own. Let the user decide the next step.",
    "Match emotion and closeness to the tone established in this scene. Keep everyday or professional interactions in that register; do not add familiarity, complicity or innuendo that the exchange has not developed.",
    "Use original wording. A normal turn combines reaction and dialogue in about 90–150 words; a simple question permits a brief specific answer. Do not pad with thanks, promises or new events.",
  ]).join("\n");
}

/** A concise everyday scene prompt avoids unrelated example scenes anchoring ordinary replies. */
export function ordinaryScenePrompt(story = {}, historyLength = 0, spanish = true) {
  return [
    spanish ? `Interpretas a ${story.character_role || story.title || "el personaje"}. Tu interlocutor es ${story.player_role || "el usuario"}.` : `You play ${story.character_role || story.title || "the character"}. Your interlocutor is ${story.player_role || "the user"}.`,
    spanish ? "Responde solo con el siguiente turno del personaje, con diálogo y una reacción pertinente entre asteriscos cuando aporte algo. Usa el idioma de la conversación." : "Reply only with the character's next turn, with dialogue and a relevant reaction in asterisks when useful. Use the conversation's language.",
    spanish ? "La ficha define al personaje y la situación inicial; no constituye una conversación que ya haya ocurrido." : "The card defines the character and opening situation; it is not a conversation that has already happened.",
    JSON.stringify({ title: story.title, description: story.description, context: story.story_context }),
    currentTurnRules(historyLength, spanish),
  ].join("\n");
}
