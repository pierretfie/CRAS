import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Database } from "lucide-react";

export const Route = createFileRoute("/run-migrations")({
  ssr: false,
  component: RunMigrationsPage,
});

function RunMigrationsPage() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  async function handleRun() {
    setRunning(true);
    setLog([]);
    try {
      const { runMigrations } = await import("@/lib/api/migrations.functions");
      const res = await runMigrations();
      setLog(res.log);
      toast.success("Database tables initialized successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to run migrations");
      setLog((prev) => [...prev, `ERROR: ${err.message}`]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            <CardTitle>Database Setup</CardTitle>
          </div>
          <CardDescription>
            Run the SQL migrations to initialize the tables, triggers, and types in your Supabase database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleRun} disabled={running} className="w-full">
            {running ? "Initializing Tables..." : "Run Database Migrations"}
          </Button>

          {log.length > 0 && (
            <div className="rounded bg-muted p-3 font-mono text-xs space-y-1">
              {log.map((line, i) => (
                <div key={i} className={line.startsWith("ERROR") ? "text-destructive" : "text-success"}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
