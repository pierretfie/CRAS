import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { User, KeyRound, Mail, Building2, Shield, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me, isLoading } = useCurrentUser();
  const qc = useQueryClient();

  // ── Profile fields ─────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileInitialised, setProfileInitialised] = useState(false);

  // Initialise form once profile loads (don't overwrite while typing)
  if (me && !profileInitialised) {
    setName(me.profile?.name ?? "");
    setEmail(me.user?.email ?? "");
    setDepartment(me.profile?.department ?? "");
    setProfileInitialised(true);
  }

  async function saveProfile() {
    if (!me?.user) return;
    if (!name.trim()) return toast.error("Name cannot be empty");
    setProfileSaving(true);
    try {
      // Update name + department in profiles
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ name: name.trim(), department: department.trim() || null })
        .eq("id", me.user.id);
      if (profileErr) throw profileErr;

      // Update email in auth if changed — triggers confirmation email
      const trimmedEmail = email.trim().toLowerCase();
      if (trimmedEmail && trimmedEmail !== me.user.email?.toLowerCase()) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: trimmedEmail });
        if (emailErr) throw emailErr;
        toast.success("Profile saved — check your new email address for a confirmation link");
      } else {
        toast.success("Profile updated");
      }

      qc.invalidateQueries({ queryKey: ["current-user"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Change password ────────────────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  async function changePassword() {
    if (newPwd.length < 6) return toast.error("Password must be at least 6 characters");
    if (newPwd !== confirmPwd) return toast.error("Passwords don't match");
    setPwdSaving(true);
    try {
      // Re-authenticate with current password first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No email on account");

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      });
      if (signInErr) throw new Error("Current password is incorrect");

      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;

      // Clear must_change_password flag if it was set
      await query("UPDATE profiles SET must_change_password = false WHERE id = $1", [user.id]);
      qc.invalidateQueries({ queryKey: ["current-user"] });

      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      toast.success("Password changed successfully");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to change password");
    } finally {
      setPwdSaving(false);
    }
  }

  // ── Forgot / reset password (sends email) ─────────────────────────────
  const [resetSending, setResetSending] = useState(false);

  async function sendResetEmail() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return toast.error("No email on account");
    setResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/change-password`,
      });
      if (error) throw error;
      toast.success(`Reset link sent to ${user.email}`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send reset email");
    } finally {
      setResetSending(false);
    }
  }

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!me) return null;

  const { profile, user, isAdmin } = me;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account details and password</p>
      </div>

      {/* Account summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-lg leading-tight truncate">{profile?.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {profile?.department && (
                  <Badge variant="outline" className="text-xs">
                    <Building2 className="h-3 w-3 mr-1" />{profile.department}
                  </Badge>
                )}
                <Badge variant={isAdmin ? "default" : "secondary"} className="text-xs">
                  {isAdmin
                    ? <><Shield className="h-3 w-3 mr-1" />Admin</>
                    : <><ShieldOff className="h-3 w-3 mr-1" />Member</>}
                </Badge>
                {profile?.must_change_password && (
                  <Badge variant="destructive" className="text-xs">Password change required</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> Profile Details
          </CardTitle>
          <CardDescription>Update your display name and department</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Sales, Marketing…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              Changing your email will send a confirmation link to the new address.
            </p>
          </div>
          <Button onClick={saveProfile} disabled={profileSaving} className="w-full sm:w-auto">
            {profileSaving ? "Saving…" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Change Password
          </CardTitle>
          <CardDescription>Enter your current password to set a new one</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-pwd">Current password</Label>
            <Input
              id="current-pwd"
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="Your current password"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pwd">New password</Label>
            <Input
              id="new-pwd"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pwd">Confirm new password</Label>
            <Input
              id="confirm-pwd"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </div>
          <Button
            onClick={changePassword}
            disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}
            className="w-full sm:w-auto"
          >
            {pwdSaving ? "Updating…" : "Update Password"}
          </Button>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Forgot your current password?</p>
            <p className="text-xs text-muted-foreground">
              We'll send a reset link to <span className="font-medium text-foreground">{email || user.email}</span>.
              Click the link in the email to set a new password.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={sendResetEmail}
              disabled={resetSending}
              className="gap-2"
            >
              <Mail className="h-3.5 w-3.5" />
              {resetSending ? "Sending…" : "Send reset email"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
