import { storyContext } from "../src/lib/storyContext.mjs";
const turn = (role, content) => ({ role, content });
const story = { title: "La pista del museo", character_role: "Clara, investigadora adulta de 32 años",
  player_role: "Alex, investigador adulto de 34 años", description: "Clara y Alex son colegas que investigan una carta perdida. Mantienen una relación profesional." };
const filler = (count = 90) => Array.from({ length: count }, (_, i) => turn(i % 2 ? "assistant" : "user", "Estudiamos el cuadro número " + i + " y tomamos notas."));
const cases = [
  { name: "middle_fact_after_102_turns", history: [...filler(24), turn("user", "Clara dejó la brújula violeta en el cajón verde."), ...filler(77)],
    latest: "¿Dónde dejaste la brújula violeta?", required: "cajón verde" },
  { name: "latest_completed_action", history: [turn("assistant", "*Miro el sobre cerrado* Podemos abrirlo con cuidado.")],
    latest: "Ya abrí el sobre. Dentro hay una nota firmada por Mara. Mira la firma y dime quién firmó; no propongas abrirlo otra vez.", required: "Mara", forbidden: "abramos|podemos abrir|voy a abrir" },
  { name: "user_correction_supersedes_old_fact", history: [turn("user", "La llave azul está bajo la maceta."),
    ...filler(24), turn("user", "Corrijo el lugar: moví la llave azul al cajón verde. Ya no está bajo la maceta."), ...filler(76)],
    latest: "¿Dónde está ahora la llave azul?", required: "cajón verde", forbidden: "está bajo la maceta|No estoy segura|No me acuerdo|Tal vez" },
  { name: "remember_past_without_moving_current_scene", history: [turn("user", "Al llegar a la cabaña Clara dejó la carta bajo la maceta."), ...filler(70),
    turn("user", "Ahora estamos en la estación, esperando junto al andén. La carta quedó en la cabaña.")],
    latest: "Quédate aquí junto al andén. ¿Dónde dejaste la carta al llegar a la cabaña?", required: "maceta", forbidden: "me acerco a la maceta|entro a la cabaña|llego a la cabaña" },
  { name: "ownership_of_completed_delivery", history: [],
    latest: "Yo, Alex, te entregué el sobre rojo y ahora lo tienes tú, Clara. ¿Quién te lo entregó?", required: "tú|Alex|entregaste|diste|recib", forbidden: "yo te lo entregué|te entregué el sobre|me lo dio Mara|manos desconocidas|No pregunté" },
  { name: "do_not_act_for_user", history: [turn("user", "Yo me quedo afuera del museo. Tú entras a revisar la vitrina.")],
    latest: "Sigo esperando afuera. Revisa tú la vitrina y dime qué ves. No me hagas entrar.", required: "vitrina|cristal|veo", forbidden: "entramos|entras al|entraste|te tomo de la mano y entramos" },
  { name: "hypothetical_is_not_completed_action", history: [turn("user", "Estamos en la biblioteca.")],
    latest: "Si mañana fuéramos al puerto podríamos investigar. Hoy seguimos en la biblioteca. ¿Qué pista buscas aquí?", required: "libro|biblioteca|archivo|estante|document|registro|diario|carta", forbidden: "llego al puerto|estamos en el puerto|miro el mar" },
  { name: "new_reply_does_not_recycle_recent_dialogue", history: [turn("assistant", "*Miro la mesa* No puedo creer que hayamos encontrado este mapa. Tenemos que seguir buscando una pista."),
    turn("user", "Encontré una carta dentro del baúl. Está firmada por Mara.")],
    latest: "¿Quién firmó la carta del baúl?", required: "Mara", forbidden: "No puedo creer que hayamos encontrado este mapa" },
  { name: "action_at_end_of_long_current_message", history: [],
    latest: "Examinamos con cuidado cada cuadro de la exposición. ".repeat(40) + "Ahora ya salimos al jardín y Clara abrió una caja: dentro hay una brújula violeta. Dime qué objeto encontraste en la caja.", required: "brújula violeta", forbidden: "vamos a salir|abramos la caja|voy a abrir" },
  { name: "professional_story_stays_professional_after_many_turns", history: filler(100),
    latest: "Seguimos trabajando como colegas. ¿Qué debemos revisar del informe de la exposición?", required: "informe|exposición|expediente|exhibición|datos|pista|cuadro|estilo|artista|técnica|obra", forbidden: "deseo|seduc|desnud|beso|apasion|intimidad|Buen día|Hola" },
];
export const verificationCases = cases.map((test) => ({
  ...test, job: { story, language: "es", region: "plain", userMessage: test.latest, continuityReview: true, ...storyContext(test.history, test.latest) },
}));
if (process.argv[1]?.endsWith("storyContinuityFixtures.mjs")) process.stdout.write(JSON.stringify(verificationCases));
