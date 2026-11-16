import {requestMagnum} from './_magnumBridge.mjs';
import {MAGNUM_MODEL} from './_magnumProtocol.mjs';

/** Carry the original plain-text prompt to the PC; retain the original caller's reply processing. */
export async function magnumRawResponse(messages, options = {}, request = requestMagnum) {
  const system = messages[0]?.role === 'system' ? [{role:'system',content:String(messages[0].content).slice(0,16000)}] : [];
  const turns = messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-26).map(m=>({role:m.role,content:String(m.content||'').slice(0,1800)}));
  const result = await request({kind:'generate',mode:'adult',approved:true,adultAccess:true,plainText:true,messages:[...system,...turns],language:options.language==='en'?'en':'es',call:options.call===true,maxTokens:Math.max(350,options.maxTokens||450),temperature:options.temperature??0.68},{timeoutMs:options.call?21000:42000});
  if(result.model!==MAGNUM_MODEL||typeof result.content!=='string'||!result.content.trim())throw Object.assign(new Error('Magnum no confirmó una respuesta válida.'),{code:'magnum_invalid_reply'});
  options.onEngine?.({profile:'magnum-v4-local',model:MAGNUM_MODEL,provider:'local-pc',fallback:false});
  return new Response(JSON.stringify({model:MAGNUM_MODEL,choices:[{message:{content:result.content}}]}),{status:200,headers:{'Content-Type':'application/json'}});
}
