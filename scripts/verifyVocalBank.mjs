import { synthesizeGemini, getGeminiAccessToken, quotaProjectId } from "../api/geminiTts.mjs";
import { prepareExpressiveSpeech } from "../src/lib/expressiveSpeech.mjs";
import bank from "../src/lib/vocalSamples/Aoede_es.json" with { type: "json" };
import { writeFileSync,mkdirSync } from "node:fs";
const token = await getGeminiAccessToken();
const wavFor = (pcm) => {
 const wav=Buffer.alloc(44+pcm.length);wav.write("RIFF");wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);return wav;
};
mkdirSync("dist/verification",{recursive:true});
const chunks=[],timeline=[];let at=0;
for (const [event, base64] of Object.entries(bank.clips)) {
 const pcm=Buffer.from(base64,"base64");timeline.push({event,start:at,end:at+pcm.length/48000});chunks.push(pcm,Buffer.alloc(48000));at+=pcm.length/48000+1;
}
const wav=wavFor(Buffer.concat(chunks));
writeFileSync("dist/verification/vocal-bank.wav",wav);console.log("VOCAL_BANK_TIMELINE "+JSON.stringify(timeline));
const response=await fetch("https://aiplatform.googleapis.com/v1/projects/"+encodeURIComponent(quotaProjectId())+"/locations/global/publishers/google/models/gemini-3.5-flash:generateContent",{
 method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","x-goog-user-project":quotaProjectId()},
 body:JSON.stringify({contents:[{role:"user",parts:[{inlineData:{mimeType:"audio/wav",data:wav.toString("base64")}},{text:'Describe ONLY the audible sounds in each separate clip; clips are separated by one second of silence. Do not guess intended sounds. Return JSON with clips each having start_seconds,end_seconds,kind,description,confidence and exact audible words if any. Distinguish actual crying/sobbing from panting or laughter and real laughter from spoken ha ha. Kind values scream,sob,cry,sigh,laugh,grunt,groan,pant,gasp,throat_clear,other. Report any actual words honestly.'}]}],generationConfig:{audioTimestamp:true,temperature:0,responseMimeType:"application/json",maxOutputTokens:3000}}),signal:AbortSignal.timeout(40000)
});
if(!response.ok)throw new Error("bank_review_"+response.status);
const data=await response.json();const content=data.candidates?.[0]?.content?.parts?.filter(x=>typeof x.text==="string").map(x=>x.text).join("")||"";
console.log("VOCAL_BANK_REVIEW "+content);writeFileSync("dist/verification/vocal-bank-review.json",content);

const review=JSON.parse(content);
const actual=Array.isArray(review)?review:review.clips;
const expected=[["scream"],["sob","cry"],["sigh"],["laugh"],["pant"],["gasp"],["throat_clear"],["grunt","groan"],["groan","grunt"]];
const allowed=/^(?:ah|aaah|aah|ha|huh|uh|ugh|hm|hmm|ehm|ejem|uff|rrgh|urrgh)*$/;
const passed=actual?.length===expected.length && actual.every((clip,i)=>{
 const words=String(clip.words||clip.exact_audible_words||clip.speech||"").toLowerCase().replace(/[^a-z]/g,"");
 return expected[i].includes(clip.kind)&&clip.confidence>=0.7&&allowed.test(words);
});
console.log("VOCAL_BANK_CHECK "+(passed?"automated_pass":"automated_failed"));
if(!passed)throw new Error("vocal_bank_review_failed");
