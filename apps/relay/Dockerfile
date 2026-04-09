FROM oven/bun:1.3.11 AS base
WORKDIR /app

# Stage 1: Prune monorepo to relay's dependency graph
FROM base AS prune
COPY . .
RUN bunx turbo prune @superset/relay --docker

# Stage 2: Install deps + copy full source
FROM base AS builder
COPY --from=prune /app/out/json/ ./
COPY patches patches
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ ./

# Stage 3: Runtime
FROM base AS runner
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 relay && \
    useradd --system --uid 1001 --gid relay relay

COPY --from=builder --chown=relay:relay /app /app

USER relay
WORKDIR /app/apps/relay

EXPOSE 8080
CMD ["bun", "run", "src/index.ts"]
