import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  component: ChangePassword,
});

function ChangePassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const pwd = String(fd.get("password"));
    const { error: pErr } = await supabase.auth.updateUser({ password: pwd });
    if (pErr) {
      setLoading(false);
      return toast.error(pErr.message);
    }
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", u.user.id);
    }
    setLoading(false);
    toast.success("Password updated");
    navigate({ to: "/analytics" });
  }

  async function skip() {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", u.user.id);
    }
    navigate({ to: "/analytics" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>You're using a temporary password. You can change it now or skip.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" minLength={6} required />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Saving..." : "Update Password"}
              </Button>
              <Button type="button" variant="outline" onClick={skip}>Skip</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
