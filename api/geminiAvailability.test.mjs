import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from './ai.mjs';
test('reports the model confirmed by Google instead of guessing from the requested name',async()=>{
  let resolved,url;
  const text=await generate('gemini-3.8-flash',[{text:'Hola'}],{maxOutputTokens:500},{apiKey:'unit-test-key',fallbackModels:[],onModelResolved:model=>{resolved=model},fetchImpl:async target=>{url=target;return new Response(JSON.stringify({modelVersion:'gemini-3.8-flash-001',candidates:[{content:{parts:[{text:'Hola. El libro está preparado.'}]},finishReason:'STOP'}]}),{status:200})}});
  assert.match(url,/models\/gemini-3\.8-flash:generateContent$/);assert.equal(text,'Hola. El libro está preparado.');assert.deepEqual(resolved,{requestedModel:'gemini-3.8-flash',model:'gemini-3.8-flash-001'});
});
