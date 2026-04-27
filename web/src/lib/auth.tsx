import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { DEMO_MODE } from "./demoMode";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWith: (provider: "google") => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Pseudo-session for demo mode. The browser never makes auth calls in this
// state; useAuth just returns this object so the App.tsx gate falls through.
const DEMO_SESSION = {
  access_token: "demo-token",
  refresh_token: "demo",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: "u-demo",
    email: "demo@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "demo",
    created_at: new Date().toISOString(),
  },
} as unknown as Session;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(
    DEMO_MODE ? DEMO_SESSION : null
  );
  const [loading, setLoading] = useState(!DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import("./supabase").then(({ supabase }) => {
      if (!active) return;
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
        if (active) setSession(s);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      signInWith: async (provider) => {
        if (DEMO_MODE) return;
        const { supabase } = await import("./supabase");
        await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin },
        });
      },
      signOut: async () => {
        if (DEMO_MODE) {
          // "Sign out" of demo = reset state by reloading the page.
          window.location.reload();
          return;
        }
        const { supabase } = await import("./supabase");
        await supabase.auth.signOut();
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export async function getAccessToken(): Promise<string | null> {
  if (DEMO_MODE) return "demo-token";
  const { supabase } = await import("./supabase");
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
