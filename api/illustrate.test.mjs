import test from "node:test";
import assert from "node:assert/strict";
import { drawScene, sceneJobRow, scenePrompt } from "./illustrate.mjs";

test("a scene illustration asks Gemini for the picture and returns it", async () => {
  const prompt = scenePrompt({ focusText: "Ella cruza la calle de noche", storyTitle: "Reencuentro" });
  assert.match(prompt, /CHARACTER visible reaction: Ella cruza la calle de noche/);
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let seen;
  const url = await drawScene(prompt, {
    fetchImpl: async (address, init) => {
      seen = { address: String(address), body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "abc" } }] } }],
      }), { status: 200 });
    },
  });
  assert.equal(url, "data:image/png;base64,abc");
  assert.match(seen.address, /gemini-2\.5-flash-image:generateContent$/);
  assert.deepEqual(seen.body.generationConfig.responseModalities, ["IMAGE"]);
  assert.equal(seen.body.generationConfig.imageConfig.aspectRatio, "3:4");
  const row = sceneJobRow("user-1", { source: "story", sceneKey: "momento", focusText: "Ella cruza la calle de noche" });
  assert.equal(row.status, "queued");
  assert.equal(row.owner_id, "user-1");
  assert.equal(row.scene_key, "momento");
  assert.match(JSON.parse(row.prompt).scene_prompt, /CHARACTER visible reaction/);
  const withCover = sceneJobRow("user-1", {
    focusText: "Ella abre el libro marcado",
    coverImageUrl: "https://cexzmelshvbgabihtfvx.supabase.co/storage/v1/object/public/user-story-covers/example.png",
  });
  assert.match(JSON.parse(withCover.prompt).cover_url, /user-story-covers\/example\.png$/);
  if (previous === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previous;
});

test("a long user action reaches the illustration without cropping away its subject", () => {
  const action = "Camino lentamente por el pasillo y observo las pinturas. ".repeat(7)
    + "Entrego la brújula a Andrea junto a la puerta.";
  const prompt = scenePrompt({
    focusText: "*Andrea recibe la brújula y señala la puerta*",
    userAction: "*" + action + "*",
    characterRole: "Andrea",
    playerRole: "William",
  });
  assert.match(prompt, /PLAYER visible action: Camino lentamente/);
  assert.match(prompt, /Entrego la brújula a Andrea/);
  assert.doesNotMatch(prompt, /Crop before/);
  assert.match(prompt, /no bystanders/);
});

test("the illustration depicts the latest visible action once", () => {
  const prompt = scenePrompt({
    storyDescription: "Dos amigos investigan una cabaña.",
    characterRole: "Andrea con chaqueta azul",
    sceneText: "Player: William encontró la llave y abrió la puerta.",
    focusText: "*Me inclino junto al mapa sobre la mesa* Encontraste una pista. Creo que lleva al bosque.",
    userAction: "*Abro la puerta y pongo una llave sobre la mesa*",
  });
  assert.match(prompt, /PLAYER visible action: Abro la puerta y pongo una llave sobre la mesa/);
  assert.match(prompt, /CHARACTER visible reaction: Me inclino junto al mapa sobre la mesa/);
  assert.equal((prompt.match(/Me inclino junto al mapa/g) || []).length, 1);
  assert.match(prompt, /Current setting cues only: Player: William encontró la llave/);
  assert.doesNotMatch(prompt, /CHARACTER visible reaction:.*Encontraste una pista/);
});
