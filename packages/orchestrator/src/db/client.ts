import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/client/client.js";
import { env } from "../config/env.js";

const adapter = new PrismaBetterSqlite3({ url: env.ORCHESTRATOR_DB_URL });

export const prisma = new PrismaClient({ adapter });
