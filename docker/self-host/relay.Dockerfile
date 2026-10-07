ARG BUN_IMAGE
ARG NODE_IMAGE
FROM ${BUN_IMAGE} AS bun
USER root
WORKDIR /app

FROM bun AS prune
ARG BUN_IMAGE
ARG NODE_IMAGE
ENV CI=1 TURBO_TELEMETRY_DISABLED=1
COPY . .
RUN bun -e 'const p=await Bun.file("package.json").json(); if (!/@sha256:[a-f0-9]{64}$/.test(process.env.BUN_IMAGE ?? "") || !/@sha256:[a-f0-9]{64}$/.test(process.env.NODE_IMAGE ?? "") || p.packageManager!==`bun@${Bun.version}` || p.devDependencies.turbo!=="2.10.9") process.exit(1);' && \
    bunx --bun turbo@2.10.9 prune @superset/relay --docker

FROM bun AS builder
ARG WORKERD_MINIMUM_VERSION
ARG WORKERD_OVERRIDE_VERSION
ARG WORKERD_OVERRIDE_SHA512
ENV CI=1 WRANGLER_SEND_METRICS=false
COPY --from=prune /app/out/json/ ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /app/out/full/ ./
COPY docker/self-host/select-workerd.mjs /app/select-workerd.mjs
WORKDIR /app/apps/relay
RUN bun x --no-install wrangler deploy --dry-run --outdir=/bundle && \
    bun /app/select-workerd.mjs

FROM ${NODE_IMAGE} AS runner
USER root
RUN (test -f /etc/debian_version && command -v groupmod && command -v usermod) || \
    { echo "NODE_IMAGE requires a Debian-based Node 24 image with UID/GID tools" >&2; exit 1; }; \
    node -e 'if(process.versions.node.split(".")[0]!=="24") process.exit(1)' && \
    if [ "$(id -u node)" != 1001 ] || [ "$(id -g node)" != 1001 ]; then \
        groupmod --gid 1001 node && usermod --uid 1001 --gid 1001 node; \
    fi && \
    mkdir -p /worker /data/durable-objects /data/placement && chown -R node:node /worker /data
WORKDIR /worker
COPY --from=builder --chown=node:node /bundle/index.js ./index.js
COPY --from=builder /bundle/workerd /usr/local/bin/workerd
COPY --from=builder --chown=node:node /bundle/workerd-runtime.json ./workerd-runtime.json
COPY --from=bun /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=bun /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem
COPY --chown=node:node docker/self-host/relay-entry.js docker/self-host/relay.capnp.in docker/self-host/render-relay-config.mjs ./
COPY --chown=node:node --chmod=0755 docker/self-host/relay-entrypoint.sh ./relay-entrypoint.sh
USER node
EXPOSE 8787
ENTRYPOINT ["/worker/relay-entrypoint.sh"]
