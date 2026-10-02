# API NestJS — construite depuis la racine du monorepo :
#   docker build -f apps/api/Dockerfile .
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.34.6
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @mimo/api... \
  && pnpm --filter @mimo/api... build

FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Applique les migrations (idempotent), synchronise le contenu du jeu, puis démarre.
CMD ["sh", "-c", "npx prisma migrate deploy && node -r ts-node/register/transpile-only prisma/sync-content.ts && node dist/main.js"]
