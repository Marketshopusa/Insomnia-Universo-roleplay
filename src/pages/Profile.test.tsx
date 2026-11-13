import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as any, stored: null as any, getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "es" }) }));
vi.mock("@/components/layout/MainLayout", () => ({ MainLayout: ({children}: {children: React.ReactNode}) => <div>{children}</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: state.getUser, updateUser: state.updateUser } } }));
import Profile from "./Profile";
function LoginDestination() { const location=useLocation(); return <p>Login: {location.search}</p>; }
function Harness() { return <MemoryRouter initialEntries={["/profile?returnTo=%2Fstory%2Fdemo"]}><Routes><Route path="/profile" element={<Profile />} /><Route path="/login" element={<LoginDestination />} /></Routes></MemoryRouter>; }
beforeEach(() => {
  state.stored = { id: "test-owner", email: "profile@example.invalid", user_metadata: { username: "Cuenta de prueba" } };
  state.user = state.stored;
  state.getUser.mockReset().mockImplementation(async () => ({ data: { user: state.stored }, error: null }));
  state.updateUser.mockReset().mockImplementation(async ({data}) => {
    state.stored = { ...state.stored, user_metadata: { ...state.stored.user_metadata, ...data } };
    return { data: { user: state.stored }, error: null };
  });
});
it("saves the birth date, confirms persistence and reloads the saved value", async () => {
  const view = render(<Harness />);
  const date = await screen.findByLabelText("Fecha de nacimiento");
  expect(date).toHaveValue("");
  fireEvent.change(date, { target: { value: "1990-06-15" } });
  fireEvent.click(screen.getByRole("button", {name:"Guardar cambios"}));
  await screen.findByText("Datos guardados. Tu próxima solicitud utilizará la fecha actualizada.");
  expect(state.updateUser).toHaveBeenCalledWith({ data: { username: "Cuenta de prueba", birth_date: "1990-06-15" } });
  expect(screen.getByRole("link", {name:"Continuar"})).toHaveAttribute("href", "/story/demo");
  expect(screen.getByLabelText("Correo de la cuenta")).toHaveAttribute("readonly");
  view.unmount();
  render(<Harness />);
  expect(await screen.findByLabelText("Fecha de nacimiento")).toHaveValue("1990-06-15");
});
it("shows a save error without losing the date or claiming it was saved", async () => {
  state.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "Error de red de prueba." } });
  render(<Harness />);
  fireEvent.change(await screen.findByLabelText("Fecha de nacimiento"), { target: { value: "1990-06-15" } });
  fireEvent.click(screen.getByRole("button", {name:"Guardar cambios"}));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Error de red de prueba.");
  expect(screen.getByLabelText("Fecha de nacimiento")).toHaveValue("1990-06-15");
  expect(screen.queryByRole("link", {name:"Continuar"})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name:"Guardar cambios"})).not.toBeDisabled();
});
it("redirects a signed-out account to login and retains the profile destination", async () => {
  state.user = null;
  render(<Harness />);
  expect(await screen.findByText(/Login:/)).toHaveTextContent("returnTo=%2Fprofile");
  expect(state.updateUser).not.toHaveBeenCalled();
});
it("offers a retry after a failed profile lookup", async () => {
  state.getUser.mockRejectedValueOnce(new Error("temporary outage"));
  render(<Harness />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", {name:"Reintentar"}));
  await screen.findByLabelText("Fecha de nacimiento");
});
it("an account switch does not expose or save the previous account's pending data", async () => {
  let release!: (value:any) => void;
  const pending = new Promise(resolve => {release=resolve;});
  const view = render(<Harness />);
  fireEvent.change(await screen.findByLabelText("Fecha de nacimiento"), {target:{value:"1990-06-15"}});
  state.getUser.mockReturnValueOnce(pending);
  fireEvent.click(screen.getByRole("button", {name:"Guardar cambios"}));
  await waitFor(() => expect(state.getUser).toHaveBeenCalledTimes(2));
  const first = state.user;
  state.stored = {id:"second-owner",email:"second@example.invalid",user_metadata:{username:"Segunda cuenta"}};
  state.user = state.stored;
  view.rerender(<Harness />);
  await screen.findByDisplayValue("Segunda cuenta");
  await act(async () => release({data:{user:first},error:null}));
  expect(state.updateUser).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Correo de la cuenta")).toHaveValue("second@example.invalid");
  expect(screen.getByLabelText("Fecha de nacimiento")).toHaveValue("");
  view.unmount();
});
