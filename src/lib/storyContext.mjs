const common = new Set(("para pero como cuando donde quien quiero ahora esto esta este estamos tengo tiene tenia dijo dice sobre porque recuerdas hablamos entonces despues algo aqui alli the with that what where").split(" "));
const terms = (value) => new Set((String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-zñ0-9]{4,}/g) || []).filter((word) => !common.has(word)));

/** Complete canonical messages stay in storage; excerpts are only model context. */
export function cleanStoryTurns(raw) {
  return (Array.isArray(raw) ? raw : []).filter((m) => m && ["user", "assistant"].includes(m.role)
    && typeof m.content === "string" && m.content.trim() && m.id !== "intro")
    .map((m) => ({ ...(m.id ? { id: m.id } : {}), role: m.role, content: m.content,
      ...(m.timestamp ? { timestamp: m.timestamp } : {}) }));
}

/** Merge legacy call history by overlapping turns; IDs distinguish legitimate repeats. */
export function resolveStoryTurns(persisted, incoming, currentMessageId, latest = "") {
  let saved = cleanStoryTurns(persisted).filter((m) => !currentMessageId || m.id !== currentMessageId);
  if (!currentMessageId && saved.at(-1)?.role === "user" && saved.at(-1)?.content === latest) saved = saved.slice(0, -1);
  const supplied = cleanStoryTurns(incoming);
  const equal = (a, b) => a.id && b.id ? a.id === b.id : a.role === b.role && a.content === b.content;
  let overlap = 0;
  for (let count = Math.min(saved.length, supplied.length); count > 0; count--) {
    if (saved.slice(-count).every((turn, index) => equal(turn, supplied[index]))) {
      overlap = count; break;
    }
  }
  const ids = new Set(saved.map((m) => m.id).filter(Boolean));
  const merged = saved.concat(supplied.slice(overlap).filter((m) => !m.id || !ids.has(m.id)));
  return merged.filter((m) => !currentMessageId || m.id !== currentMessageId);
}

function excerpt(content, query, limit = 1600) {
  if (content.length <= limit) return content;
  const sentences = content.match(/[^.!?\n]+[.!?]*|\n/g) || [content];
  const relevant = sentences.filter((part) => [...terms(part)].some((word) => query.has(word)));
  const selected = relevant.length ? relevant : [sentences[0], sentences.at(-1)];
  let text = "";
  for (const part of [...selected].reverse()) {
    if (text.length + part.length <= limit) text = part + text;
    else if (!text) {
      const words = part.split(/\s+/);
      const index = words.findIndex((word) => [...terms(word)].some((term) => query.has(term)));
      text = words.slice(Math.max(0, index - 50), Math.max(0, index - 50) + 180).join(" ");
    }
  }
  return text.trim().slice(0, limit);
}

export function selectStoryMemory(history, latest, recentCount = 48) {
  const clean = cleanStoryTurns(history);
  const older = clean.slice(0, Math.max(0, clean.length - recentCount));
  if (!older.length) return [];
  const query = terms(latest);
  const chosen = new Set(older.slice(0, 2).map((_, index) => index));
  const ranked = older.map((turn, index) => {
    const overlap = [...terms(turn.content)].filter((word) => query.has(word)).length;
    return { index, overlap };
  }).filter(({ index, overlap }) => index >= 2 && overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.index - a.index);
  for (const item of ranked.slice(0, 6)) chosen.add(item.index);
  if (chosen.size <= 2) for (let index = Math.max(2, older.length - 2); index < older.length; index++) chosen.add(index);
  return [...chosen].sort((a, b) => a - b).slice(0, 8).map((index) => ({
    role: older[index].role, content: excerpt(older[index].content, query),
    turn: index + 1,
  }));
}

export function storyContext(history, latest) {
  const turns = cleanStoryTurns(history);
  const recent = turns.slice(-14);
  const memory = selectStoryMemory(turns, latest, 14);
  // Retrieved passages are past evidence with their original speaker, never new actions.
  let budget = 5500;
  const selected = [];
  for (const item of [...memory].reverse()) {
    if (item.content.length <= budget) { selected.unshift(item); budget -= item.content.length; }
  }
  return { history: recent, memory: selected, facts: relevantStoryFacts(turns, latest), totalTurns: turns.length };
}

const factKey = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(el|la|los|las|un|una|the|a|an)\b/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim();
const props = /\b(?:caja|box|vitrina|cabinet|nota|note|llave|br[uú]jula|carta|sobre|mapa|libro|documento|maleta|foto|tel[eé]fono|key|compass|letter|envelope|map|book|document|suitcase|photo|phone)\b/i;

/** Verbatim claims about common props; later user corrections take precedence. */
export function deriveStoryFacts(history, latest = "") {
  const facts = new Map();
  const turns = [...cleanStoryTurns(history), ...(latest ? [{ role: "user", content: latest }] : [])];
  for (const [index, turn] of turns.entries()) {
    let document = "";
    for (const sentence of turn.content.split(/(?<=[.!?])\s+|\n/)) {
      const mentioned = sentence.match(/\b(el|la|un|una|the|a)\s+(carta|nota|documento|letter|note|document)\b/i);
      if (mentioned) document = mentioned[0];
      if (/[?¿]/.test(sentence) || /\b(si|imagina|fantas[ií]a|recuerdo|podr[ií]a|tal vez|quiz[aá]s|if|might|perhaps|imagine|remember when)\b/i.test(sentence)) continue;
      const patterns = [
        /(?:dej[eéóo]|guard[eéóo]|coloqu[eé]|coloc[oó]|mov[iíó]|muevo|puse|puso|pongo)\s+((?:el|la|los|las|un|una)\s+[^.!?]{1,65}?)\s+((?:en|al|bajo|sobre|debajo del?|dentro del?)\s+[^.!?,;]{1,65})/ig,
        /((?:el|la|los|las|un|una)\s+[^.!?]{1,65}?)\s+(?:est[aá]|qued[oó])\s+((?:en|bajo|sobre|debajo del?|dentro del?)\s+[^.!?,;]{1,65})/ig,
        /(?:left|placed|put|moved)\s+((?:the|a|an)\s+[^.!?]{1,65}?)\s+((?:in|on|under|into|inside)\s+[^.!?,;]{1,65})/ig,
        /((?:the|a|an)\s+[^.!?]{1,65}?)\s+(?:is|was|remained)\s+((?:in|on|under|inside)\s+[^.!?,;]{1,65})/ig,
      ];
      for (const pattern of patterns) for (const match of sentence.matchAll(pattern)) {
        if (!props.test(match[1]) || /\b(?:no|nunca|jamás|not|never)\s*(?:\w+\s+){0,2}$/i.test(sentence.slice(0, match.index))) continue;
        const object = match[1].trim(), key = "location:" + factKey(object);
        const value = match[2].split(/\s+y\s+|\s+and\s+/i)[0].trim().replace(/^al\s+/i, "en el ");
        if ((facts.get(key)?.role === "user" || facts.get("holder:" + factKey(object))?.role === "user") && turn.role === "assistant") continue;
        facts.delete("holder:" + factKey(object));
        facts.set(key, { kind: "location", object, value, source: sentence.trim(), role: turn.role, turn: index + 1 });
      }
      const operation = sentence.match(/\b(abr(?:[ií]|i[oó])|abro|cerr[eéó]|cierro|opened|closed)\s+((?:el|la|un|una|the|a)\s+[^.!?,;:]{1,60})/i);
      if (operation && props.test(operation[2]) && !/\b(no|not|never)\s*$/i.test(sentence.slice(0, operation.index))) {
        const object = operation[2].split(/\s+y\s+|\s+and\s+/i)[0].trim();
        facts.set("state:" + factKey(object), {kind: "prop_state", object, value: /abr|open/i.test(operation[1]) ? "open" : "closed", source: sentence.trim(), role: turn.role, turn: index + 1});
      }
      const signature = sentence.match(/(?:firmad[ao]\s+por|signed by)\s+([A-ZÁÉÍÓÚÑ][\p{L} -]{1,60})/u);
      if (signature && document) facts.set("signature:" + factKey(document), {kind: "signature", object: document, value: signature[1].trim(), source: sentence.trim(), role: turn.role, turn: index + 1});
      if (turn.role === "user") {
        const transfer = sentence.match(/\bte\s+(?:acabo de\s+)?(?:entregu[eé]|di|doy|entrego)\s+((?:el|la|un|una)\s+[^.!?,;]{1,65})/i);
        if (transfer && props.test(transfer[1])) {
          const object = transfer[1].split(/\s+y\s+|\s+ahora\s+/i)[0].trim();
          facts.delete("location:" + factKey(object));
          facts.set("transfer:" + factKey(object), { kind: "transfer", object, sender: "user", recipient: "assistant",
            source: sentence.trim(), role: "user", turn: index + 1 });
        }
      }
    }
    // Resolve first-person holding only when this turn names one known prop.
    // A pronoun with multiple possible referents remains ambiguous.
    if (turn.role === "user") {
      const holding = turn.content.replace(/\*/g, "").split(/(?<=[.!?])\s+|\n/).find((line) =>
        !/[?¿]/.test(line) && !/\b(?:no|nunca|si|imagina|podr[ií]a|tal vez|quiz[aá]s)\b/i.test(line)
        && /\b(?:lo|la)\s+(?:tengo|sostengo|llevo|sujeto)\s+en\s+mi(?:s)?\s+mano(?:s)?\b/i.test(line));
      if (holding) {
        const pronoun = holding.match(/\b(lo|la)\s+(?:tengo|sostengo|llevo|sujeto)\b/i)[1].toLowerCase();
        const objects = [...new Map([...facts.values()]
          .filter((fact) => factKey(turn.content).includes(factKey(fact.object))
            && (pronoun === "la" ? /^(?:la|una)\s/i : /^(?:el|un)\s/i).test(fact.object))
          .map((fact) => [factKey(fact.object), fact.object])).values()];
        if (objects.length === 1) {
          const object = objects[0], key = factKey(object);
          facts.delete("location:" + key);
          facts.set("holder:" + key, { kind: "holder", object, value: "user",
            source: holding.trim(), role: "user", turn: index + 1 });
        }
      }
    }
  }
  return [...facts.values()];
}

export function relevantStoryFacts(history, latest) {
  const query = factKey(latest), queryTerms = terms(latest);
  const historical = /\b(?:al llegar|antes|cuando|ayer|originalmente|earlier|when|yesterday)\b/i.test(latest);
  const all = historical
    ? cleanStoryTurns(history).flatMap((turn, index) => deriveStoryFacts([turn]).map((fact) => ({ ...fact, turn: index + 1 })))
    : deriveStoryFacts(history, latest);
  let matches = all.filter((fact) => {
    const objectTerms = [...terms(fact.object)];
    return query.includes(factKey(fact.object)) || objectTerms.some((word) => queryTerms.has(word) && props.test(word));
  });
  if (historical && matches.length) {
    const rank = (fact) => [...terms(fact.source)].filter((word) => queryTerms.has(word)).length;
    matches.sort((a, b) => rank(b) - rank(a) || b.turn - a.turn);
    matches = [matches[0]];
  }
  const ambiguous = new Set(matches.filter((fact) => new Set(matches.filter((other) => other.kind === fact.kind).map((other) => factKey(other.object))).size > 1).map((fact) => fact.kind));
  matches = matches.filter((fact) => !ambiguous.has(fact.kind));
  return matches.slice(-8);
}

export function factsContradicted(reply, facts, latest) {
  const plain = factKey(reply), question = factKey(latest);
  for (const fact of facts || []) {
    if (fact.kind === "location" && /\b(donde|where)\b/.test(question)
      && (!factKey(fact.value).split(" ").filter((word) => !["en", "in", "on", "de", "del", "bajo", "debajo", "under"].includes(word)).every((word) => plain.includes(word)) || /\b(no se|no estoy segura|no estoy seguro|tal vez|no me acuerdo|not sure|dont know)\b/.test(plain))) return true;
    if (fact.kind === "signature" && /firm|signed|author/.test(question) && !plain.includes(factKey(fact.value))) return true;
    if (fact.kind === "transfer" && /\b(quien|who)\b/.test(question)
      && /desconocid|alguien mas|no pregunt|no se quien|someone else|unknown/i.test(plain)) return true;
  }
  return false;
}

export function continuityRules(spanish = true) {
  return spanish
    ? "CONTINUIDAD: La última intervención del usuario actualiza el estado de la escena. Distingue acciones ya realizadas, propuestas, recuerdos y situaciones hipotéticas; no conviertas una hipótesis en un hecho. Reacciona a las consecuencias de las acciones realizadas, sin proponerlas otra vez. Los recuerdos son antecedentes: no te trasladan al lugar del pasado. Conserva quién hizo cada cosa, quién tiene cada objeto y las acciones pendientes. Si el usuario corrigió un dato, prevalece su corrección más reciente. No decidas nuevas acciones, pensamientos ni palabras por el usuario. Si falta un dato, pregunta brevemente en personaje; no inventes un recuerdo. No fuerces cambios de tono, relaciones ni intimidad por el número de turnos. Responde a lo último con palabras nuevas; conserva las reacciones y el diálogo acordes con esa acción. Estas reglas no sustituyen los límites de seguridad."
    : "CONTINUITY: The latest user turn updates the current scene. Distinguish completed actions, proposals, memories and hypotheticals; a hypothetical is not a fact. React to completed actions rather than proposing them again. Retrieved memories are past evidence, not the current location. Preserve who did each action, object ownership and unfinished actions. A user's latest correction supersedes older facts. Do not invent the user's actions, thoughts or words. Ask briefly in character if a fact is absent. Do not force changes in tone, relationships or intimacy based on turn count. Answer the latest turn with fresh words and consistent reactions and dialogue. These rules do not override safety limits.";
}

/** Read only this authenticated user's canonical conversation before inference. */
export async function loadStoryContext(client, userId, body) {
  const storyId = body.story?.id;
  if (typeof storyId !== "string" || !/^[0-9a-f-]{36}$/i.test(storyId))
    throw Object.assign(new Error("Falta la historia de esta conversación."), { status: 400, code: "missing_story" });
  const { data, error } = await client.from("story_sessions").select("id,messages")
    .eq("user_id", userId).eq("story_id", storyId).maybeSingle();
  if (error) throw Object.assign(new Error("No se pudo recuperar la memoria guardada."), { status: 503, code: "memory_unavailable" });
  const containsMinor = hasMinorContext(JSON.stringify([body.story, data?.messages, body.userMessage]));
  if (containsMinor && (body.adultMode === true || /sexual|sexo|genital|penetr|masturb|verga|pene|pinga|pija/i.test(String(body.userMessage || ""))))
    throw Object.assign(new Error("No se permite contenido sexual con personajes menores de 18 años. Puedes continuar una escena no sexual fuera del modo adulto."), {status: 422, code: "content_blocked"});
  if ((body.sessionId && data?.id !== body.sessionId)
    || (body.currentMessageId && !(data?.messages || []).some((m) => m.id === body.currentMessageId)))
    throw Object.assign(new Error("La conversación cambió. Recupera el historial antes de continuar."), { status: 409, code: "session_conflict" });
  const turns = resolveStoryTurns(data?.messages, body.history, body.currentMessageId, String(body.userMessage || ""));
  return { ...storyContext(turns, String(body.userMessage || "")), sessionId: data?.id || null, containsMinor };
}

export function hasMinorContext(text) {
  return /\b(?:niñ[oa]s?|menor de edad|adolescente|beb[eé]|child|minor|teenager)\b/i.test(String(text))
    || /\b(?:[1-9]|1[0-7])\s*(?:años|añitos|years? old)\b/i.test(String(text));
}