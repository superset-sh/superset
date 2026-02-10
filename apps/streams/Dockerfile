FROM oven/bun:1.3.0 AS builder

# Build context must be the repo root (docker build -f apps/streams/Dockerfile .)

WORKDIR /app

# Install dependencies (workspace root)
COPY package.json bun.lock ./
COPY tooling/typescript/package.json tooling/typescript/
COPY packages/db/package.json packages/db/
COPY apps/streams/package.json apps/streams/
RUN bun install --frozen-lockfile

# Copy source
COPY tooling/typescript tooling/typescript
COPY packages/db packages/db
COPY apps/streams apps/streams

# Build
WORKDIR /app/apps/streams
RUN bun run build

# Production image
FROM oven/bun:1.3.0

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies (workspace root)
COPY package.json bun.lock ./
COPY tooling/typescript/package.json tooling/typescript/
COPY packages/db/package.json packages/db/
COPY apps/streams/package.json apps/streams/
RUN bun install --frozen-lockfile --production

# Copy built files and db package (needed at runtime for schema)
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/apps/streams/dist ./apps/streams/dist

WORKDIR /app/apps/streams

EXPOSE 8080

CMD ["bun", "dist/index.js"]
