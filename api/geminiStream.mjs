import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { geminiStreamPlan, getGeminiAccessToken, quotaProjectId } from "./geminiTts.mjs";
import { TTS_STREAM_PROTO } from "./ttsStreamProto.mjs";

let cachedService;

export async function ttsStreamClientReady() {
  const Service = await streamingService();
  return typeof Service === "function";
}

async function streamingService() {
  if (cachedService) return cachedService;
  const grpc = await import("@grpc/grpc-js");
  const protoLoader = await import("@grpc/proto-loader");
  const directory = mkdtempSync(path.join(tmpdir(), "insomnia-tts-"));
  const protoPath = path.join(directory, "tts-stream.proto");
  writeFileSync(protoPath, TTS_STREAM_PROTO);
  const definition = protoLoader.loadSync(protoPath, { keepCase: false, longs: String, defaults: true, oneofs: true });
  const loaded = grpc.loadPackageDefinition(definition);
  cachedService = loaded.google.cloud.texttospeech.v1beta1.TextToSpeech;
  return cachedService;
}

function openCall(Service, token, projectId) {
  return import("@grpc/grpc-js").then((grpc) => {
    const client = new Service("texttospeech.googleapis.com:443", grpc.credentials.createSsl());
    const metadata = new grpc.Metadata();
    metadata.set("authorization", "Bearer " + token);
    if (projectId) metadata.set("x-goog-user-project", projectId);
    const deadline = new Date(Date.now() + 45_000);
    return client.streamingSynthesize(metadata, { deadline });
  });
}

/**
 * Sends the whole line once. Audio chunks are headerless 24 kHz PCM and can
 * play before Google finishes the rest of the same line.
 */
export async function streamGeminiSpeech(text, preset, language, {
  performance = "neutral",
  region = "mx",
  onAudio,
  tokenProvider = getGeminiAccessToken,
  createCall,
} = {}) {
  const plan = geminiStreamPlan(text, preset, language, performance, region);
  const token = await tokenProvider();
  const projectId = quotaProjectId();
  const call = createCall
    ? await createCall(plan)
    : await openCall(await streamingService(), token, projectId);
  let heard = false;
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };
      call.on("data", (message) => {
        const audio = message?.audioContent ?? message?.audio_content;
        if (!audio || audio.length < 2) return;
        const pcm = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
        if (pcm.length < 2) return;
        heard = true;
        onAudio(pcm.subarray(0, pcm.length - (pcm.length % 2)));
      });
      call.on("error", (error) => finish(error));
      call.on("end", () => finish());
      call.write({ streamingConfig: plan.streamingConfig });
      call.write({ input: plan.input });
      call.end();
    });
  } catch (error) {
    try { call.cancel(); } catch { /* The call may already be closed. */ }
    throw error;
  }
  if (!heard) throw new Error("gemini_stream_empty");
  return true;
}
