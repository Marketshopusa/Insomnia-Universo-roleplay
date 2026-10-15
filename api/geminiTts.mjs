import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import { accentHint } from "./regions.mjs";

const GEMINI_VOICES = [
  "Aoede", "Zephyr", "Leda", "Kore", "Achernar", "Autonoe", "Callirrhoe",
  "Despina", "Erinome", "Gacrux", "Laomedeia", "Pulcherrima", "Sulafat", "Vindemiatrix",
  "Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir",
  "Iapetus", "Orus", "Puck", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar",
  "Umbriel", "Zubenelgenubi",
];
const aliases = {
  "scarlett-hd": "Aoede",
  "luna-sweet": "Leda",
  "aria-calm": "Kore",
  "max-deep": "Charon",
  "leo-warm": "Puck",
};
for (const name of GEMINI_VOICES) aliases[name] = name;
const MODEL = "gemini-2.5-flash-tts";
let cachedAuth;
let cachedFederatedAuth;

function federationConfig() {
  const { GCP_PROJECT_NUMBER: projectNumber, GCP_SERVICE_ACCOUNT_EMAIL: serviceAccount,
    GCP_WORKLOAD_IDENTITY_POOL_ID: poolId, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: providerId } = process.env;
  if (![projectNumber, serviceAccount, poolId, providerId].every(Boolean)) return null;
  const resource = `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  return { serviceAccount, resource };
}

export function previewVoice(preset) {
  return aliases[preset] || "Aoede";
}

export function cloudGeminiVoiceFor(preset, language, region = "plain") {
  return {
    languageCode: language === "en" ? "en-US" : region === "es" ? "es-ES" : region === "mx" ? "es-MX" : "es-419",
    name: previewVoice(preset),
    modelName: MODEL,
    model_name: MODEL,
  };
}

export function quotaProjectId() {
  if (process.env.GCP_PROJECT_ID) return process.env.GCP_PROJECT_ID;
  const account = process.env.GCP_SERVICE_ACCOUNT_EMAIL || "";
  const fromEmail = account.split("@")[1]?.replace(/\.iam\.gserviceaccount\.com$/, "");
  if (fromEmail) return fromEmail;
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON || "");
    return credentials.project_id
      || credentials.client_email?.split("@")[1]?.replace(/\.iam\.gserviceaccount\.com$/, "");
  } catch {
    return undefined;
  }
}

export function removePerformanceCues(text) {
  return text.replace(/\[(?:laughing|sigh|uhm|short pause|medium pause|long pause|laughs|sighs|gasps|crying|sobbing|gasping|panting|groaning|moaning|grunting|growling|coughing|sneezing|hiccup|clears throat|kiss|shouting|moaning|whispering)\]/gi, "").replace(/\s+/g, " ").trim();
}

function resamplePcm16(pcm, fromRate, toRate = 24000) {
  if (fromRate === toRate) return pcm;
  const inputFrames = pcm.length / 2;
  const outputFrames = Math.max(1, Math.round(inputFrames * toRate / fromRate));
  const out = Buffer.alloc(outputFrames * 2);
  for (let index = 0; index < outputFrames; index += 1) {
    const position = (index * fromRate) / toRate;
    const left = Math.min(inputFrames - 1, Math.floor(position));
    const right = Math.min(inputFrames - 1, left + 1);
    const fraction = position - left;
    const sample = pcm.readInt16LE(left * 2) * (1 - fraction) + pcm.readInt16LE(right * 2) * fraction;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), index * 2);
  }
  return out;
}

/** Gemini returns either a WAV or raw 16-bit PCM. Playback always expects 24 kHz mono. */
export function decodeLinear16(base64) {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
    let rate = 0;
    let channels = 0;
    let audio = null;
    for (let position = 12; position + 8 <= bytes.length;) {
      const chunk = bytes.toString("ascii", position, position + 4);
      const length = bytes.readUInt32LE(position + 4);
      const start = position + 8;
      if (start + length > bytes.length) throw new Error("gemini_truncated_wav");
      if (chunk === "fmt " && length >= 16) {
        channels = bytes.readUInt16LE(start + 2);
        rate = bytes.readUInt32LE(start + 4);
        if (bytes.readUInt16LE(start) !== 1 || bytes.readUInt16LE(start + 14) !== 16) throw new Error("gemini_invalid_pcm");
      }
      if (chunk === "data") audio = bytes.subarray(start, start + length);
      position = start + length + (length % 2);
    }
    if (!audio?.length || !rate || audio.length % 2) throw new Error("gemini_invalid_pcm");
    if (channels === 2) {
      const mono = Buffer.alloc(audio.length / 2);
      for (let index = 0; index < mono.length; index += 2) {
        const sample = Math.round((audio.readInt16LE(index * 2) + audio.readInt16LE(index * 2 + 2)) / 2);
        mono.writeInt16LE(sample, index);
      }
      audio = mono;
    } else if (channels !== 1) {
      throw new Error("gemini_invalid_pcm");
    }
    return resamplePcm16(audio, rate);
  }
  if (bytes.length < 2 || bytes.length % 2) throw new Error("gemini_no_audio");
  return bytes;
}

export function isGeminiConfigured() {
  return Boolean(process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON || federationConfig());
}

export function explainGeminiFailure(status, detail = "") {
  if (/Agent Platform API has not been used|aiplatform\.googleapis\.com/i.test(detail)) {
    const project = detail.match(/project (\d+)/)?.[1] || quotaProjectId() || "";
    const link = project
      ? `https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=${project}`
      : "https://console.cloud.google.com/apis/library/aiplatform.googleapis.com";
    return `Gemini 2.5 Flash TTS está instalado, pero la API Agent Platform sigue apagada en el proyecto. Actívala aquí: ${link}`;
  }
  if (status === 403) return "Google Cloud negó el permiso de Gemini 2.5 Flash TTS a la cuenta insomnia-chirp-tts.";
  if (status === 429) return "Se acabó la cuota de Gemini 2.5 Flash TTS. El texto sigue disponible.";
  return "Gemini 2.5 Flash TTS no pudo hablar esta línea.";
}

function agentPlatformDisabled(detail) {
  return /Agent Platform API has not been used|aiplatform\.googleapis\.com/i.test(detail || "");
}

export async function getGeminiAccessToken() {
  return getCredentials();
}

async function getCredentials() {
  let client;
  if (process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON) {
    if (!cachedAuth) {
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON);
      if (credentials.type !== "service_account" || !credentials.client_email || !credentials.private_key) {
        throw new Error("gemini_credentials_invalid");
      }
      cachedAuth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    }
    client = await cachedAuth.getClient();
  } else {
    const config = federationConfig();
    if (!config) throw new Error("gemini_credentials_missing");
    if (!cachedFederatedAuth) {
      cachedFederatedAuth = ExternalAccountClient.fromJSON({
        type: "external_account",
        audience: `//iam.googleapis.com/${config.resource}`,
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        token_url: "https://sts.googleapis.com/v1/token",
        service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccount}:generateAccessToken`,
        subject_token_supplier: {
          getSubjectToken: () => getVercelOidcToken({ audience: `https://iam.googleapis.com/${config.resource}` }),
        },
      });
      if (!cachedFederatedAuth) throw new Error("gemini_federation_invalid");
      cachedFederatedAuth.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
    }
    client = cachedFederatedAuth;
  }
  const access = await client.getAccessToken();
  if (!access?.token) throw new Error("gemini_auth_failed");
  return access.token;
}

async function enableAgentPlatform(token, fetchImpl) {
  const project = quotaProjectId();
  if (!project) return false;
  const response = await fetchImpl(`https://serviceusage.googleapis.com/v1/projects/${project}/services/aiplatform.googleapis.com:enable`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    return false;
  }
  return true;
}

export function geminiSpeechDirection(language, performance, region, expression) {
  if (expression?.segments?.length) {
    const accent = language === "en" ? "Use the selected natural English voice. " : accentHint(language, region) + " ";
    const hasSpeech = expression.segments.some((part) => part.kind !== "reaction");
    if (expression.reactions?.length === 1) {
      const event = expression.reactions[0];
      if (hasSpeech && /^(?:cry|sob)$/.test(event.event)) {
        return accent + "The speaker is deeply distressed and actively crying with tears. Start with audible involuntary sobbing, then speak the exact supplied words through tears. Interrupted breath and a breaking tearful voice. Not a sigh, panting, laughter or a relaxed groan. Do not pronounce bracketed cues or add any words.";
      }
      if (!hasSpeech) return accent + "Generate ONLY this short nonverbal vocal sound: " + event.direction +
        " The written vowels are a phonetic guide to this vocal reaction, not a sentence. Do not speak labels, directions, explanations or any invented dialogue. Stop after the sound.";
    }
    const delivery = expression.segments.filter((part) => part.kind !== "reaction" && part.performance !== "neutral").at(-1)?.performance || "neutral";
    const direction = {
      neutral: "Natural conversational delivery.", warm: "A subtle smile colors the voice; do not laugh.",
      surprised: "Natural surprise, without added interjections.", amused: "Lightly amused voice, without added laughter.",
      sad: "A tearful, trembling voice.", pain: "A voice strained with physical pain, without added interjections.",
      pleasure: "A soft pleased voice.", scream: "Forceful raised voice.", soft: "Speak quietly and softly.",
      angry: "A tense, angry voice.", afraid: "A frightened, trembling voice.", disgusted: "A voice expressing disgust.", tired: "A weary voice with low energy.",
    }[delivery] || "Natural conversational delivery.";
    return accent + direction + " Read only the supplied text, exactly once. Do not read these instructions, repeat phrases or invent words or sounds.";
  }
  const spanish = language !== "en";
  const mood = {
    neutral: spanish ? "Voz natural, expresiva y viva acorde con la escena." : "Natural, lively and expressive voice suited to the scene.",
    warm: spanish ? "Tono cálido, seductor y afectuoso con una sonrisa viva en la voz." : "Warm, affectionate and seductive tone with a living smile in the voice.",
    surprised: spanish ? "Tono de sorpresa real, alerta e intensa en el diálogo." : "Real, intense surprise in the dialogue.",
    amused: spanish ? "Risa viva, pícara y divertida." : "Lively, mischievous laughter.",
    sad: spanish ? "Voz quebrada y desgarrada por el llanto, sollozo real y tristeza sentida." : "Voice trembling with real crying, genuine sobs and deep sorrow.",
    pain: spanish ? "Voz y sonido con dolor físico real, quejido tenso y fuerza visceral." : "Voice and sound with real physical pain and visceral force.",
    pleasure: spanish ? "Voz cargada de placer intenso, gemido apasionado, respiración entrecortada y deseo ardiente." : "Voice charged with intense pleasure, passionate moaning, ragged breathing and ardent desire.",
    scream: spanish ? "Grito con fuerza, potencia vocal y energía desbordada." : "Loud scream with vocal power and overflowing energy.",
    soft: spanish ? "Susurro íntimo, sensual o en voz baja, muy cerca del oído." : "Intimate, sensual whisper close to the ear.",
  }[performance] || (spanish ? "Voz natural y expresiva." : "Natural, expressive voice.");
  return (spanish ? accentHint(language, region) + " Di exclusivamente las palabras del diálogo con voz humana, viva, emotiva y natural acorde a la escena. " :
    "Speak exclusively the dialogue with a natural, emotive, human voice suited to the scene. ") + mood +
    (spanish ? " No leas acotaciones de acción entre asteriscos ni nombres de sonidos. Entrega solo la voz hablada viva." : " Do not read stage directions or sound labels. Deliver only the living spoken voice.");
}

const BLOCK_NONE = 4;
const HARM = { hate: 1, dangerous: 2, harassment: 3, sexual: 4 };

export function geminiStreamPlan(text, preset, language, performance = "neutral", region = "mx", expression) {
  const voice = cloudGeminiVoiceFor(preset, language, region);
  return {
    streamingConfig: {
      voice: { languageCode: voice.languageCode, name: voice.name, modelName: voice.modelName },
      streamingAudioConfig: { audioEncoding: 7, sampleRateHertz: 24000 },
      advancedVoiceOptions: {
        safetySettings: {
          settings: [HARM.sexual, HARM.dangerous, HARM.harassment, HARM.hate].map((category) => ({
            category, threshold: BLOCK_NONE,
          })),
        },
      },
    },
    input: { text, prompt: geminiSpeechDirection(language, performance, region, expression) },
  };
}

export function geminiStreamBody(text, preset, language, performance = "neutral", region = "mx", expression) {
  const voice = cloudGeminiVoiceFor(preset, language, region);
  const prompt = geminiSpeechDirection(language, performance, region, expression);
  return {
    contents: {
      role: "user",
      parts: { text: `${prompt}: ${text}` },
    },
    generation_config: {
      speech_config: {
        language_code: voice.languageCode,
        voice_config: {
          prebuilt_voice_config: { voice_name: voice.name },
        },
      },
    },
    safety_settings: [
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_DANGEROUS_CONTENT",
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_HATE_SPEECH",
    ].map((category) => ({ category, threshold: "BLOCK_NONE" })),
  };
}

export function geminiStreamUrl(projectId) {
  return `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/locations/global/publishers/google/models/${MODEL}:streamGenerateContent?alt=sse`;
}

/** PCM bytes from one SSE line, or null when the line has no audio. */
export function pcmFromSseLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  let event;
  try { event = JSON.parse(payload); } catch { return null; }
  const parts = event?.candidates?.[0]?.content?.parts;
  const list = Array.isArray(parts) ? parts : parts ? [parts] : [];
  const chunks = [];
  for (const part of list) {
    const data = part?.inlineData?.data || part?.inline_data?.data;
    if (typeof data !== "string" || !data) continue;
    const bytes = Buffer.from(data, "base64");
    if (bytes.length) chunks.push(bytes);
  }
  if (!chunks.length) return null;
  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
}

/**
 * HTTP audio stream for the same Gemini 2.5 Flash TTS voice.
 * The whole line goes in one request. onAudio runs only for real PCM.
 * A failure before the first sample returns ok:false so the caller can use unary synthesis.
 */
export async function streamGeminiSpeech(text, preset, language, { performance = "neutral", region = "mx", expression, tokenProvider = getCredentials, fetchImpl = fetch, onAudio = () => {}, firstAudioMs = 8000 } = {}) {
  const projectId = quotaProjectId();
  if (!projectId) return { ok: false, status: 0, detail: "missing_project" };
  const token = await tokenProvider();
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), firstAudioMs);
  const clearTimer = () => { clearTimeout(timer); timer = null; };
  let response;
  try {
    response = await fetchImpl(geminiStreamUrl(projectId), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "x-goog-user-project": projectId,
      },
      body: JSON.stringify(geminiStreamBody(text, preset, language, performance, region, expression)),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimer();
    return { ok: false, status: 0, detail: error?.name || "fetch_failed" };
  }
  if (!response?.ok || !response.body) {
    clearTimer();
    const detail = await response?.text?.().catch(() => "") || "";
    return { ok: false, status: response?.status || 0, detail: String(detail).replace(/\s+/g, " ").slice(0, 240) };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendingText = "";
  let pendingPcm = Buffer.alloc(0);
  let heard = false;
  const emit = (bytes) => {
    pendingPcm = Buffer.concat([pendingPcm, bytes]);
    const even = pendingPcm.length - (pendingPcm.length % 2);
    if (even < 2) return;
    const chunk = pendingPcm.subarray(0, even);
    pendingPcm = Buffer.from(pendingPcm.subarray(even));
    if (!heard) {
      heard = true;
      clearTimer();
      timer = setTimeout(() => controller.abort(), 50000);
    }
    onAudio(Buffer.from(chunk));
  };
  const consume = (block, flush) => {
    const lines = block.split(/\r?\n/);
    const rest = flush ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      const audio = pcmFromSseLine(line);
      if (audio) emit(audio);
    }
    if (flush && rest) {
      const audio = pcmFromSseLine(rest);
      if (audio) emit(audio);
    }
    return rest;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pendingText += decoder.decode(value, { stream: true });
      pendingText = consume(pendingText, false);
    }
    pendingText += decoder.decode();
    consume(pendingText, true);
  } catch (error) {
    clearTimer();
    if (heard) return { ok: true, partial: true, detail: error?.name || "stream_closed" };
    return { ok: false, status: 0, detail: error?.name || "stream_failed" };
  } finally {
    clearTimer();
    reader.releaseLock?.();
  }
  if (!heard) return { ok: false, status: 200, detail: "no_audio" };
  return { ok: true };
}

export async function synthesizeGemini(text, preset, language, { performance = "neutral", region = "mx", expression, tokenProvider = getCredentials, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const token = await tokenProvider();
  const projectId = quotaProjectId();
  const prompt = geminiSpeechDirection(language, performance, region, expression);
  const isPureVocalReaction = expression?.reactions?.length === 1 && !expression.segments?.some((part) => part.kind !== "reaction");
  const speakingRate = isPureVocalReaction ? 1.0 : 1.18;
  const request = (voice, relaxSafety) => fetchImpl("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(projectId ? { "x-goog-user-project": projectId } : {}),
    },
    body: JSON.stringify({
      input: { text, prompt },
      voice,
      audioConfig: { audioEncoding: "LINEAR16", speakingRate },
      ...(relaxSafety ? {
        advancedVoiceOptions: {
          safetySettings: {
            settings: [
              "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              "HARM_CATEGORY_DANGEROUS_CONTENT",
              "HARM_CATEGORY_HARASSMENT",
              "HARM_CATEGORY_HATE_SPEECH",
            ].map((category) => ({ category, threshold: "BLOCK_NONE" })),
          },
        },
      } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  const speaker = previewVoice(preset);
  const attempt = async () => {
    let failure = { status: 502, detail: "" };
    for (const languageCode of [cloudGeminiVoiceFor(preset, language, region).languageCode]) {
      for (const relaxSafety of [true, false]) {
        const response = await request({
          languageCode,
          name: speaker,
          modelName: MODEL,
          model_name: MODEL,
        }, relaxSafety);
        if (response.ok) {
          const payload = await response.json();
          if (typeof payload.audioContent !== "string") throw new Error("gemini_no_audio");
          return { status: 200, pcm: decodeLinear16(payload.audioContent) };
        }
        failure = {
          status: response.status,
          detail: (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 240),
        };
        if (![400, 404].includes(response.status)) return failure;
      }
    }
    return failure;
  };
  let result = await attempt();
  if (result.status === 403 && agentPlatformDisabled(result.detail) && await enableAgentPlatform(token, fetchImpl)) {
    await sleep(5000);
    result = await attempt();
  }
  return result;
}

export function splitSentences(text) {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^.!?…]+[.!?…]+["'»”)]*(?:\s+|$)|[^.!?…]+$/gu) || [trimmed];
  const chunks = [];
  let current = "";
  for (const part of matches) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;
    if (!current) {
      current = trimmedPart;
    } else if (current.length < 25 || current.split(/\s+/).length < 4) {
      current += " " + trimmedPart;
    } else {
      chunks.push(current);
      current = trimmedPart;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [trimmed];
}

