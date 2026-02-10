FROM oven/bun:1.3.0 AS builder

WORKDIR /app

# Workspace subset for streams. CI=false avoids auto-frozen-lockfile.
# bunfig.toml intentionally excluded — linker=isolated causes lockfile mismatch.
COPY package.json bun.lock ./
COPY tooling/typescript/package.json tooling/typescript/
COPY packages/db/package.json packages/db/
COPY packages/durable-session/package.json packages/durable-session/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/streams/package.json apps/streams/
RUN CI=false bun install --ignore-scripts

COPY tooling/typescript tooling/typescript
COPY packages/db packages/db
COPY packages/durable-session packages/durable-session
COPY apps/streams apps/streams

WORKDIR /app/apps/streams
RUN bun run build

FROM oven/bun:1.3.0

WORKDIR /app

ENV NODE_ENV=production

# Root package.json needed for bun workspace resolution at runtime
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/durable-session ./packages/durable-session
COPY --from=builder /app/apps/streams/dist ./apps/streams/dist
COPY --from=builder /app/apps/streams/package.json ./apps/streams/

WORKDIR /app/apps/streams

EXPOSE 8080

CMD ["bun", "dist/index.js"]
