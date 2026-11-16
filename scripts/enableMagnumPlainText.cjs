const fs=require('node:fs'),path=require('node:path');
const worker=path.join(process.env.LOCALAPPDATA,'Insomnia/MagnumConversation/scripts/magnumConversationWorker.mjs');
let source=fs.readFileSync(worker,'utf8');const original=source;
if(source.includes('request.plainText === true')){console.log('Plain-text transport already enabled');process.exit(0)}
const old="const language = request.language === 'en' ? 'Write every JSON value in English.' : 'Escribe todos los valores del JSON en español nativo, nunca en inglés.';";
if(!source.includes(old))throw Error('Unexpected worker language block');
source=source.replace(old,"const language = request.plainText === true ? (request.language === 'en' ? 'Reply in English.' : 'Responde en español nativo.') : (request.language === 'en' ? 'Write every JSON value in English.' : 'Escribe todos los valores del JSON en español nativo, nunca en inglés.');");
const format="response_format: { type: 'json_object', schema: magnumReplySchema(request.brief === true, request.language) },";
if(!source.includes(format))throw Error('Unexpected worker reply-format block');
source=source.replace(format,"...(request.plainText === true ? {} : { response_format: { type: 'json_object', schema: magnumReplySchema(request.brief === true, request.language) } }),");
const policy=s=>s.split(/\r?\n/).find(line=>line.includes('const serviceRules ='));
if(policy(source)!==policy(original))throw Error('Worker policy must remain unchanged');
fs.writeFileSync(worker+'.before-plain-text',original);fs.writeFileSync(worker,source);console.log(JSON.stringify({plainTextTransport:true,workerPolicyUnchanged:true}));
