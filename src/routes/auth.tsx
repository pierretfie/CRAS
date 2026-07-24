import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

// SECURITY: generic, non-committal copy for auth-adjacent errors. Raw
// Supabase/Postgres error strings are never shown to the user — they can
// leak internal detail (constraint/column names) and, more importantly,
// let an attacker distinguish "wrong password" from "no such account" from
// "account already exists", which enables email enumeration. Real errors
// are still logged to the console for debugging.
const GENERIC_SIGNIN_ERROR = "Invalid email or password.";
const GENERIC_REGISTER_ERROR = "We couldn't create your workspace. Please check your details and try again.";
const GENERIC_RESET_ERROR = "We couldn't process that request. Please try again.";

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [idleSignOut, setIdleSignOut] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("cras-idle-signout") === "1") {
      sessionStorage.removeItem("cras-idle-signout");
      setIdleSignOut(true);
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/analytics" });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setLoading(false);
    if (error) {
      console.error(error);
      return toast.error(GENERIC_SIGNIN_ERROR);
    }
    toast.success("Signed in");
    navigate({ to: "/analytics" });
  }

  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/change-password`,
    });
    setLoading(false);
    if (error) {
      console.error(error);
      return toast.error(GENERIC_RESET_ERROR);
    }
    // Always show the same success state regardless of whether the email
    // exists — resetPasswordForEmail already avoids revealing this, and we
    // preserve that property here rather than branching on error detail.
    setResetSent(true);
    toast.success("If an account exists for that email, a reset link is on its way.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Activity className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">CRAS</h1>
        </div>

        {idleSignOut && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Your session expired due to inactivity. Please sign in again.
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Conversion Rate Analytics</CardTitle>
            <CardDescription>Sign in to your workspace or register a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="signin" className="w-full">Sign In</TabsTrigger>
                {/* <TabsTrigger value="register">Register</TabsTrigger> */}
              </TabsList>

              {/* ── Sign In ── */}
              <TabsContent value="signin">
                {showReset ? (
                  <div className="space-y-4">
                    {resetSent ? (
                      <p className="text-sm text-muted-foreground text-center">
                        Check your email for the reset link.
                      </p>
                    ) : (
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Enter your email and we'll send a reset link.
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Email</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            autoComplete="email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            required
                          />
                        </div>
                        <Button className="w-full" type="submit" disabled={loading}>
                          {loading ? "Sending…" : "Send Reset Link"}
                        </Button>
                      </form>
                    )}
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 w-full text-center"
                      onClick={() => { setShowReset(false); setResetSent(false); setResetEmail(""); }}
                    >
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input id="signin-email" name="email" type="email" autoComplete="email" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input id="signin-password" name="password" type="password" autoComplete="current-password" required />
                    </div>
                    <Button className="w-full" type="submit" disabled={loading}>
                      {loading ? "Signing in…" : "Sign In"}
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 w-full text-center"
                      onClick={() => setShowReset(true)}
                    >
                      Forgot password?
                    </button>
                  </form>
                )}
              </TabsContent>

            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}