FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build

# Production image
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN npm install --omit=dev

EXPOSE 8080

CMD ["node", "dist/index.js"]
