FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 13 still runs `node-gyp rebuild` on install even when a
# prebuild is bundled (WiseLibs/better-sqlite3#1503). The slim image has
# no toolchain, so the compile has to happen here in the discarded build stage.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
RUN install -d -o node -g node -m 0700 /data
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
