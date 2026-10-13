import { expect, it } from "vitest";
import { prepareExpressiveSpeech as score } from "./expressiveSpeech.mjs";
import { synthesizeExpressiveScene as render } from "./expressiveAudio.mjs";

it("assembles sound, narration and dialogue in story order despite out-of-order completion", async () => {
  const calls = [];
  let active = 0, peak = 0;
  const synthesize = async (text, _voice, _lang, options) => {
    const index = calls.length;
    calls.push({ text, score: options.expression });
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, index === 0 ? 15 : 1));
    active--;
    return { status: 200, pcm: Buffer.from([index + 1, 0]) };
  };
  const result = await render(score('*Grito de dolor y me agarro el brazo* «No me toques». *Sollozo* «Me duele»'), "Aoede", "es", { synthesize, cache: new Map(), samples: () => null });
  expect(peak).toBe(2);
  expect(calls.map((call) => call.score.reactions[0]?.event || "speech")).toEqual(["pain_scream", "speech", "sob"]);
  expect(calls[1].text).toBe('Me agarro el brazo. «No me toques»');
  expect(calls[2].text).toBe('[crying] «Me duele»');
  expect([...result.pcm]).toEqual([1, 0, 2, 0, 3, 0]);
});

it("reuses a neural reaction only for the same voice, language, region and sound", async () => {
  const cache = new Map();
  let count = 0;
  const synthesize = async () => { count++; return { status: 200, pcm: Buffer.from([1, 0]) }; };
  await render(score("*Río*"), "Aoede", "es", { synthesize, cache, samples: () => null, region: "mx" });
  await render(score("*Río*"), "Aoede", "es", { synthesize, cache, samples: () => null, region: "mx" });
  expect(count).toBe(1);
  await render(score("*Río*"), "Leda", "es", { synthesize, cache, samples: () => null, region: "mx" });
  await render(score("*Río*"), "Aoede", "es", { synthesize, cache, samples: () => null, region: "ve" });
  expect(count).toBe(3);
});

it("does not publish partial speech when a sound cannot be generated", async () => {
  const result = await render(score("*Grito* Ayúdame. *Sollozo* Me duele."), "Aoede", "es", {
    cache: new Map(), samples: () => null, synthesize: async (_text, _voice, _lang, options) => options.expression.reactions[0]?.event === "sob"
      ? { status: 429, detail: "quota" } : { status: 200, pcm: Buffer.from([1, 0]) },
  });
  expect(result.status).toBe(429);
  expect(result.pcm).toBeUndefined();
});

it("rejects empty PCM instead of silently omitting a reaction", async () => {
  const result = await render(score("*Río*"), "Aoede", "es", { cache: new Map(), samples: () => null, synthesize: async () => ({ status: 200, pcm: Buffer.alloc(0) }) });
  expect(result.status).toBe(502);
});

it("keeps the preparation time within the speech endpoint deadline", async () => {
  const result = await render(score("*Río*"), "Aoede", "es", { cache: new Map(), samples: () => null, deadlineMs: 5, synthesize: () => new Promise(() => {}) });
  expect(result.status).toBe(504);
});

it("uses verified sound samples while generating only the exact spoken runs", async () => {
  const calls = [];
  const sample = Buffer.from([5, 0]);
  const result = await render(score('*Grito de dolor* «Ayúdame». *Sollozo* «Me duele»'), "Aoede", "es", {
    samples: (_voice, _language, event) => ["pain_scream", "sob"].includes(event) ? sample : null,
    synthesize: async (text, _voice, _language, options) => {
      calls.push(text);
      expect(options.expression.reactions).toHaveLength(0);
      return { status: 200, pcm: Buffer.from([9, 0]) };
    },
  });
  expect(calls).toEqual(['«Ayúdame»', '«Me duele»']);
  expect([...result.pcm]).toEqual([5, 0, 9, 0, 5, 0, 9, 0]);
});


it("changes gesture delivery locally instead of applying the final emotion to all dialogue", async () => {
  const calls = [];
  await render(score('*Sonrío* «Hola». *Me quedo sorprendida* «No te esperaba». *Me siento molesta* «Eso no está bien»'), "Aoede", "es", {
    samples: () => null,
    synthesize: async (text, _voice, _language, options) => {
      calls.push({text, delivery:options.expression.segments.filter((part) => part.kind === "dialogue").map((part) => part.performance)});
      return { status:200, pcm:Buffer.from([1,0]) };
    },
  });
  expect(calls).toEqual([
    {text:'Sonrío. «Hola»',delivery:["warm"]},
    {text:'Me quedo sorprendida. «No te esperaba»',delivery:["surprised"]},
    {text:'Me siento molesta. «Eso no está bien»',delivery:["angry"]},
  ]);
});
