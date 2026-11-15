import { expect, it } from "vitest";
import { chatSceneContext } from "./chatScene";
const card = { id: "my-card", bio: "Ana trabaja en la biblioteca.", starterMessage: "Al abrir la escena, Ana revisa una carta que encontró en la mesa." };
it("retains an author's starting situation as context rather than a prior assistant turn", () => {
  expect(chatSceneContext(card, true)).toContain(card.starterMessage);
  expect(chatSceneContext(card, true)).toContain("no un turno ya hablado");
});
it("keeps the current card's language-specific scene separate", () => {
  expect(chatSceneContext({ ...card, starterMessageEs: "ESCENA_A", starterMessageEn: "SCENE_B" }, true)).toContain("ESCENA_A");
  expect(chatSceneContext({ ...card, starterMessageEs: "ESCENA_A", starterMessageEn: "SCENE_B" }, true)).not.toContain("SCENE_B");
});
it("does not inject a retired catalog greeting into scene context", () => {
  const old = { ...card, id: "ava", starterMessage: "*Holding my wine glass with a thoughtful smile.* The best stories always begin after midnight, don't you think?" };
  expect(chatSceneContext(old, false)).toBe(old.bio);
});
