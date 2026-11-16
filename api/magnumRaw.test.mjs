import test from 'node:test';
import assert from 'node:assert/strict';
import {magnumRawResponse} from './_magnumRaw.mjs';
test('transports original role text and returns the real model output without JSON rewriting',async()=>{
 const messages=[{role:'system',content:'Eres Ana, bibliotecaria.'},{role:'user',content:'Busco un documento.'}];let sent,engine;
 const r=await magnumRawResponse(messages,{onEngine:e=>engine=e},async p=>{sent=p;return {model:'magnum-v4-12b',content:'*Levanto la mirada.* ¿Conoces el nombre del edificio?'}});
 assert.deepEqual(sent.messages,messages);assert.equal(sent.plainText,true);
 assert.equal((await r.json()).choices[0].message.content,'*Levanto la mirada.* ¿Conoces el nombre del edificio?');
 assert.equal(engine.model,'magnum-v4-12b');assert.equal(engine.fallback,false);
});
test('does not substitute another model or manufacture an outage reply',async()=>{
 await assert.rejects(magnumRawResponse([],{},async()=>({model:'another-model',content:'Text'})),{code:'magnum_invalid_reply'});
 const failure=Object.assign(new Error('Offline'),{code:'magnum_offline'});let attempts=0;
 await assert.rejects(magnumRawResponse([],{},async()=>{attempts++;throw failure}),{code:'magnum_offline'});assert.equal(attempts,1);
});
