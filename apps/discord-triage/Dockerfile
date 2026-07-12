FROM oven/bun:1.3.14 AS base
WORKDIR /app

# Stage 1: Prune monorepo to discord-triage's dependency graph
FROM base AS prune
COPY . .
RUN bunx turbo@2.8.7 prune @superset/discord-triage --docker

# Stage 2: Install deps + copy full source
FROM base AS builder
COPY --from=prune /app/out/json/ ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ ./

# Stage 3: Runtime
FROM base AS runner
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 bot && \
    useradd --system --uid 1001 --gid bot bot

COPY --from=builder --chown=bot:bot /app /app

USER bot
WORKDIR /app/apps/discord-triage

EXPOSE 8080
CMD ["bun", "run", "src/index.ts"]
