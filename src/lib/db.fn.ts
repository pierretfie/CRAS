import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Dedicated file for the DB server function.
// Keeping createServerFn in its own file avoids the "Invalid server function ID"
// error caused by the ?tss-serverfn-split query string being embedded in a module
// path that also gets imported as a regular client module.
export const dbQueryFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      text: z.string(),
      params: z.array(z.any()).optional(),
      companyId: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { queryServer } = await import("./db.server");
    return queryServer(data.text, data.params, data.companyId);
  });

export const saveConnectionStringFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      connectionString: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { saveConnectionString } = await import("./db.server");
    return saveConnectionString(data.companyId, data.connectionString);
  });

export const revealConnectionStringFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { revealConnectionString } = await import("./db.server");
    return revealConnectionString(data.companyId);
  });

export const testRawConnectionStringFn = createServerFn({ method: "POST" })
  .validator(z.object({ connectionString: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { testRawConnectionString } = await import("./db.server");
    return testRawConnectionString(data.connectionString);
  });
