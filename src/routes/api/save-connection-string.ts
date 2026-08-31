import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/save-connection-string")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      },
      POST: async ({ request }) => {
        try {
          const { companyId, connectionString } = await request.json();
          if (!companyId || !connectionString) {
            return new Response(JSON.stringify({ error: { message: "Missing companyId or connectionString" } }), {
              status: 400,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            });
          }
          const { saveConnectionString } = await import("@/lib/db.server");
          const result = await saveConnectionString(companyId, connectionString);
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: { message: err?.message ?? String(err) } }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
      },
    },
  },
});
