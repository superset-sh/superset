ARG BUN_IMAGE
FROM ${BUN_IMAGE} AS base
ARG BUN_IMAGE
WORKDIR /app
COPY package.json ./package.json
RUN bun -e 'const expected = require("./package.json").packageManager; if (!/@sha256:[a-f0-9]{64}$/.test(process.env.BUN_IMAGE ?? "") || expected !== `bun@${Bun.version}`) { console.error("A digest-qualified image matching the source Bun version is required"); process.exit(1); }'
COPY docker/self-host/queue.ts ./docker/self-host/queue.ts
COPY docker/self-host/scheduler.ts ./docker/self-host/scheduler.ts
COPY packages/shared/src/self-host-queue.ts ./packages/shared/src/self-host-queue.ts
RUN mkdir -p /data && chown bun:bun /data
USER bun

FROM base AS queue
EXPOSE 8789
CMD ["bun", "--no-env-file", "docker/self-host/queue.ts"]

FROM base AS scheduler
CMD ["bun", "--no-env-file", "docker/self-host/scheduler.ts"]
