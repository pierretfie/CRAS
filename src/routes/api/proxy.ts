import { createFileRoute } from "@tanstack/react-router";

const handlers: Record<string, () => Promise<any>> = {
  // DB
  "dbQuery": () => import("@/lib/db.fn").then((m) => m.dbQueryFn),
  "saveConnectionString": () => import("@/lib/db.fn").then((m) => m.saveConnectionStringFn),
  "revealConnectionString": () => import("@/lib/db.fn").then((m) => m.revealConnectionStringFn),
  "testRawConnectionString": () => import("@/lib/db.fn").then((m) => m.testRawConnectionStringFn),
  // Admin
  "adminCreateUser": () => import("@/lib/api/admin.functions").then((m) => m.adminCreateUser),
  "adminToggleUserActive": () => import("@/lib/api/admin.functions").then((m) => m.adminToggleUserActive),
  "adminUpdateUserEmail": () => import("@/lib/api/admin.functions").then((m) => m.adminUpdateUserEmail),
  "getCompany": () => import("@/lib/api/admin.functions").then((m) => m.getCompany),
  "updateCompany": () => import("@/lib/api/admin.functions").then((m) => m.updateCompany),
  "adminCreateUserInCompany": () => import("@/lib/api/admin.functions").then((m) => m.adminCreateUserInCompany),
  // AI
  "aiChatComplete": () => import("@/lib/api/ai.functions").then((m) => m.aiChatComplete),
  "normalizeClientData": () => import("@/lib/api/ai.functions").then((m) => m.normalizeClientData),
  "batchNormalizeClients": () => import("@/lib/api/ai.functions").then((m) => m.batchNormalizeClients),
  "classifyStageValueAI": () => import("@/lib/api/ai.functions").then((m) => m.classifyStageValueAI),
  // Auth
  "publicSignUp": () => import("@/lib/api/auth.functions").then((m) => m.publicSignUp),
};

export const Route = createFileRoute("/api/proxy")({
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
          const { fn, data } = await request.json();
          if (!fn || !handlers[fn]) {
            return new Response(JSON.stringify({ error: `Unknown fn: ${fn}` }), {
              status: 400,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            });
          }
          const handler = await handlers[fn]();
          // createServerFn handlers expect { data } shape
          const result = await (handler as any)({ data });
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
      },
    },
  },
});
