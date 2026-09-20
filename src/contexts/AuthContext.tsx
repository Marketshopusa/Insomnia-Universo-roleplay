import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
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
      setUser(s?.user ?? null);
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

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
