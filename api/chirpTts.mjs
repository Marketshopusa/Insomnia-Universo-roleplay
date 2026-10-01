import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

const aliases = {
  "scarlett-hd": "Aoede",
  "luna-sweet": "Leda",
  "aria-calm": "Kore",
  "max-deep": "Charon",
  "leo-warm": "Puck",
};
let cachedAuth;
let cachedFederatedAuth;

function federationConfig() {
  const { GCP_PROJECT_NUMBER: projectNumber, GCP_SERVICE_ACCOUNT_EMAIL: serviceAccount,
    GCP_WORKLOAD_IDENTITY_POOL_ID: poolId, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: providerId } = process.env;
  if (![projectNumber, serviceAccount, poolId, providerId].every(Boolean)) return null;
  const resource = `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  return { serviceAccount, resource };
}

export function cloudVoiceFor(preset, language) {
  const locale = language === "en" ? "en-US" : "es-US";
  return { languageCode: locale, name: `${locale}-Chirp3-HD-${aliases[preset] || "Kore"}` };
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

export async function synthesizeChirp(text, preset, language, { tokenProvider = getCredentials, fetchImpl = fetch } = {}) {
  const token = await tokenProvider();
  const response = await fetchImpl("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: cloudVoiceFor(preset, language),
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
    }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) return { status: response.status };
  const payload = await response.json();
  if (typeof payload.audioContent !== "string") throw new Error("chirp_no_audio");
  return { status: 200, pcm: decodeWavPcm(payload.audioContent) };
}
