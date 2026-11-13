import test from "node:test";
import assert from "node:assert/strict";
import { authenticationFailure } from "./_auth.mjs";
import handler, { transcribeAudio } from "./ai.mjs";
const environment = { NODE_ENV: "production", VERCEL: "1" };
const request = { headers: { authorization: "Bearer session-token" } };
const clientFactory = (result) => () => ({ auth: { getUser: async () => result } });

test("a valid session is verified by Supabase, not a client-side role flag", async () => {
  let received;
  const result = await authenticationFailure(request, { environment, clientFactory: () => ({ auth: { getUser: async (token) => {
    received = token; return { data: { user: { id: "test-user" } }, error: null };
  } } }) });
  assert.equal(result, null); assert.equal(received, "session-token");
});
test("missing and rejected tokens remain unauthorized", async () => {
  assert.equal((await authenticationFailure({ headers: {} }, { environment })).status, 401);
  const result = await authenticationFailure(request, { environment, clientFactory: clientFactory({ data: { user: null }, error: { status: 403 } }) });
  assert.equal(result.status, 401); assert.equal(result.error, "login_required");
});
test("auth outages are 503, never a false instruction to log in", async () => {
  const result = await authenticationFailure(request, { environment, clientFactory: clientFactory({ data: { user: null }, error: { status: 503 } }) });
  assert.equal(result.status, 503); assert.equal(result.error, "auth_unavailable");
  assert.equal((await authenticationFailure(request, { environment, clientFactory: () => { throw new TypeError("network failed"); } })).status, 503);
});
test("production transcription rejects missing authentication before using a provider", async () => {
  const saved = process.env.VERCEL; process.env.VERCEL = "1";
  try {
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method: "POST", headers: {}, body: { action: "speech-to-text", body: { audio: "test" } } }, res);
    assert.equal(res.code, 401); assert.equal(res.data.error, "login_required");
  } finally { if (saved === undefined) delete process.env.VERCEL; else process.env.VERCEL = saved; }
});

test("transcription uses the configured cloud identity when an API key is absent", async () => {
  const names = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GCP_PROJECT_NUMBER", "GCP_SERVICE_ACCOUNT_EMAIL", "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID", "GCP_PROJECT_ID"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_API_KEY;
    Object.assign(process.env, { GCP_PROJECT_NUMBER: "123", GCP_SERVICE_ACCOUNT_EMAIL: "test@test-project.iam.gserviceaccount.com", GCP_WORKLOAD_IDENTITY_POOL_ID: "test", GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "test", GCP_PROJECT_ID: "test-project" });
    let calls = 0;
    const result = await transcribeAudio({ audio: Buffer.alloc(4096).toString("base64"), mimeType: "audio/wav", language: "es" }, {
      tokenProvider: async () => "cloud-test-token",
      fetchImpl: async (url, init) => {
        calls += 1;
        assert.match(String(url), /aiplatform.googleapis.com/);
        assert.equal(init.headers.Authorization, "Bearer cloud-test-token");
        assert.equal(init.headers["x-goog-api-key"], undefined);
        return Response.json({ candidates: [{ content: { parts: [{ text: "Hola, esta es una prueba de llamada." }] } }] });
      },
    });
    assert.equal(result.text, "Hola, esta es una prueba de llamada."); assert.equal(calls, 1);
  } finally { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } }
});
