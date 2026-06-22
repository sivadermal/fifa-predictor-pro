import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/import-matches")({
  server: {
    handlers: {
      POST: async () => {
        const { runMatchImport } = await import("@/lib/import.server");
        const result = await runMatchImport();
        return Response.json(result);
      },
      GET: async () => {
        const { runMatchImport } = await import("@/lib/import.server");
        const result = await runMatchImport();
        return Response.json(result);
      },
    },
  },
});
