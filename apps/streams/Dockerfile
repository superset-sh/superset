FROM oven/bun:1.3.0 AS builder

WORKDIR /app

# 1. Copy package.json files for workspace resolution
COPY package.json bun.lock ./
COPY tooling/typescript/package.json tooling/typescript/
COPY packages/db/package.json packages/db/
COPY packages/durable-session/package.json packages/durable-session/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/streams/package.json apps/streams/

# 2. Copy source code BEFORE install so install doesn't get overwritten
#    Exclude node_modules — host uses linker=isolated which breaks in container
COPY tooling/typescript tooling/typescript
COPY packages/db/src packages/db/src
COPY packages/db/tsconfig.json packages/db/
COPY packages/db/drizzle.config.ts packages/db/
COPY packages/db/drizzle packages/db/drizzle
COPY packages/durable-session/src packages/durable-session/src
COPY packages/durable-session/tsconfig.json packages/durable-session/
COPY apps/streams/src apps/streams/src
COPY apps/streams/tsconfig.json apps/streams/

# 3. Install deps AFTER source copy so node_modules aren't overwritten
#    bunfig.toml intentionally excluded — linker=isolated causes lockfile mismatch
RUN CI=false bun install --ignore-scripts

# 4. Build
WORKDIR /app/apps/streams
RUN ./node_modules/.bin/tsup src/index.ts --format esm --dts

# --- Runtime ---
FROM oven/bun:1.3.0

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/durable-session ./packages/durable-session
COPY --from=builder /app/apps/streams/dist ./apps/streams/dist
COPY --from=builder /app/apps/streams/node_modules ./apps/streams/node_modules
COPY --from=builder /app/apps/streams/package.json ./apps/streams/

WORKDIR /app/apps/streams

EXPOSE 8080

CMD ["bun", "dist/index.js"]
