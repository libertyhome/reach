# Railway production image. Service builder is DOCKERFILE
# (dockerfilePath: Dockerfile). Railway overrides CMD with:
#   sh -c 'npm run db:migrate && npm run db:seed && npm run start'
# better-sqlite3@13 requires Node >= 22 (native addon; Node 20 segfaults
# on load). The build stage installs a compiler toolchain before npm ci.
# The runner keeps that compiled addon plus the TypeScript sources
# db:migrate and db:seed execute through tsx.

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Railway may expose NODE_ENV=production at build time. Dev dependencies
# (TypeScript, Tailwind) are still required for `next build`.
RUN npm ci --include=dev

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    REACH_DB_PATH=/data/reach.db

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts

# SQLite lives on the Railway volume mounted at /data.
# REACH_DB_PATH on the service overrides the default above.
RUN mkdir -p /data

EXPOSE 3000

CMD ["npm", "run", "start"]
