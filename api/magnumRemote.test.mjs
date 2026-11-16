import test from 'node:test';
import assert from 'node:assert/strict';
import { generateConnectedMagnum } from './_magnumRemote.mjs';
const reply = { model: 'magnum-v4-12b', content: JSON.stringify({ narracion: 'Dejo el libro sobre la mesa.', dialogo: 'Ya está preparado para que lo consultes.' }) };
test('uses the encrypted worker request and preserves the generated reaction and dialogue', async () => {
  const messages=[{role:'system',content:'Bibliotecaria.'},{role:'user',content:'Deja el libro sobre la mesa.'}];let sent;
  const result=await generateConnectedMagnum(messages,{},async (payload)=>{sent=payload;return reply});
  assert.ok(sent.messages[0].content.startsWith(messages[0].content));assert.deepEqual(sent.messages.slice(1),messages.slice(1));assert.equal(sent.kind,'generate');assert.equal(sent.maxTokens,600);
  assert.equal(result.content,'*Dejo el libro sobre la mesa.* Ya está preparado para que lo consultes.');
  assert.deepEqual(result.engine,{profile:'magnum-v4-local',model:'magnum-v4-12b',provider:'local-pc',fallback:false});
});
test('rejects a response from another model instead of silently substituting it',async()=>{
  await assert.rejects(generateConnectedMagnum([],{},async()=>({...reply,model:'another-model'})),{code:'magnum_model_mismatch'});
});
test('does not manufacture missing structured components',async()=>{
  await assert.rejects(generateConnectedMagnum([],{},async()=>({...reply,content:'{"dialogo":"Only dialogue"}'})),{code:'magnum_generation_incomplete'});
});
test('preserves transport failures without a fallback provider',async()=>{
  let attempts=0;const failure=Object.assign(new Error('Worker offline'),{code:'magnum_offline'});
  await assert.rejects(generateConnectedMagnum([],{},async()=>{attempts++;throw failure}),{code:'magnum_offline'});assert.equal(attempts,1);
});
test('keeps the existing repetition and scene checks',async()=>{
  await assert.rejects(generateConnectedMagnum([],{isRepeated:()=>true},async()=>reply),{code:'off_role'});
});
test('bounds long conversations to the worker packet and starts with a real user turn',async()=>{
  const history=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'á'.repeat(1800)}));let sent;
  await generateConnectedMagnum([{role:'system',content:'Sistema.'},...history,{role:'user',content:'Mensaje actual.'}],{},async payload=>{sent=payload;return reply});
  assert.equal(sent.messages[1].role,'user');assert.equal(sent.messages.at(-1).content,'Mensaje actual.');assert.ok(Buffer.byteLength(JSON.stringify(sent.messages))<=65000);
});

test('preserves a generated first-person gesture and spoken dialogue without rewriting either speaker', async () => {
  const generated = { gesto: 'Me despierto y me froto los ojos.', dialogo: 'Willian, me quedé dormida esperándote. ¿Por qué llegas tan tarde?' };
  const result = await generateConnectedMagnum([{ role: 'system', content: 'Una conversación cotidiana.' }, { role: 'user', content: 'Acabo de entrar y te veo dormida.' }], { characterRole: 'Sasha', playerRole: 'Willian' }, async () => ({ model: 'magnum-v4-12b', content: JSON.stringify(generated) }));
  assert.equal(result.content, `*${generated.gesto}* ${generated.dialogo}`);
});

test('regenerates an off-role draft with the same model before returning it', async () => {
  let attempts = 0;
  const result = await generateConnectedMagnum([{role:'user',content:'Te encuentro dormida en el sofá.'}], {validate:text=>!text.includes('¡Sasha!')}, async () => {
    attempts++;
    return {model:'magnum-v4-12b',content:JSON.stringify(attempts===1 ? {gesto:'Entro en casa.',dialogo:'¡Sasha! Me has dado un susto.'} : {gesto:'Me despierto en el sofá.',dialogo:'Willian, estaba esperándote.'})};
  });
  assert.equal(attempts,2);
  assert.equal(result.content,'*Me despierto en el sofá.* Willian, estaba esperándote.');
  assert.equal(result.engine.model,'magnum-v4-12b');
  assert.equal(result.engine.generationAttempts,2);
});
