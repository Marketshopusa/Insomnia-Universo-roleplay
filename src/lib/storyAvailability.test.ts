import {it,expect} from "vitest";
import {deriveStoryFacts,relevantStoryFacts} from "./storyContext.mjs";
const past=[{role:"user",content:"Dejo la brújula violeta dentro del cajón verde."}];
const latest="*Abro el cajón verde y saco la brújula violeta. Ahora la sostengo en mi mano.* ¿Quién tiene la brújula ahora?";
it("extracts present-tense placement with contracted del",()=>{
 expect(relevantStoryFacts(past,"¿Dónde está la brújula violeta?")).toMatchObject([{kind:"location",object:"la brújula violeta",value:"dentro del cajón verde"}]);
});
it("replaces stale location with explicit current user possession",()=>{
 const facts=relevantStoryFacts(past,latest);
 expect(facts.some(f=>f.kind==="location")).toBe(false);
 expect(facts.find(f=>f.kind==="holder")).toMatchObject({object:"la brújula violeta",value:"user",role:"user"});
});
it("does not guess possession from a negation, hypothetical or ambiguous pronoun",()=>{
 for(const text of ["No la sostengo en mi mano.","Si la sostengo en mi mano.","Tal vez la sostengo en mi mano."]){
  expect(deriveStoryFacts([...past,{role:"user",content:"La brújula violeta. "+text}]).some(f=>f.kind==="holder")).toBe(false);
 }
 const two=[...past,{role:"user",content:"Dejo la llave roja en la mesa."},{role:"user",content:"La brújula violeta y la llave roja. Ahora la sostengo en mi mano."}];
 expect(deriveStoryFacts(two).some(f=>f.kind==="holder")).toBe(false);
});
it("does not let an assistant guess overwrite explicit user possession",()=>{
 const facts=deriveStoryFacts([...past,{role:"user",content:latest},{role:"assistant",content:"La brújula violeta está en el cajón azul."}]);
 expect(facts.find(f=>f.kind==="holder")?.value).toBe("user");
 expect(facts.some(f=>f.kind==="location" && /brújula/.test(f.object))).toBe(false);
});
it("a later user placement supersedes their earlier possession",()=>{
 const facts=deriveStoryFacts([...past,{role:"user",content:latest},{role:"user",content:"Pongo la brújula violeta en la mesa azul."}]);
 expect(facts.some(f=>f.kind==="holder")).toBe(false);
 expect(facts.find(f=>f.kind==="location")?.value).toBe("en la mesa azul");
});
