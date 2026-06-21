import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Activity, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  /** null = still checking; true = admin exists (hide sign-up); false = first run */
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    // Redirect already-logged-in users away from the auth page
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/analytics" });
    });

    // Check if the first admin has been created yet
    import("@/lib/api/auth.functions").then(({ checkAdminExists }) => {
      checkAdminExists().then((res) => setAdminExists(res.adminExists)).catch(() => setAdminExists(true));
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
    if (error) return toast.error(error.message);
    toast.success("Signed in");
    navigate({ to: "/analytics" });
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Extra client-side guard (server always validates too)
    if (adminExists) {
      toast.error("An administrator already exists. Please sign in.");
      return;
    }
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name"));
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const department = String(fd.get("department") || "");

    try {
      const { publicSignUp } = await import("@/lib/api/auth.functions");
      await publicSignUp({ data: { name, email, password, department } });

      // Automatically sign the first admin in
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      toast.success("Administrator account created — welcome!");
      navigate({ to: "/analytics" });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/change-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setResetSent(true);
    toast.success("Password reset email sent — check your inbox");
  }

  const isFirstRun = adminExists === false;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Activity className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">CRAS</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Conversion Rate Analytics</CardTitle>
            <CardDescription>
              {adminExists === null
                ? "Loading…"
                : isFirstRun
                  ? "First-time setup — create the administrator account"
                  : "Sign in to your workspace"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adminExists === null ? (
              // Still probing — render nothing to avoid flash of sign-up tab
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                Checking system status…
              </div>
            ) : (
              <Tabs defaultValue={isFirstRun ? "signup" : "signin"}>
                {/* Only show the tab bar when both tabs are relevant */}
                {isFirstRun ? null : (
                  <TabsList className="grid grid-cols-1 w-full">
                    <TabsTrigger value="signin">Sign In</TabsTrigger>
                  </TabsList>
                )}

                {/* ── Sign In ── */}
                <TabsContent value="signin">
                  {showReset ? (
                    <div className="space-y-4 mt-2">
                      {resetSent ? (
                        <p className="text-sm text-muted-foreground text-center">
                          Check your email for the reset link.
                        </p>
                      ) : (
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                          <p className="text-sm text-muted-foreground">Enter your email and we'll send a reset link.</p>
                          <div className="space-y-2">
                            <Label htmlFor="reset-email">Email</Label>
                            <Input
                              id="reset-email"
                              type="email"
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
                    <form onSubmit={handleSignIn} className="space-y-4 mt-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" name="password" type="password" required />
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

                {/* ── First-run Admin Bootstrap (only when no admin exists) ── */}
                {isFirstRun && (
                  <TabsContent value="signup" forceMount>
                    <div className="flex items-center gap-2 mb-4 mt-2 p-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                      <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        This form is only shown once. The account created here becomes the system administrator.
                      </p>
                    </div>
                    <form onSubmit={handleSignUp} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input id="name" name="name" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email2">Email</Label>
                        <Input id="email2" name="email" type="email" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="department">Department</Label>
                        <Input id="department" name="department" placeholder="e.g. Engineering" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password2">Password</Label>
                        <Input id="password2" name="password" type="password" minLength={6} required />
                      </div>
                      <Button className="w-full" type="submit" disabled={loading}>
                        {loading ? "Creating…" : "Create Administrator Account"}
                      </Button>
                    </form>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
