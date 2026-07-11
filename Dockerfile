# --- build stage: install deps, compile TS, prune to prod deps ---
FROM node:20-slim AS builder
WORKDIR /app

# better-sqlite3 ships prebuilt binaries, but keep the toolchain here in case a
# platform needs a source build. It never reaches the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies but keep better-sqlite3's compiled native binding.
RUN npm prune --omit=dev

# --- runtime stage: slim, non-root ---
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    DATABASE_PATH=/data/rollcall.db \
    PORT=8080

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# /data is where the SQLite file lives; mount a volume here in production.
RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 8080
CMD ["node", "dist/index.js"]
