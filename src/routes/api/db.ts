import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/db")({
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
          const { text, params, companyId } = await request.json();
          if (!text || typeof text !== "string") {
            return new Response(JSON.stringify({ data: null, error: { message: "Missing text" } }), {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            });
          }
          const { queryServer } = await import("@/lib/db.server");
          const result = await queryServer(text, params, companyId ?? null);
          return new Response(JSON.stringify(result), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ data: null, error: { message: err?.message ?? String(err) } }), {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      },
    },
  },
});
