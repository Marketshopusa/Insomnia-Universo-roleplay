import { expect, it } from "vitest";
import { isRepeatedTurn } from "./conversationReply.mjs";

it("allows a memory answer that repeats the requested facts", () => {
  const history = [{ role: "assistant", content: "Sí, Luis. Tu instrumento es el violín y tu clave es SONATA77." }];
  expect(isRepeatedTurn("Luis, tu instrumento es el violín y tu clave es SONATA77.", history, "Dime mi nombre, mi instrumento y mi clave.")).toBe(false);
  expect(isRepeatedTurn(history[0].content, history, "Repite esa información.")).toBe(false);
});

it("rejects duplicate and substantially copied unsolicited replies", () => {
  const reply = "Hoy vamos a estudiar los anillos de Saturno con mucho cuidado y después observaremos sus satélites.";
  const history = [{ role: "assistant", content: reply }];
  expect(isRepeatedTurn(reply, history, "¿Y qué haremos después?")).toBe(true);
  expect(isRepeatedTurn("Hoy vamos a estudiar los anillos de Saturno con mucho cuidado y después observaremos sus satélites de cerca.", history)).toBe(true);
});

it("allows ordinary shared phrases when the response advances the conversation", () => {
  const history = [{ role: "assistant", content: "La clave de acceso es ORBITA23. Abre la puerta al llegar." }];
  expect(isRepeatedTurn("La clave de acceso es útil si llegas antes que yo, pero hoy nos encontraremos en la entrada principal.", history)).toBe(false);
});
