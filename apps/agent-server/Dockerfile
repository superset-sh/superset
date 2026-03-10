FROM node:20-slim AS base
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter agent-server build

EXPOSE 3003
CMD ["node", "apps/agent-server/dist/main.js"]
