FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/orchestrator/package.json packages/orchestrator/package.json
RUN npm ci --workspace packages/orchestrator --include-workspace-root

FROM deps AS build
COPY packages/orchestrator packages/orchestrator
RUN npm run prisma:generate --workspace packages/orchestrator
RUN npm run build --workspace packages/orchestrator

FROM base AS runtime
ENV NODE_ENV=production
# node_modules comes from the `build` stage, not `deps` — npm workspaces
# hoist everything (including the generated Prisma client) to the root
# node_modules, and `prisma generate` only runs in `build`.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/orchestrator/dist ./packages/orchestrator/dist
COPY --from=build /app/packages/orchestrator/prisma ./packages/orchestrator/prisma
COPY packages/orchestrator/package.json ./packages/orchestrator/package.json

WORKDIR /app/packages/orchestrator
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
