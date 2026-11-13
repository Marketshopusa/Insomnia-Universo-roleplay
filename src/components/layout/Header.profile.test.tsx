import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({user:{id:"profile-owner"} as {id:string}|null}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:state.user,loading:false,isAdmin:false})}));
vi.mock("@/contexts/LanguageContext",()=>({useLanguage:()=>({language:"es",t:(key:string)=>key})}));
vi.mock("@/contexts/AdultModeContext",()=>({useAdultMode:()=>({enabled:false,consentGiven:false,enable:vi.fn(),disable:vi.fn(),grantConsent:vi.fn()})}));
vi.mock("@/components/adult/AdultConsentDialog",()=>({AdultConsentDialog:()=>null}));
vi.mock("@/components/story/MotherCardDialog",()=>({MotherCardDialog:()=>null}));
vi.mock("./LanguageSelector",()=>({LanguageSelector:()=>null}));
vi.mock("@/lib/auth",()=>({signOut:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{}}}));
import {Header} from "./Header";
beforeEach(()=>{state.user={id:"profile-owner"};});
it("keeps the profile link outside the collapsible navigation",()=>{
  render(<MemoryRouter initialEntries={["/story/demo"]}><Header/></MemoryRouter>);
  const link=screen.getByRole("link",{name:"Mi perfil"});
  expect(link).toHaveAttribute("href","/profile?returnTo=%2Fstory%2Fdemo");
  expect(link.closest("nav")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Open menu"}));
  expect(screen.getAllByRole("link",{name:"Mi perfil"})).toHaveLength(1);
});
it("does not expose an account editor link as a signed-out account",()=>{
  state.user=null;
  render(<MemoryRouter><Header/></MemoryRouter>);
  expect(screen.queryByRole("link",{name:"Mi perfil"})).not.toBeInTheDocument();
});
