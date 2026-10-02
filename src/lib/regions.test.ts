import { expect, it } from "vitest";
import { browserSpeechLocale } from "./regions";

it("uses a speech locale the browser call can recognize", () => {
  expect(browserSpeechLocale("es", "ve")).toBe("es-419");
  expect(browserSpeechLocale("es", "ar")).toBe("es-419");
  expect(browserSpeechLocale("es", "mx")).toBe("es-MX");
  expect(browserSpeechLocale("es", "es")).toBe("es-ES");
  expect(browserSpeechLocale("en", "ve")).toBe("en-US");
});
