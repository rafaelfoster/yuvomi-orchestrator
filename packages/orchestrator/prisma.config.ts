import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.ORCHESTRATOR_DB_URL ?? "file:./data/orchestrator.db",
  },
});
