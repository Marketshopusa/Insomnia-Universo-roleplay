import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {webcrypto} from "node:crypto";
import {TextEncoder} from "node:util";
const mock=vi.hoisted(()=>({invoke:vi.fn(),getSession:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:mock.getSession},functions:{invoke:mock.invoke}}}));
import {invokeFunctionWithRetry} from "./invokeFunction";
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("TextEncoder",TextEncoder);
 mock.getSession.mockResolvedValue({data:{session:{user:{id:"qa-owner"}}}});
 vi.spyOn(window,"setTimeout").mockImplementation(((callback:()=>void)=>{queueMicrotask(callback);return 0;}) as typeof window.setTimeout);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it("SFW story chat uses the live local queue and preserves the SFW flag",async()=>{
 mock.invoke.mockResolvedValueOnce({data:{jobId:"sfw-job"},error:null})
 .mockResolvedValueOnce({data:{status:"completed",content:"Gracias por recibirme."},error:null});
 const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 const result=await invokeFunctionWithRetry("story-chat",{adultMode:false,story:{id:"qa-story"},userMessage:"Hola, ¿cómo estuvo tu día?"});
 expect(result.error).toBeNull();
 expect(mock.invoke.mock.calls[0][1].body.adultMode).toBe(false);
 expect(fetchMock).not.toHaveBeenCalled();
});
it("changing to SFW does not reuse an adult job left pending by a connection error",async()=>{
 mock.invoke.mockImplementation(async(_name,args)=>{
  if(args.body.action==="create")return {data:{jobId:args.body.adultMode?"adult-job":"sfw-job"},error:null};
  if(args.body.jobId==="adult-job")return {data:null,error:{context:new Response(null,{status:503})}};
  return {data:{status:"completed",content:"Una respuesta cotidiana."},error:null};
 });
 const body={story:{id:"qa-story"},userMessage:"Hola."};
 const pending=await invokeFunctionWithRetry<{error:string}>("story-chat",{...body,adultMode:true});
 expect(pending.data?.error).toBe("chat_status_unavailable");
 const result=await invokeFunctionWithRetry("story-chat",{...body,adultMode:false});
 expect(result.error).toBeNull();
 expect(mock.invoke.mock.calls.filter(([,args])=>args.body.action==="create")).toHaveLength(2);
});
