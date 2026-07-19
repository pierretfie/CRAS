import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Activity, ShieldCheck, Building2 } from "lucide-react";

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

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const companyName = String(fd.get("companyName") || "").trim();
    if (!companyName) {
      setLoading(false);
      return toast.error("Company name is required");
    }

    try {
      const { publicSignUp } = await import("@/lib/api/auth.functions");
      const email = String(fd.get("email"));
      const password = String(fd.get("password"));

      await publicSignUp({
        data: {
          name: String(fd.get("name")),
          email,
          password,
          department: String(fd.get("department") || "") || undefined,
          companyName,
          companyIndustry: String(fd.get("companyIndustry") || "") || undefined,
          companyWebsite:  String(fd.get("companyWebsite")  || "") || undefined,
          companyPhone:    String(fd.get("companyPhone")    || "") || undefined,
          companyAddress:  String(fd.get("companyAddress")  || "") || undefined,
        },
      });

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      toast.success("Workspace created — welcome!");
      navigate({ to: "/analytics" });
    } catch (err: any) {
      console.error(err);
      toast.error(GENERIC_REGISTER_ERROR);
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
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
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

              {/* ── Register new workspace ── */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">

                  {/* Company details */}
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Building2 className="h-4 w-4 text-primary" />
                    Company Details
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input id="companyName" name="companyName" placeholder="e.g. Acme Corp" autoComplete="organization" required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyIndustry">Industry</Label>
                      <Input id="companyIndustry" name="companyIndustry" placeholder="e.g. SaaS, Finance" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyPhone">Phone</Label>
                      <Input id="companyPhone" name="companyPhone" placeholder="+1 555 000 0000" autoComplete="tel" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyWebsite">Website</Label>
                    <Input id="companyWebsite" name="companyWebsite" type="url" placeholder="https://yourcompany.com" autoComplete="url" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyAddress">Address</Label>
                    <Input id="companyAddress" name="companyAddress" placeholder="123 Main St, City, Country" autoComplete="street-address" />
                  </div>

                  <Separator />

                  {/* Admin account */}
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Your Account
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Full Name *</Label>
                    <Input id="reg-name" name="name" autoComplete="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email *</Label>
                    <Input id="reg-email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-department">Department</Label>
                    <Input id="reg-department" name="department" placeholder="e.g. Engineering" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password *</Label>
                    <Input id="reg-password" name="password" type="password" minLength={8} autoComplete="new-password" required />
                  </div>
                  <Button className="w-full" type="submit" disabled={loading}>
                    {loading ? "Creating workspace…" : "Create Workspace"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}