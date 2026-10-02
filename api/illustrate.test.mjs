import test from "node:test";
import assert from "node:assert/strict";
import { drawScene, sceneJobRow, scenePrompt } from "./illustrate.mjs";

test("a scene illustration asks Gemini for the picture and returns it", async () => {
  const prompt = scenePrompt({ focusText: "Ella cruza la calle de noche", storyTitle: "Reencuentro" });
  assert.match(prompt, /LATEST MOMENT: Ella cruza la calle de noche/);
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
  assert.match(row.prompt, /LATEST MOMENT/);
  if (previous === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previous;
});
