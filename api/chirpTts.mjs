import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import { accentHint, chirpLocale, normalizeRegion } from "./regions.mjs";

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

export function cloudVoiceFor(preset, language, region) {
  const locale = chirpLocale(language, region);
  const name = previewVoice(preset);
  return { languageCode: locale, name: `${locale}-Chirp3-HD-${name}` };
}

export function cloudGeminiVoiceFor(preset, language, region) {
  const id = normalizeRegion(region);
  const locale = language === "en" ? "en-US" : id === "es" ? "es-ES" : id === "mx" ? "es-MX" : "es-419";
  return {
    languageCode: locale,
    name: previewVoice(preset),
    model_name: "gemini-2.5-flash-tts",
  };
}

function quotaProjectId() {
  const account = process.env.GCP_SERVICE_ACCOUNT_EMAIL || "";
  return process.env.GCP_PROJECT_ID || account.split("@")[1]?.replace(/\.iam\.gserviceaccount\.com$/, "");
}

export function removePerformanceCues(text) {
  return text.replace(/\[(?:laughing|sigh|uhm|short pause|medium pause|long pause|laughs|sighs|gasps|crying)\]/gi, "").replace(/\s+/g, " ").trim();
}

export function decodeWavPcm(base64) {
  const wav = Buffer.from(base64, "base64");
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("chirp_invalid_wav");
  }
  let formatOk = false;
  let audio = null;
  for (let position = 12; position + 8 <= wav.length;) {
    const chunk = wav.toString("ascii", position, position + 4);
    const length = wav.readUInt32LE(position + 4);
    const start = position + 8;
    if (start + length > wav.length) throw new Error("chirp_truncated_wav");
    if (chunk === "fmt ") {
      formatOk = length >= 16 && wav.readUInt16LE(start) === 1
        && wav.readUInt16LE(start + 2) === 1 && wav.readUInt32LE(start + 4) === 24000
        && wav.readUInt16LE(start + 14) === 16;
    }
    if (chunk === "data") audio = wav.subarray(start, start + length);
    position = start + length + (length % 2);
  }
  if (!formatOk || !audio?.length || audio.length % 2) throw new Error("chirp_invalid_pcm");
  return audio;
}

export function isChirpConfigured() {
  return Boolean(process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON || federationConfig());
}

async function getCredentials() {
  let client;
  if (process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON) {
    if (!cachedAuth) {
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON);
      if (credentials.type !== "service_account" || !credentials.client_email || !credentials.private_key) {
        throw new Error("chirp_credentials_invalid");
      }
      cachedAuth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    }
    client = await cachedAuth.getClient();
  } else {
    const config = federationConfig();
    if (!config) throw new Error("chirp_credentials_missing");
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
      if (!cachedFederatedAuth) throw new Error("chirp_federation_invalid");
      cachedFederatedAuth.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
    }
    client = cachedFederatedAuth;
  }
  const access = await client.getAccessToken();
  if (!access?.token) throw new Error("chirp_auth_failed");
  return access.token;
}

async function requestChirp(text, voice, tokenProvider, fetchImpl) {
  const token = await tokenProvider();
  const response = await fetchImpl("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice,
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) return { status: response.status };
  const payload = await response.json();
  if (typeof payload.audioContent !== "string") throw new Error("chirp_no_audio");
  return { status: 200, pcm: decodeWavPcm(payload.audioContent) };
}

export async function synthesizeChirp(text, preset, language, { region, tokenProvider = getCredentials, fetchImpl = fetch } = {}) {
  const voice = cloudVoiceFor(preset, language, region);
  const first = await requestChirp(text, voice, tokenProvider, fetchImpl);
  if (first.status === 200 || language === "en" || voice.languageCode === "es-US") return first;
  if (![400, 404].includes(first.status)) return first;
  const fallbackName = voice.name.slice(voice.name.lastIndexOf("-") + 1);
  return requestChirp(text, {
    languageCode: "es-US",
    name: `es-US-Chirp3-HD-${fallbackName}`,
  }, tokenProvider, fetchImpl);
}

export async function synthesizeCloudGemini(text, preset, language, { performance = "neutral", region = "mx", tokenProvider = getCredentials, fetchImpl = fetch } = {}) {
  const token = await tokenProvider();
  const projectId = quotaProjectId();
  const mood = (language === "en" ? {
    amused: "Let out a real short laugh. [laughing] is that sound, not a word.",
    sad: "The voice breaks and crying is audible. [crying] is that sound, not a word.",
    pain: "Pain is audible in the breath before the dialogue. Do not say the word pain.",
    pleasure: "A brief sound of pleasure comes before the dialogue. Do not say the word moan.",
    scream: "There is a jolt of fear or anger. [gasps] and [shouting] are sounds, not words.",
    soft: "Speak quietly, almost in a sigh. [sigh] is that sound, not a word.",
  } : {
    amused: "Suelta una risa breve de verdad. [laughing] es ese sonido, no una palabra.",
    sad: "La voz se quiebra y se oye el llanto. [crying] es ese sonido, no una palabra.",
    pain: "Se oye el dolor en la respiración antes del diálogo. No digas la palabra dolor.",
    pleasure: "Se oye un gemido breve de placer antes del diálogo. No digas la palabra gemido.",
    scream: "Hay un sobresalto de miedo o rabia. [gasps] y [shouting] son sonidos, no palabras.",
    soft: "Habla bajo, casi en un suspiro. [sigh] es ese sonido, no una palabra.",
  })[performance] || (language === "en"
    ? "Speak like a person inside the scene, with natural emotion."
    : "Habla como una persona en la escena, con emoción natural.");
  const accent = accentHint(language, region);
  const prompt = language === "en"
    ? `Read the narration and the dialogue aloud. [laughing], [crying], [gasps], [sigh] and [shouting] are sounds, not words. ${mood}`
    : `${accent} Lee en voz alta la narración y el diálogo, sin omitir la narración. ${mood}`;
  const request = (voice) => fetchImpl("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(projectId ? { "x-goog-user-project": projectId } : {}),
    },
    body: JSON.stringify({
      input: { text, prompt },
      voice,
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const voice = cloudGeminiVoiceFor(preset, language, region);
  let response = await request(voice);
  if (!response.ok && [400, 404].includes(response.status) && voice.languageCode !== "es-US" && language !== "en") {
    response = await request({ ...voice, languageCode: "es-US" });
  }
  if (!response.ok) return { status: response.status };
  const payload = await response.json();
  if (typeof payload.audioContent !== "string") throw new Error("cloud_gemini_no_audio");
  return { status: 200, pcm: decodeWavPcm(payload.audioContent) };
}
