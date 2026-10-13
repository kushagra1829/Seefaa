import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/seefaa/app-shell";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup", "forgot"]).optional() }).passthrough(),
  head: () => ({
    meta: [
      { title: "Sign in — SEEFAA" },
      { name: "description", content: "Sign in or create your SEEFAA account to start your CFA Level I plan." },
      { property: "og:title", content: "Sign in — SEEFAA" },
      { property: "og:description", content: "Access your private CFA Level I study space." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your inbox to confirm your email, then sign in.");
        else navigate({ to: "/dashboard" });
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("Password reset link sent if that email has an account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  // Returning from Google (or already signed in): forward once the session is present.
  useEffect(() => {
    let done = false;
    const go = () => { if (!done) { done = true; navigate({ to: "/dashboard", replace: true }); } };
    supabase.auth.getSession().then(({ data }) => { if (data.session) go(); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) go(); });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function google() {
    setBusy(true);
    try {
      const isLovablePreview =
        typeof window !== "undefined" &&
        ["lovableproject.com", "lovable.app", "gpt-eng.com", "lovableproject-dev.com"].some((d) =>
          window.location.hostname.endsWith(d)
        );

      if (isLovablePreview) {
        const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
        if (r.error) return toast.error(r.error.message ?? "Google sign-in failed");
        if (r.redirected) return;
        const { data } = await supabase.auth.getSession();
        if (data.session) navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sky-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card-soft editorial-shadow w-full max-w-md border-foreground p-8">
        <Logo />
        <p className="mt-7 text-xs font-bold uppercase text-primary">Your next chapter starts here.</p>
        <h1 className="mt-2 text-3xl font-bold">
          {mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}
        </h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {mode !== "forgot" && (
            <div className="space-y-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          )}
          <Button className="w-full" disabled={busy}>{mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</Button>
        </form>
        {mode !== "forgot" && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" /></div>
            <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
          </>
        )}
        <div className="mt-6 flex justify-between text-sm">
          {mode === "signin" ? (
            <>
              <Button variant="link" className="px-0" onClick={() => setMode("signup")}>Create account</Button>
              <Button variant="ghost" className="px-0 text-muted-foreground" onClick={() => setMode("forgot")}>Forgot password?</Button>
            </>
          ) : (
            <Button variant="link" className="px-0" onClick={() => setMode("signin")}>Back to sign in</Button>
          )}
        </div>
      </div>
    </div>
  );
}
