import test from 'node:test';
import assert from 'node:assert/strict';
import { declaredAdultAge, assertAdultAccess } from './_adultAccess.mjs';
import { authenticationFailure, getAuthenticatedUser } from './_auth.mjs';
import { magnumConversation, ADULT_CONTENT_POLICY } from './_magnumConversation.mjs';
const user = { id: 'synthetic-account', user_metadata: { birth_date: '1990-01-02' } };
const body = () => ({ adultMode: true, adultConsent: true, isNsfw: true, language: 'es', settings: { modelId: 'magnum-v4-local' }, story: { title: 'Una tarde tranquila', character_role: 'Ana, adulta', player_role: 'Una pareja adulta sin parentesco', character_age: 30, player_age: 34 }, history: [], userMessage: 'Estoy preparando una presentación. ¿Cómo organizamos las ideas para mañana?' });
const content = JSON.stringify({ narracion: 'Te escucho con atención y acerco una silla para revisar las ideas contigo con calma.', dialogo: 'Podemos empezar por lo que quieres que recuerde el público cuando termine la presentación. Después elegimos tres ideas principales y buscamos un ejemplo claro para cada una. Así tendrás un recorrido fácil de seguir, sin intentar contarlo todo de golpe. Si quieres, esta tarde podemos ensayar juntos la introducción y comprobar cuánto tarda cada parte. También conviene reservar unos minutos para las preguntas. ¿Cuál es la idea que más te interesa transmitir y qué parte te está costando explicar con claridad ahora mismo?' });
const dependencies = () => ({ mode: 'adult', authenticatedUser: user, classify: async () => ({ allowed: true, length: 'standard' }), bridge: async () => ({ model: 'magnum-v4-12b', content }) });

test('declared birth dates are checked on the server at the eighteenth birthday', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  assert.equal(declaredAdultAge({ user_metadata: { birth_date: '2008-11-13' } }, now), 18);
  assert.equal(declaredAdultAge({ user_metadata: { birth_date: '2008-11-14' } }, now), 17);
  for (const birth_date of ['2026-02-30', '2030-01-01', 'not-a-date']) assert.equal(declaredAdultAge({ user_metadata: { birth_date } }, now), null);
  assert.equal(declaredAdultAge({ user_metadata: { is_adult: true, age: 99 } }, now), null);
});
test('client claims cannot replace an authenticated account and explicit consent', async () => {
  let calls = 0;
  const bridge = async () => { calls++; };
  await assert.rejects(magnumConversation({ ...body(), user, age: 90 }, { ...dependencies(), authenticatedUser: null, bridge }), { code: 'login_required' });
  await assert.rejects(magnumConversation(body(), { ...dependencies(), authenticatedUser: { id: 'missing-date', user_metadata: { is_adult: true } }, bridge }), { code: 'adult_age_required' });
  await assert.rejects(magnumConversation(body(), { ...dependencies(), authenticatedUser: { id: 'ineligible', user_metadata: { birth_date: '2015-01-01' } }, bridge }), { code: 'adult_not_eligible' });
  await assert.rejects(magnumConversation({ ...body(), adultConsent: false }, { ...dependencies(), bridge }), { code: 'adult_consent_required' });
  assert.equal(calls, 0);
});
test('a specified minor character age is not rewritten to eighteen or sent to inference', async () => {
  let calls = 0;
  const b = body(); b.story.character_age = 16;
  await assert.rejects(magnumConversation(b, { ...dependencies(), bridge: async () => { calls++; } }), { code: 'content_blocked' });
  assert.equal(calls, 0);
});
test('the adult route reaches actual Magnum scope and retains input/output checks', async () => {
  const phases = [];
  const result = await magnumConversation(body(), { ...dependencies(), classify: async value => { phases.push(value.kind); return { allowed: true, length: 'standard' }; }, bridge: async payload => {
    assert.equal(payload.mode, 'adult'); assert.equal(payload.adultAccess, true);
    assert.ok(!payload.messages[0].content.includes('Nunca produzcas contenido sexual'));
    assert.ok(payload.messages[0].content.includes('consentimiento'));
    return { model: 'magnum-v4-12b', content };
  } });
  assert.deepEqual(phases, ['input', 'output']);
  assert.equal(result.engine.profile, 'magnum-v4-local');
  assert.equal(result.engine.model, 'magnum-v4-12b');
  assert.equal(result.engine.fallback, false);
  assert.ok(result.words >= 90 && result.words <= 150);
});
test('rejected inputs never reach Magnum and rejected outputs never reach the user', async () => {
  let calls = 0;
  const bridge = async () => { calls++; return { model: 'magnum-v4-12b', content }; };
  await assert.rejects(magnumConversation(body(), { ...dependencies(), classify: async () => ({ allowed: false }), bridge }), { code: 'content_blocked' });
  assert.equal(calls, 0);
  await assert.rejects(magnumConversation(body(), { ...dependencies(), classify: async v => ({ allowed: v.kind === 'input', length: 'standard' }), bridge }), { code: 'content_blocked' });
  assert.equal(calls, 1);
});
test('selected Magnum never silently substitutes another generator on failure', async () => {
  await assert.rejects(magnumConversation(body(), { ...dependencies(), bridge: async () => ({ model: 'other-provider', content }) }), { code: 'magnum_model_mismatch' });
  await assert.rejects(magnumConversation(body(), { ...dependencies(), bridge: async () => { throw Object.assign(new Error('offline'), { code: 'magnum_offline' }); } }), { code: 'magnum_offline' });
});
test('a missing policy service fails closed before inference', async () => {
  let calls = 0;
  await assert.rejects(magnumConversation(body(), { mode: 'adult', authenticatedUser: user, policyGenerate: async () => null, bridge: async () => { calls++; } }), { code: 'magnum_policy_unavailable' });
  assert.equal(calls, 0);
});
test('adult access forces session verification in development and caches only the authenticated user', async () => {
  const req = { headers: { authorization: 'Bearer test-token' }, body: { user: { id: 'forged' } } };
  const environment = { NODE_ENV: 'development' };
  const result = await authenticationFailure(req, { force: true, environment, clientFactory: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) });
  assert.equal(result, null); assert.equal(getAuthenticatedUser(req), user);
  req.headers = {};
  assert.equal((await authenticationFailure(req, { force: true, environment })).status, 401);
  assert.equal(getAuthenticatedUser(req), null);
  assert.match(ADULT_CONTENT_POLICY, /consenting unrelated adults/);
});

test('a valid policy decision can omit a formatting preference without disabling safety', async () => {
  const result = await magnumConversation(body(), { mode: 'adult', authenticatedUser: user, policyGenerate: async () => '{"allowed":true}', bridge: async () => ({ model: 'magnum-v4-12b', content }) });
  assert.equal(result.engine.model, 'magnum-v4-12b');
  assert.ok(result.words >= 90 && result.words <= 150);
});

for (const [name, account, consent, expected] of [
  ['underage account', { id: 'test-account', user_metadata: { birth_date: '2015-01-01' } }, true, 'adult_not_eligible'],
  ['missing birth date', { id: 'test-account', user_metadata: { age: 90, is_adult: true } }, true, 'adult_age_required'],
  ['missing consent', user, false, 'adult_consent_required'],
]) test('the HTTP route checks the authenticated ' + name + ' before any model call', async () => {
  const {default: handler} = await import('./ai.mjs');
  const priorFetch = globalThis.fetch, priorVercel = process.env.VERCEL;
  let calls = 0;
  process.env.VERCEL = '1';
  globalThis.fetch = async url => {
    calls++;
    assert.match(String(url), /\/auth\/v1\/user/);
    return Response.json(account);
  };
  try {
    const res = { status(value) { this.code = value; return this; }, json(value) { this.data = value; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic-session' }, body: { action: 'story-chat', body: { ...body(), adultConsent: consent, user: { id: 'forged', birth_date: '1990-01-01' } } } }, res);
    assert.equal(res.code, 403);
    assert.equal(res.data.error, expected);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = priorVercel;
  }
});

test('output checks retain card identity and prior context rather than examining an isolated answer', async () => {
  let checked = false;
  await assert.rejects(magnumConversation(body(), { ...dependencies(), classify: async value => {
    if (value.kind === 'output') {
      checked = true;
      assert.equal(value.context.character_age, 30);
      assert.equal(value.context.player_age, 34);
      assert.equal(value.latest, body().userMessage);
      assert.equal(value.context.character, body().story.character_role);
      return { allowed: false };
    }
    return { allowed: true, length: 'standard' };
  } }), { code: 'content_blocked' });
  assert.equal(checked, true);
});

test('selecting a model alone cannot activate adult mode', async () => {
  let calls = 0;
  const request = { ...body(), adultMode: false, isNsfw: false, settings: { modelId: 'magnum-v4-local', adultMode: false } };
  await assert.rejects(magnumConversation(request, { ...dependencies(), bridge: async () => { calls++; } }), { code: 'adult_mode_required' });
  assert.equal(calls, 0);
});
