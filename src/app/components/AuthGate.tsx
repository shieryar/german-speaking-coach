"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { configured, getOrCreateAuth, type AuthSession } from "@/lib/backend";

export default function AuthGate({ children }: { children: (session: AuthSession) => ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");

  const initialize = useCallback(async () => {
    setLoading(true);
    setProblem("");
    try { setSession(await getOrCreateAuth()); }
    catch (error) { setProblem(error instanceof Error ? error.message : "Could not open the learning space."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void initialize(); }, [initialize]);

  if (!configured()) return <main className="siteShell"><div className="panel authCard"><h1>Setup needed</h1><p>Configure Supabase and OpenAI using the README and .env.example.</p></div></main>;
  if (loading) return <main className="siteShell"><p className="authCard">Opening your learning space...</p></main>;
  if (problem) return <main className="siteShell"><section className="panel authCard">
    <span className="sectionIndex">GERMAN SPEAKING COACH</span><h1>Could not open your learning space</h1>
    <p>Check your connection and enable anonymous sign-ins in your Supabase Authentication settings, then retry.</p>
    <p role="alert" className="errorBox">{problem}</p>
    <button className="record" onClick={() => void initialize()}>Retry</button>
  </section></main>;
  if (session) return <>{children(session)}</>;
  return null;
}
