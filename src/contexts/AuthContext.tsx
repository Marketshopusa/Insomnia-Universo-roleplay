import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_EMAILS = [
  "marketshopusafl@gmail.com"
];

export function isUserAdmin(user: User | null): boolean {
  if (user?.email) {
    const email = user.email.toLowerCase().trim();
    if (ADMIN_EMAILS.includes(email)) return true;
  }
  if (typeof window !== "undefined") {
    const forced = localStorage.getItem("insomnia_admin_mode");
    if (forced === "true") return true;
    const storedEmail = (localStorage.getItem("insomnia_user_email") || "").toLowerCase().trim();
    if (ADMIN_EMAILS.includes(storedEmail)) return true;
  }
  return false;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  credits: number;
  userRole: "admin" | "user";
  adminEmail: string;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  isPremium: false,
  credits: 100,
  userRole: "user",
  adminEmail: "marketshopusafl@gmail.com",
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const signedOutRef = useRef(false);

  useEffect(() => {
    const apply = (s: Session | null) => {
      setSession(s);
      const currentUser = s?.user ?? null;
      setUser(currentUser);
      if (currentUser?.email) {
        localStorage.setItem("insomnia_user_email", currentUser.email.toLowerCase().trim());
        if (ADMIN_EMAILS.includes(currentUser.email.toLowerCase().trim())) {
          localStorage.setItem("insomnia_admin_mode", "true");
        }
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (event === "SIGNED_OUT") {
          signedOutRef.current = true;
          apply(null);
          return;
        }
        if (s) {
          signedOutRef.current = false;
          apply(s);
        } else {
          // Transient null (e.g. background tab / refresh in flight): keep current state.
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session: s } }) => apply(s));

    // Mobile browsers suspend timers when the app goes to the background, so the
    // token refresh can be missed. Re-hydrate / refresh when coming back.
    const revive = async () => {
      if (document.visibilityState !== "visible" || signedOutRef.current) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        apply(data.session);
        return;
      }
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) apply(refreshed.session);
    };

    document.addEventListener("visibilitychange", revive);
    window.addEventListener("focus", revive);
    window.addEventListener("online", revive);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", revive);
      window.removeEventListener("focus", revive);
      window.removeEventListener("online", revive);
    };
  }, []);

  const isAdmin = useMemo(() => isUserAdmin(user), [user]);
  const isPremium = useMemo(() => isAdmin || Boolean((user?.user_metadata as any)?.is_premium), [isAdmin, user]);
  const credits = useMemo(() => (isAdmin ? 999999 : 100), [isAdmin]);
  const userRole: "admin" | "user" = isAdmin ? "admin" : "user";

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAdmin,
      isPremium,
      credits,
      userRole,
      adminEmail: "marketshopusafl@gmail.com",
    }),
    [user, session, loading, isAdmin, isPremium, credits, userRole]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
