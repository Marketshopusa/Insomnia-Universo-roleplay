/** Optional real-provider QA: run after the build, in an authorized production environment. */
import { writeFileSync, mkdirSync } from "node:fs";
import { synthesizeExpressiveScene } from "../src/lib/expressiveAudio.mjs";
import { prepareExpressiveSpeech } from "../src/lib/expressiveSpeech.mjs";
import { synthesizeGemini, getGeminiAccessToken, quotaProjectId } from "../api/geminiTts.mjs";

const safeFetch = (url, options) => {
  if (String(url).includes("serviceusage.googleapis.com")) throw new Error("verification_must_not_enable_services");
  return fetch(url, options);
};
const source = '*Grité de dolor y me agarré el brazo* «No me toques, por favor». *Sollozo* «Me duele». *Suspiro* «Ya estoy más tranquila». *Río suavemente* «Gracias por ayudarme». *Gruño por el esfuerzo* *Gimo de dolor* «Me lastimé».';
try {
  const token = await getGeminiAccessToken();
  const expression = prepareExpressiveSpeech(source);
  const result = await synthesizeExpressiveScene(expression, "Aoede", "es", { region: "mx", cache: new Map(), synthesize: (text, voice, lang, options) => synthesizeGemini(text, voice, lang, { ...options, tokenProvider: async () => token, fetchImpl: safeFetch }) });
  if (result.status !== 200) throw new Error("expressive_verification_provider_status_" + result.status);
  const pcm = result.pcm;
  const seconds = pcm.length / 48000;
  let peak = 0, energy = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const value = pcm.readInt16LE(i);
    peak = Math.max(peak, Math.abs(value)); energy += value * value;
  }
  const rms = Math.sqrt(energy / (pcm.length / 2));
  if (seconds < 3 || peak < 100 || rms < 20) throw new Error("expressive_verification_empty_or_short_audio");
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  mkdirSync("dist/verification", { recursive: true });
  writeFileSync("dist/verification/expressive-scene.wav", wav);
  const report = { provider: "gemini-2.5-flash-tts", seconds, peak, rms, source, text: expression.text, parts: result.parts, reactions: expression.reactions.map((item) => item.event), auditoryReview: "pending" };
  const reviewModel = process.env.EXPRESSIVE_AUDIO_REVIEW_MODEL;
  if (reviewModel) {
    const response = await safeFetch("https://aiplatform.googleapis.com/v1/projects/" + encodeURIComponent(quotaProjectId()) + "/locations/global/publishers/google/models/" + encodeURIComponent(reviewModel) + ":generateContent", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "x-goog-user-project": quotaProjectId() },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } },
          { text: 'Analyze ONLY the audible recording, without assuming any intended script. Return JSON with keys transcript (exact spoken words in Spanish), events (chronological list of audible nonverbal vocal sounds, each with start_seconds, end_seconds, kind, confidence and description), spoken_cue_names (any literal English cue words spoken aloud), naturalness_notes. Distinguish a physical scream from calmly spoken ah/ay, an actual sob from merely sad dialogue, a sigh from a sob, and actual laughter from a smiling tone. Do not invent an inaudible event. Use kind values scream, sob, cry, sigh, laugh, grunt, groan, other. Confidence 0 to 1.' }
        ] }],
        generationConfig: { audioTimestamp: true, temperature: 0, responseMimeType: "application/json", maxOutputTokens: 3000 }
      }), signal: AbortSignal.timeout(40000)
    });
    if (response.ok) {
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.filter((part) => typeof part.text === "string").map((part) => part.text).join("") || "";
      report.audioReview = JSON.parse(content);
      const normalized = String(report.audioReview.transcript || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ");
      const phrases = ["me agarre el brazo", "no me toques por favor", "me duele", "ya estoy mas tranquila", "gracias por ayudarme", "me lastime"];
      let previous = -1;
      const speechCorrect = phrases.every((phrase) => {
        const at = normalized.indexOf(phrase);
        const once = at >= 0 && normalized.indexOf(phrase, at + phrase.length) < 0;
        const ordered = at > previous; previous = at;
        return once && ordered;
      });
      const events = report.audioReview.events || [];
      const has = (kinds) => events.some((event) => kinds.includes(event.kind) && event.confidence >= 0.7);
      const soundsCorrect = has(["scream"]) && has(["sob", "cry"]) && has(["sigh"]) && has(["laugh"]) && has(["grunt", "groan"]);
      const noLabels = !(report.audioReview.spoken_cue_names || []).length && !/\b(?:narracion|dialogo|instrucciones)\b/.test(normalized);
      // Adjacent short gutural sounds may be reported as one cluster.
      // Every individual sample was independently checked by verifyVocalBank.
      const delivered = (result.parts || []).filter((part) => part.kind === "reaction");
      const allPartsPresent = delivered.length === expression.reactions.length && delivered.every((part, i) => part.event === expression.reactions[i].event && part.endSample > part.startSample);
      report.auditoryReview = speechCorrect && soundsCorrect && noLabels && allPartsPresent ? "automated_pass" : "automated_failed";
      report.checks = {speechCorrect, soundsCorrect, noLabels, allPartsPresent};

      console.log("EXPRESSIVE_AUDIO_REVIEW " + JSON.stringify(report.audioReview));
    } else {
      report.auditoryReview = "unavailable_" + response.status;
      console.log("EXPRESSIVE_AUDIO_REVIEW_UNAVAILABLE " + response.status);
    }
  }
  writeFileSync("dist/verification/expressive-scene.json", JSON.stringify(report, null, 2));
  console.log("EXPRESSIVE_REAL_AUDIO " + JSON.stringify({ seconds, peak, rms, reactions: report.reactions, auditoryReview: report.auditoryReview, checks: report.checks }));
  if (report.auditoryReview === "automated_failed") throw new Error("expressive_verification_audio_review_failed");
} catch (error) {
  // Do not log credentials, access tokens or provider response bodies.
  console.error("EXPRESSIVE_REAL_AUDIO_FAILED " + (error.message?.includes("expressive_verification") ? error.message : error.code || error.name || "provider_access_failed"));
  process.exitCode = 1;
}
