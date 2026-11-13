import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { expect, it, vi } from "vitest";
vi.mock("@/components/layout/MainLayout",()=>({MainLayout:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock("@/contexts/LanguageContext",()=>({useLanguage:()=>({t:(key:string)=>key})}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock("@/lib/auth",()=>({signIn:vi.fn(async()=>({error:null}))}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{}}}));
import Login from "./Login";
it.each([["/profile","Perfil abierto"],["//outside.invalid","Inicio abierto"]])("sign-in returns safely to %s",async(returnTo,expected)=>{
  render(<MemoryRouter initialEntries={["/login?returnTo="+encodeURIComponent(returnTo)]}><Routes><Route path="/login" element={<Login/>}/><Route path="/profile" element={<p>Perfil abierto</p>}/><Route path="/" element={<p>Inicio abierto</p>}/></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("auth.email"),{target:{value:"profile@example.invalid"}});
  fireEvent.change(screen.getByLabelText("auth.password"),{target:{value:"synthetic-test-password"}});
  fireEvent.click(screen.getByRole("button",{name:"auth.signIn"}));
  await screen.findByText(expected);
});
