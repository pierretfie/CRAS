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
    }),
  )
  .handler(async ({ data }) => {
    const { queryServer } = await import("./db.server");
    return queryServer(data.text, data.params);
  });
