import test from "node:test";
import assert from "node:assert/strict";
import { geminiStreamPlan } from "./geminiTts.mjs";
import { streamGeminiSpeech, ttsStreamClientReady } from "./geminiStream.mjs";

const line = "Ella [moaning] gimió con fuerza y [shouting] gritó de placer, y después dijo que el video sí lo había enviado ella.";

test("the streaming client can be built without calling Google", async () => {
  assert.equal(await ttsStreamClientReady(), true);
});

test("streaming speaks the whole line once, with the sounds still in it", () => {
  const plan = geminiStreamPlan(line, "scarlett-hd", "es", "pleasure", "mx");
  assert.equal(plan.input.text, line);
  assert.equal(plan.streamingConfig.voice.name, "Aoede");
  assert.equal(plan.streamingConfig.voice.modelName, "gemini-2.5-flash-tts");
  assert.match(plan.input.prompt, /\[moaning\]/);
  assert.match(plan.input.prompt, /\[shouting\]/);
  assert.equal(plan.streamingConfig.advancedVoiceOptions.safetySettings.settings[0].threshold, 4);
});

test("audio starts as soon as the first chunk arrives and keeps the later chunks", async () => {
  const writes = [];
  const heard = [];
  await streamGeminiSpeech(line, "Aoede", "es", {
    performance: "pleasure",
    region: "mx",
    tokenProvider: async () => "test-token",
    onAudio: (pcm) => heard.push(Buffer.from(pcm)),
    createCall: async (plan) => {
      const listeners = {};
      return {
        on(event, callback) { listeners[event] = callback; },
        write(message) { writes.push(message); },
        end() {
          assert.equal(writes[1].input.text, plan.input.text);
          listeners.data?.({ audioContent: Buffer.from([1, 0, 2, 0]) });
          listeners.data?.({ audioContent: Buffer.from([3, 0, 4, 0]) });
          listeners.end?.();
        },
        cancel() {},
      };
    },
  });
  assert.equal(writes.length, 2);
  assert.equal(writes[1].input.text, line);
  assert.deepEqual(Buffer.concat(heard), Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]));
});
